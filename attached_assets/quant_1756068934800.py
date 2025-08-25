from __future__ import annotations
import os
import pandas as pd
from typing import Protocol
import numpy as np
from backend.core.math_engine import get_default_engine

class QuantProvider(Protocol):
    def calculate_hedge_ratio(self, p1: pd.Series, p2: pd.Series) -> float: ...
    def test_cointegration(self, p1: pd.Series, p2: pd.Series) -> float: ...
    def calculate_half_life(self, spread: pd.Series) -> float: ...
    def calculate_expected_edge(self, z: float, sstd: float, p2: float, half_life: float, sym1: str, sym2: str) -> float: ...
    def calculate_confidence(self, pval: float, half_life: float, sstd: float, n: int) -> float: ...

class LocalQuant:
    """Local NumPy/Statsmodels implementation. Default provider."""
    def __init__(self):
        self.engine = get_default_engine()
    def calculate_hedge_ratio(self, p1: pd.Series, p2: pd.Series) -> float:
        lp1 = np.log(p1)
        lp2 = np.log(p2)
        A = np.vstack([lp1, np.ones(len(lp1))]).T
        coef = self.engine.compute('lstsq', X=A, y=lp2)
        hedge = coef[0]
        return float(hedge)

    def test_cointegration(self, p1: pd.Series, p2: pd.Series) -> float:
        return float(self.engine.compute('coint_pvalue', x=p1, y=p2))

    def calculate_half_life(self, spread: pd.Series) -> float:
        return float(self.engine.compute('half_life', spread=spread))

    def calculate_expected_edge(self, z: float, sstd: float, p2: float, half_life: float, sym1: str, sym2: str) -> float:
        expected_spread_change = abs(z) * sstd * 0.5
        expected_return = expected_spread_change / max(p2, 1e-9)
        time_factor = min(1.0, 5.0 / max(half_life, 1e-9))
        trading_costs = 0.001
        funding_costs = 0.0001 * half_life
        net_edge = expected_return * time_factor - trading_costs - funding_costs
        return float(net_edge * 10000)

    def calculate_confidence(self, pval: float, half_life: float, sstd: float, n: int) -> float:
        coint_score = max(0.0, 1 - pval)
        hl_score = 1 - (min(half_life, 30.0) - 1) / 29.0
        optimal_vol = 0.02
        vol_score = max(0.0, 1 - abs(sstd - optimal_vol) / optimal_vol)
        sample_score = min(1.0, n / 200.0)
        return float(coint_score * 0.4 + hl_score * 0.3 + vol_score * 0.2 + sample_score * 0.1)

class DeepseekQuant(LocalQuant):
    """Placeholder Deepseek-backed provider.
    Currently proxies to LocalQuant but exposes a hook to route to an external service.
    Toggle with QUANT_PROVIDER=deepseek.
    """
    def __init__(self):
        self.endpoint = os.getenv('DEEPSEEK_ENDPOINT', '')
        # In future: set up client/auth here.

    # For now, inherit LocalQuant behavior. Replace methods with remote calls when available.
