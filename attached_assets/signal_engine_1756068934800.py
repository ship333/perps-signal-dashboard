import numpy as np
import pandas as pd
from typing import List, Dict, Tuple, Optional
from dataclasses import dataclass
from datetime import datetime
import structlog

logger = structlog.get_logger()

@dataclass
class TradingSignal:
    pair: Tuple[str, str]
    hedge_ratio: float
    correlation: float
    cointegration_pvalue: float
    half_life: float
    z_score: float
    spread_mean: float
    spread_std: float
    signal_type: str  # 'LONG_SPREAD', 'SHORT_SPREAD', 'NEUTRAL', 'HOLD'
    expected_edge_bps: float
    confidence: float
    timestamp: datetime
    metadata: Dict

class PerformanceTracker:
    def __init__(self):
        self.signals_history = []

    def record_signal(self, signal: TradingSignal):
        self.signals_history.append({
            'timestamp': signal.timestamp,
            'pair': signal.pair,
            'z_score': signal.z_score,
            'expected_edge': signal.expected_edge_bps,
            'confidence': signal.confidence,
        })

    def calculate_metrics(self) -> Dict:
        if not self.signals_history:
            return {'total_signals': 0, 'avg_confidence': 0.0, 'avg_expected_edge': 0.0}
        return {
            'total_signals': len(self.signals_history),
            'avg_confidence': float(np.mean([s['confidence'] for s in self.signals_history])),
            'avg_expected_edge': float(np.mean([s['expected_edge'] for s in self.signals_history])),
        }

class SignalEngine:
    def __init__(self, config, quant_provider=None):
        from backend.core.quant import LocalQuant  # local import to avoid cycles
        self.config = config
        self.quant = quant_provider or LocalQuant()
        self.price_history: Dict[str, List[Dict]] = {}
        self.signals_cache: Dict[str, TradingSignal] = {}
        self.performance_tracker = PerformanceTracker()

    def update_prices(self, price_data: List[Dict]):
        for data in price_data:
            symbol = data['symbol']
            self.price_history.setdefault(symbol, [])
            self.price_history[symbol].append({
                'timestamp': data['timestamp'],
                'price': float(data['price']),
                'volume': float(data.get('volume', 0) or 0),
                'funding': float(data.get('funding_rate', 0) or 0),
            })
            if len(self.price_history[symbol]) > getattr(self.config, 'lookback_period', 200):
                self.price_history[symbol].pop(0)

    def find_cointegrated_pairs(self) -> List[TradingSignal]:
        signals: List[TradingSignal] = []
        symbols = list(self.price_history.keys())
        for i, sym1 in enumerate(symbols):
            for sym2 in symbols[i+1:]:
                signal = self._analyze_pair(sym1, sym2)
                if signal and signal.confidence > get_attr(self.config, 'min_confidence', 0.5):
                    signals.append(signal)
        signals.sort(key=lambda x: x.expected_edge_bps, reverse=True)
        return signals[: get_attr(self.config, 'max_pairs_to_track', 10)]

    def _analyze_pair(self, sym1: str, sym2: str) -> Optional[TradingSignal]:
        try:
            p1 = pd.Series([p['price'] for p in self.price_history.get(sym1, [])])
            p2 = pd.Series([p['price'] for p in self.price_history.get(sym2, [])])
            min_samples = get_attr(self.config, 'min_samples', 30)
            if len(p1) < min_samples or len(p2) < min_samples:
                return None
            corr = float(p1.corr(p2))
            if abs(corr) < get_attr(self.config, 'min_abs_correlation', 0.3):
                return None
            hedge = self.quant.calculate_hedge_ratio(p1, p2)
            spread = p2 - hedge * p1
            pval = float(self.quant.test_cointegration(p1, p2))
            if get_attr(self.config, 'enable_coint_check', True):
                if pval > getattr(self.config, 'min_cointegration_pvalue', 0.05):
                    return None
            half_life = float(self.quant.calculate_half_life(spread))
            spread_mean = float(spread.mean())
            spread_std = float(spread.std() or 1e-9)
            z = float((spread.iloc[-1] - spread_mean) / spread_std)
            signal_type = self._determine_signal(z)
            edge = float(self.quant.calculate_expected_edge(z, spread_std, float(p2.iloc[-1]), half_life, sym1, sym2))
            conf = float(self.quant.calculate_confidence(pval, half_life, spread_std, len(p1)))
            ts = datetime.now()
            sig = TradingSignal(
                pair=(sym1, sym2),
                hedge_ratio=hedge,
                correlation=corr,
                cointegration_pvalue=pval,
                half_life=half_life,
                z_score=z,
                spread_mean=spread_mean,
                spread_std=spread_std,
                signal_type=signal_type,
                expected_edge_bps=edge,
                confidence=conf,
                timestamp=ts,
                metadata={'spread_history': spread.tail(30).tolist(), 'prices': {sym1: float(p1.iloc[-1]), sym2: float(p2.iloc[-1])}},
            )
            self.performance_tracker.record_signal(sig)
            return sig
        except Exception as e:
            logger.error(f"Analyze pair {sym1}/{sym2} failed: {e}")
            return None

    def _determine_signal(self, z: float) -> str:
        if z > getattr(self.config, 'z_score_entry', 2.0):
            return 'SHORT_SPREAD'
        elif z < -getattr(self.config, 'z_score_entry', 2.0):
            return 'LONG_SPREAD'
        elif abs(z) < getattr(self.config, 'z_score_exit', 0.5):
            return 'NEUTRAL'
        return 'HOLD'


def get_attr(obj, name, default):
    return getattr(obj, name, default)
