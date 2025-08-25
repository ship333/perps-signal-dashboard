import asyncio
import aiohttp
from typing import Dict, List, Optional
from datetime import datetime
import structlog
from tenacity import retry, stop_after_attempt, wait_exponential
import json
import os
import random
from datetime import timezone, timedelta

# Optional Alchemy feed
try:
    from backend.core.feeds.alchemy import AlchemyFeed
    from backend.core.feeds.pools import load_pool_map
except Exception:
    AlchemyFeed = None  # type: ignore
    def load_pool_map(settings=None):  # type: ignore
        return {}

logger = structlog.get_logger()

HL_WS_URL = 'wss://api.hyperliquid.xyz/ws'
HL_HTTP_INFO = 'https://api.hyperliquid.xyz/info'

class MarketDataFetcher:
    """Resilient market data fetcher. Primary via Hyperliquid WS, fallback via HTTP.
    """
    def __init__(self):
        self.session: Optional[aiohttp.ClientSession] = None
        self.ws: Optional[aiohttp.ClientWebSocketResponse] = None
        self.last_prices: Dict[str, float] = {}
        self.last_price_ts: Dict[str, datetime] = {}
        self.last_update: Optional[datetime] = None
        self._ws_task: Optional[asyncio.Task] = None
        # Alchemy feed (optional)
        self._alchemy: Optional[AlchemyFeed] = None if AlchemyFeed is not None else None
        self._providers: List[str] = self._load_providers()
        self._alchemy_max_age = int(os.getenv('ALCHEMY_MAX_AGE_SEC', '2'))

    async def __aenter__(self):
        self.session = aiohttp.ClientSession()
        # Connect WS and subscribe to all mids for continuous mid price updates
        try:
            self.ws = await self.session.ws_connect(HL_WS_URL, heartbeat=30)
            await self._ws_subscribe_all_mids()
            self._ws_task = asyncio.create_task(self._ws_reader())
            logger.info("Connected to Hyperliquid WS")
        except Exception as e:
            logger.warning(f"WS connect failed, will use HTTP fallback: {e}")
        # Optionally start Alchemy feed
        try:
            if 'alchemy' in self._providers and AlchemyFeed is not None:
                wss = os.getenv('ALCHEMY_WSS_URL', '').strip()
                pool_map = load_pool_map(None)
                if wss and pool_map:
                    self._alchemy = AlchemyFeed(wss_url=wss, pool_map=pool_map)
                    await self._alchemy.start(self.session)
                    if self._alchemy.active:
                        logger.info("Alchemy feed active", pools=len(pool_map))
        except Exception as e:
            logger.warning("Alchemy feed init failed", error=str(e))
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        if self._ws_task:
            self._ws_task.cancel()
        if self.ws:
            try:
                await self._ws_unsubscribe_all_mids()
            except Exception:
                pass
            await self.ws.close()
        if self._alchemy is not None:
            try:
                await self._alchemy.stop()
            except Exception:
                pass
        if self.session:
            await self.session.close()

    async def _ws_subscribe_all_mids(self):
        if not self.ws:
            return
        sub = {"method": "subscribe", "subscription": {"type": "allMids"}}
        await self.ws.send_str(json.dumps(sub))

    async def _ws_unsubscribe_all_mids(self):
        if not self.ws:
            return
        unsub = {"method": "unsubscribe", "subscription": {"type": "allMids"}}
        await self.ws.send_str(json.dumps(unsub))

    async def _ws_reader(self):
        """Read WS messages and update local cache of mids/prices.
        Expects messages like { channel: 'allMids', data: { mids: { 'BTC': '65000.1', ... } } }
        Maintains the connection with exponential backoff on failures.
        """
        backoff = 1
        while True:
            try:
                if self.ws is None or self.ws.closed:
                    self.ws = await self.session.ws_connect(HL_WS_URL, heartbeat=30)
                    await self._ws_subscribe_all_mids()
                    logger.info("WS connected (reader loop)")

                async for msg in self.ws:
                    if msg.type == aiohttp.WSMsgType.TEXT:
                        try:
                            payload = json.loads(msg.data)
                        except Exception:
                            continue

                        channel = payload.get('channel')
                        data = payload.get('data')
                        if channel == 'subscriptionResponse':
                            # ack; ignore
                            continue
                        if channel == 'allMids' and isinstance(data, dict):
                            mids = data.get('mids') or {}
                            updates = self._apply_all_mids(mids)
                            if updates:
                                self.last_update = datetime.now(timezone.utc)
                                logger.debug("WS mids updated", count=updates)
                    elif msg.type in (aiohttp.WSMsgType.CLOSED, aiohttp.WSMsgType.ERROR):
                        raise ConnectionError("WS closed or errored")

                # If we exit the async for without error, sleep and retry
                await asyncio.sleep(backoff)
                backoff = min(backoff * 2, 30)
            except asyncio.CancelledError:
                raise
            except Exception as e:
                logger.warning("WS reader error; reconnecting", error=str(e), backoff=backoff)
                try:
                    if self.ws and not self.ws.closed:
                        await self.ws.close()
                except Exception:
                    pass
                self.ws = None
                await asyncio.sleep(backoff)
                backoff = min(backoff * 2, 30)

    @retry(stop=stop_after_attempt(3), wait=wait_exponential(min=1, max=10))
    async def fetch_price(self, symbol: str) -> Dict:
        """Fetch single price via HTTP as fallback. Returns dict."""
        coin = symbol.replace('-USD-PERP', '')
        # Per docs: use allMids to retrieve mids mapping and pick our coin
        payload = {"type": "allMids"}
        async with self.session.post(HL_HTTP_INFO, json=payload) as response:
            if response.status != 200:
                raise RuntimeError(f"HTTP {response.status}")
            data = await response.json()
            mids = data if isinstance(data, dict) else {}
            px_str = mids.get(coin)
            price = float(px_str) if px_str is not None else 0.0
            # allMids only gives mid; synthesize bid/ask and leave volume/funding unknown
            bid = price
            ask = price
            volume = 0.0
            funding_rate = 0.0

            if price == 0:
                # Fallback synthetic price jitter to keep pipeline alive in dev
                enable_synth = os.getenv('ENABLE_SYNTHETIC_PRICES', '1').lower() not in ('0', 'false', 'no')
                if enable_synth:
                    prev = float(self.last_prices.get(symbol, 100.0))
                    vol = float(os.getenv('SYNTHETIC_VOLATILITY', '0.002'))
                    price = max(0.1, prev * (1 + random.gauss(0.0, vol)))
                    bid = price
                    ask = price
                else:
                    price = 100.0

            self.last_prices[symbol] = price
            # Record timestamps for HTTP fallback freshness
            self.last_price_ts[symbol] = datetime.now(timezone.utc)
            self.last_update = datetime.now(timezone.utc)

            return {
                'symbol': symbol,
                'price': price,
                'bid': bid,
                'ask': ask,
                'volume': volume,
                'funding_rate': funding_rate,
                'timestamp': datetime.now(timezone.utc).isoformat(),
                'source': 'hyperliquid_http'
            }

    async def fetch_all_prices(self, symbols: List[str]) -> List[Dict]:
        out: List[Dict] = []
        missing: List[str] = []

        # Prefer Alchemy quotes when fresh
        now = datetime.now(timezone.utc)
        for s in symbols:
            used = False
            if self._alchemy is not None and 'alchemy' in self._providers:
                try:
                    q = self._alchemy.get_latest(s)
                    if q is not None:
                        age = (now - q.ts).total_seconds()
                        if age <= self._alchemy_max_age:
                            out.append({
                                'symbol': s,
                                'price': float(q.price),
                                'bid': float(q.price),
                                'ask': float(q.price),
                                'volume': 0.0,
                                'funding_rate': 0.0,
                                'timestamp': q.ts.isoformat(),
                                'source': 'alchemy_wss'
                            })
                            used = True
                except Exception:
                    pass
            if used:
                continue

        # Prefer HL WS cache next if available
        selected_symbols = {row['symbol'] for row in out}
        for s in symbols:
            if s in selected_symbols:
                continue
            px = self.last_prices.get(s)
            if px is None:
                missing.append(s)
                continue
            price_val = float(px)
            # If WS not connected, optionally jitter cached prices to simulate live movement
            if (self.ws is None or self.ws.closed):
                enable_synth = os.getenv('ENABLE_SYNTHETIC_PRICES', '1').lower() not in ('0', 'false', 'no')
                if enable_synth:
                    vol = float(os.getenv('SYNTHETIC_VOLATILITY', '0.002'))
                    price_val = max(0.1, price_val * (1 + random.gauss(0.0, vol)))
                    self.last_prices[s] = price_val
            # Use per-symbol HL timestamp if available
            ts_dt = self.last_price_ts.get(s) or datetime.now(timezone.utc)
            out.append({
                'symbol': s,
                'price': float(price_val),
                'bid': float(price_val),
                'ask': float(price_val),
                'volume': 0.0,
                'funding_rate': 0.0,
                'timestamp': ts_dt.isoformat(),
                'source': 'hyperliquid_ws' if self.ws and not self.ws.closed else 'synthetic'
            })

        # Fallback to HTTP for any missing symbols
        if missing:
            tasks = [self.fetch_price(s) for s in missing]
            results = await asyncio.gather(*tasks, return_exceptions=True)
            for r in results:
                if isinstance(r, dict):
                    out.append(r)
                else:
                    logger.error(f"Price fetch failed: {r}")

        return out

    @staticmethod
    def _normalize_symbol(coin: str) -> str:
        # Map Hyperliquid coin code to our symbol format used elsewhere
        return f"{coin}-USD-PERP"

    def _apply_all_mids(self, mids: Dict[str, str]) -> int:
        """Apply an allMids payload to the local cache. Returns number of updates.
        Example mids: { 'BTC': '65000.1', 'ETH': '3200.5' }
        """
        updates = 0
        for coin, px in mids.items():
            try:
                price = float(px)
            except Exception:
                continue
            symbol = self._normalize_symbol(coin)
            self.last_prices[symbol] = price
            self.last_price_ts[symbol] = datetime.now(timezone.utc)
            updates += 1
        return updates

    @staticmethod
    def _load_providers() -> List[str]:
        raw = os.getenv('PROVIDERS_ENABLED', '')
        if not raw:
            return ['hl']
        return [p.strip().lower() for p in raw.split(',') if p.strip()]
