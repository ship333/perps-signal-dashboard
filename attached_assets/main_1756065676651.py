from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, StreamingResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
import json
import asyncio
from datetime import datetime, timezone
from typing import List, Dict, Any, Optional
import structlog

from backend.app.config import settings
from backend.app.models import SignalResponse, SystemStatus
from backend.app.database import get_db, save_signal, fetch_signals, init_db
from backend.core.data_fetcher import MarketDataFetcher
from backend.core.signal_engine import SignalEngine
from backend.core.cache import RedisCache
from backend.core.quant import LocalQuant, DeepseekQuant

structlog.configure(
    processors=[
        structlog.stdlib.filter_by_level,
        structlog.stdlib.add_logger_name,
        structlog.stdlib.add_log_level,
        structlog.stdlib.PositionalArgumentsFormatter(),
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.StackInfoRenderer(),
        structlog.processors.format_exc_info,
        structlog.dev.ConsoleRenderer(),
    ],
    context_class=dict,
    logger_factory=structlog.stdlib.LoggerFactory(),
    cache_logger_on_first_use=True,
)
logger = structlog.get_logger()

app = FastAPI(title="Hyperliquid Signals API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global singletons
provider_name = (settings.quant_provider or 'local').lower()
quant_provider = DeepseekQuant() if provider_name == 'deepseek' else LocalQuant()
signal_engine = SignalEngine(settings, quant_provider=quant_provider)
cache = RedisCache(settings.redis_url)
connected_websockets: List[WebSocket] = []
last_price_update: datetime | None = None
provider_status: Dict[str, Any] = {"alchemyActive": False, "hlWsConnected": False}
sse_subscribers: List[asyncio.Queue[str]] = []
debouncer = None  # set on startup

# Mount frontend
app.mount("/static", StaticFiles(directory="frontend"), name="static")

@app.on_event("startup")
async def startup_event():
    # Initialize database; degrade gracefully if unavailable in local dev
    try:
        await init_db()
    except Exception as e:
        logger.warning("DB init failed; continuing without DB", error=str(e))
    logger.info("Starting background tasks")
    # Initialize debouncer for event-driven compute
    if settings.event_driven_compute:
        class Debouncer:
            def __init__(self, delay_sec: float, coro_func):
                self.delay = delay_sec
                self.coro = coro_func
                self._task: Optional[asyncio.Task] = None

            def trigger(self):
                if self._task and not self._task.done():
                    self._task.cancel()
                self._task = asyncio.create_task(self._run())

            async def _run(self):
                try:
                    await asyncio.sleep(self.delay)
                    await self.coro()
                except asyncio.CancelledError:
                    pass
                except Exception as e:
                    logger.error("debounce_run_error", error=str(e))

        globals()['debouncer'] = Debouncer(1.0, compute_best)
    asyncio.create_task(market_data_loop())
    if not settings.event_driven_compute:
        asyncio.create_task(signal_generation_loop())

@app.on_event("shutdown")
async def shutdown_event():
    await cache.close()

async def market_data_loop():
    global last_price_update
    async with MarketDataFetcher() as fetcher:
        while True:
            try:
                prices = await fetcher.fetch_all_prices(settings.symbols)
                signal_engine.update_prices(prices)
                await cache.set("latest_prices", prices, ttl=settings.cache_ttl)
                last_price_update = datetime.now()
                # Update provider status from fetcher state and latest batch sources
                try:
                    hl_ok = bool(getattr(fetcher, 'ws', None) and not getattr(fetcher.ws, 'closed', True))
                except Exception:
                    hl_ok = False
                try:
                    al_ok = bool(getattr(fetcher, '_alchemy', None) and getattr(fetcher._alchemy, 'active', False))
                except Exception:
                    al_ok = False
                provider_status.update({"alchemyActive": al_ok, "hlWsConnected": hl_ok})
                # Event-driven: debounce compute on each batch
                if settings.event_driven_compute and globals().get('debouncer') is not None:
                    globals()['debouncer'].trigger()
                logger.info(f"Prices updated for {len(prices)} symbols")
            except Exception as e:
                logger.error(f"Market data loop error: {e}")
            await asyncio.sleep(settings.update_interval)

async def signal_generation_loop():
    await asyncio.sleep(5)
    while True:
        try:
            await compute_best()
        except Exception as e:
            logger.error(f"Signal generation error: {e}")
        await asyncio.sleep(settings.update_interval)

async def compute_best():
    signals = signal_engine.find_cointegrated_pairs()
    if signals:
        best = signals[0]
        # Save to DB if available; don't block caching/broadcast on DB failures in local dev
        try:
            await save_signal(best)
        except Exception as e:
            logger.warning("save_signal_failed; continuing", error=str(e))
        payload = SignalResponse.from_signal(best).model_dump()
        await cache.set("best_signal", payload, ttl=settings.cache_ttl)
        await broadcast_signal(best)
        await broadcast_sse(payload)
        logger.info(f"Best signal: {best.pair} z={best.z_score:.2f}")

async def broadcast_signal(signal):
    message = json.dumps({
        'type': 'signal_update',
        'data': SignalResponse.from_signal(signal).model_dump()
    }, default=str)
    for ws in list(connected_websockets):
        try:
            await ws.send_text(message)
        except Exception:
            try:
                connected_websockets.remove(ws)
            except ValueError:
                pass

@app.get("/")
async def root():
    # Serve the statics-mounted index so relative asset paths resolve under /static
    return RedirectResponse(url="/static/index.html")

@app.get("/api/signals/current")
async def get_current_signal():
    data = await cache.get("best_signal")
    if not data:
        raise HTTPException(status_code=404, detail="No signals available")
    return data

@app.get("/api/signals/history")
async def get_signal_history(limit: int = 50):
    return await fetch_signals(limit=limit)

@app.get("/api/prices/latest")
async def get_latest_prices():
    prices = await cache.get("latest_prices")
    if not prices:
        raise HTTPException(status_code=404, detail="No price data available")
    return prices

@app.get("/api/system/status")
async def get_system_status():
    freshness = None
    if last_price_update is not None:
        try:
            freshness = int((datetime.now() - last_price_update).total_seconds())
        except Exception:
            freshness = None
    return SystemStatus(
        status="healthy",
        uptime=datetime.now().isoformat(),
        data_freshness=freshness,
        active_pairs=len(signal_engine.price_history),
        websocket_connections=len(connected_websockets),
    )

@app.get("/healthz")
async def healthz():
    # Summarize latest price age and sources per symbol
    latest = await cache.get("latest_prices") or []
    now = datetime.now(timezone.utc)
    symbols: Dict[str, Dict[str, Any]] = {}
    for row in latest:
        try:
            sym = row.get('symbol')
            ts = row.get('timestamp')
            tdt = datetime.fromisoformat(ts) if isinstance(ts, str) else ts
            age_ms = int((now - tdt).total_seconds() * 1000)
            symbols[sym] = {"source": row.get('source'), "ageMs": age_ms}
        except Exception:
            continue
    return {
        "ok": True,
        "lastPriceWriteIso": datetime.now(timezone.utc).isoformat(),
        "providers": provider_status,
        "symbols": symbols,
    }

@app.get("/api/signals/top-hedge/best")
async def get_top_hedge_best(windows: str = "24h,6h,1h"):
    """Return the best pair per requested window with per-leg pct changes and sides mapping.
    Window sizes are approximated by point counts: 1h->20, 6h->50, 24h->200.
    Sides are derived from window z-score using the engine's determine logic.
    """
    from itertools import combinations
    import pandas as pd

    req_windows = [w.strip() for w in windows.split(",") if w.strip()]
    window_points = {"1h": 20, "6h": 50, "24h": 200}

    symbols = list(signal_engine.price_history.keys())
    out_windows = []
    now_iso = datetime.now().isoformat()

    for w in req_windows:
        n = window_points.get(w, 20)
        best = None
        best_score = -1.0
        best_row = None
        for a, b in combinations(symbols, 2):
            p1_full = [p['price'] for p in signal_engine.price_history.get(a, [])]
            p2_full = [p['price'] for p in signal_engine.price_history.get(b, [])]
            if len(p1_full) < 5 or len(p2_full) < 5:
                continue
            p1 = pd.Series(p1_full[-n:])
            p2 = pd.Series(p2_full[-n:])
            try:
                hedge = signal_engine.quant.calculate_hedge_ratio(p1, p2)
                spread = p2 - hedge * p1
            except Exception:
                continue
            # z-score on window
            mean = float(spread.mean())
            std = float(spread.std() or 1e-9)
            z = float((float(spread.iloc[-1]) - mean) / std)
            side_type = signal_engine._determine_signal(z)
            # per-leg pct change over window
            def pct(series):
                base = float(series.iloc[0])
                last = float(series.iloc[-1])
                return (last - base) / max(abs(base), 1e-9)
            pa = float(pct(p1))
            pb = float(pct(p2))
            # ranking by absolute divergence between legs
            score = abs(pb - pa)
            if score > best_score:
                best_score = score
                best_row = {
                    "window": w,
                    "pair": {"a": a, "b": b},
                    "sides": ( {"a": "LONG", "b": "SHORT"} if side_type == "SHORT_SPREAD" else {"a": "SHORT", "b": "LONG"} ),
                    "pctChange": {"a": pa, "b": pb},
                }
        if best_row:
            out_windows.append(best_row)

    return {"asOf": now_iso, "windows": out_windows}

@app.get("/api/signals/best-long-short")
async def get_best_long_short():
    """Expose the current best long/short pair with metrics and simple price charts for both legs."""
    import pandas as pd

    # Try cached best signal first
    cached = await cache.get("best_signal")
    sig = None
    if cached:
        try:
            # Cached is already dict in SignalResponse shape
            sig = cached
        except Exception:
            sig = None
    if not sig:
        # Fallback to compute fresh
        signals = signal_engine.find_cointegrated_pairs()
        if not signals:
            raise HTTPException(status_code=404, detail="No signals available")
        best = signals[0]
        sig = SignalResponse.from_signal(best).model_dump()

    a, b = sig["pair"]
    # Determine sides from signal_type consistent with frontend getDirection()
    # LONG_SPREAD => Long second (b), Short first (a). SHORT_SPREAD => Long first (a), Short second (b).
    st = sig.get("signal_type")
    sides = {"a": "LONG", "b": "SHORT"} if st == "SHORT_SPREAD" else {"a": "SHORT", "b": "LONG"}

    # Prepare charts from price history
    def to_chart(sym: str):
        series = signal_engine.price_history.get(sym, [])
        out = []
        for row in series[-200:]:
            t = row.get('timestamp')
            # Ensure ISO string
            ts = t if isinstance(t, str) else (t.isoformat() if hasattr(t, 'isoformat') else str(t))
            out.append({"t": ts, "p": float(row.get('price', 0.0))})
        return out

    charts = {"a": to_chart(a), "b": to_chart(b)}

    # Compute simple spread-based pct changes (24h,6h,1h)
    p1 = pd.Series([p['price'] for p in signal_engine.price_history.get(a, [])])
    p2 = pd.Series([p['price'] for p in signal_engine.price_history.get(b, [])])
    pct24 = pct6 = pct1 = 0.0
    if len(p1) >= 5 and len(p2) >= 5:
        hedge = signal_engine.quant.calculate_hedge_ratio(p1, p2)
        spread = p2 - hedge * p1
        def pct_over(n):
            idx = max(0, len(spread) - n)
            base = float(spread.iloc[idx])
            last = float(spread.iloc[-1])
            return (last - base) / max(abs(base), 1e-9)
        pct24 = float(pct_over(200))
        pct6 = float(pct_over(50))
        pct1 = float(pct_over(20))

    # Collect quote meta per leg
    prices = await cache.get("latest_prices") or []
    meta_map = {row['symbol']: row for row in prices if isinstance(row, dict) and 'symbol' in row}
    def leg_meta(sym: str):
        row = meta_map.get(sym)
        if not row:
            return {"source": None, "ageMs": None}
        try:
            ts = row.get('timestamp')
            tdt = datetime.fromisoformat(ts) if isinstance(ts, str) else ts
            age = int((datetime.now(timezone.utc) - tdt).total_seconds() * 1000)
        except Exception:
            age = None
        return {"source": row.get('source'), "ageMs": age}

    resp = {
        "asOf": datetime.now().isoformat(),
        "pair": {"a": a, "b": b},
        "sides": sides,
        "metrics": {
            "zScore": float(sig.get("z_score", 0.0)),
            "hedgeRatio": float(sig.get("hedge_ratio", 0.0)),
            "confidence": float(sig.get("confidence", 0.0)),
            "edgeBps": float(sig.get("expected_edge_bps", 0.0)),
            "pctChange24h": pct24,
            "pctChange6h": pct6,
            "pctChange1h": pct1,
        },
        "charts": charts,
        "quoteMeta": {"a": leg_meta(a), "b": leg_meta(b)},
    }
    return resp

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    connected_websockets.append(websocket)
    try:
        data = await cache.get("best_signal")
        if data:
            await websocket.send_json({'type': 'initial_signal', 'data': data})
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        try:
            connected_websockets.remove(websocket)
        except ValueError:
            pass

async def broadcast_sse(payload: Dict[str, Any]):
    if not sse_subscribers:
        return
    msg = f"data: {json.dumps(payload)}\n\n"
    for q in list(sse_subscribers):
        try:
            q.put_nowait(msg)
        except Exception:
            try:
                sse_subscribers.remove(q)
            except ValueError:
                pass

@app.get("/api/metrics")
async def get_metrics():
    metrics = signal_engine.performance_tracker.calculate_metrics()
    out = []
    for k, v in metrics.items():
        out.append(f"# TYPE {k} gauge")
        out.append(f"{k} {v}")
    return StreamingResponse(iter(["\n".join(out)]), media_type="text/plain")

@app.get("/api/stream/best")
async def stream_best():
    async def event_gen(queue: asyncio.Queue[str]):
        # send initial if available
        cached = await cache.get("best_signal")
        if cached:
            yield f"data: {json.dumps(cached)}\n\n"
        try:
            while True:
                try:
                    msg = await asyncio.wait_for(queue.get(), timeout=10.0)
                    yield msg
                except asyncio.TimeoutError:
                    yield ": keep-alive\n\n"
        except asyncio.CancelledError:
            return

    q: asyncio.Queue[str] = asyncio.Queue()
    sse_subscribers.append(q)
    return StreamingResponse(event_gen(q), media_type="text/event-stream")

@app.post("/api/replay/prices")
async def replay_prices(prices: List[Dict[str, Any]]):
    # Feed a batch of price rows into the in-process signal engine.
    # Each row should match the dict format produced by MarketDataFetcher / backfill converter.
    try:
        signal_engine.update_prices(prices)
        return {"ok": True, "count": len(prices)}
    except Exception as e:
        logger.error(f"Replay error: {e}")
        raise HTTPException(status_code=400, detail=str(e))
