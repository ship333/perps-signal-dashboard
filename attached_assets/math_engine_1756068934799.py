from __future__ import annotations
import math
import time
from typing import Protocol, Any, Dict, List, Optional

import numpy as np
import pandas as pd
from statsmodels.tsa.stattools import coint


class MathProvider(Protocol):
    def compute(self, operation: str, **params) -> Any:
        ...

    def supports(self, operation: str) -> bool:
        ...

    def get_capabilities(self) -> List[str]:
        ...


class NumPyProvider:
    """
    Wraps NumPy/SciPy/Pandas for common statistical and linear algebra ops.
    Operations:
      - mean(series)
      - std(series, ddof=1)
      - corr(x, y)
      - lstsq(X, y) -> coef
      - coint_pvalue(x, y)
      - half_life(spread)
      - z_score(value, mean, std)
    """

    def __init__(self):
        self._caps = {
            'mean', 'std', 'corr', 'lstsq', 'coint_pvalue', 'half_life', 'z_score'
        }

    def supports(self, operation: str) -> bool:
        return operation in self._caps

    def get_capabilities(self) -> List[str]:
        return sorted(self._caps)

    def compute(self, operation: str, **params) -> Any:
        if operation == 'mean':
            s: pd.Series = params['series']
            return float(pd.Series(s).mean())
        if operation == 'std':
            s: pd.Series = params['series']
            ddof: int = params.get('ddof', 1)
            return float(pd.Series(s).std(ddof=ddof))
        if operation == 'corr':
            x: pd.Series = params['x']
            y: pd.Series = params['y']
            return float(pd.Series(x).corr(pd.Series(y)))
        if operation == 'lstsq':
            X: np.ndarray = np.asarray(params['X'])
            y: np.ndarray = np.asarray(params['y'])
            coef, *_ = np.linalg.lstsq(X, y, rcond=None)
            return coef
        if operation == 'coint_pvalue':
            x: pd.Series = params['x']
            y: pd.Series = params['y']
            _, pvalue, _ = coint(x, y)
            return float(pvalue)
        if operation == 'half_life':
            spread: pd.Series = pd.Series(params['spread'])
            spread_lag = spread.shift(1).dropna()
            spread_diff = spread.diff().dropna()
            X = spread_lag.values.reshape(-1, 1)
            y = spread_diff.values
            alpha = -np.linalg.lstsq(X, y, rcond=None)[0][0]
            if alpha > 0:
                hl = -np.log(2) / np.log(1 - alpha)
                return float(min(hl, 30.0))
            return 30.0
        if operation == 'z_score':
            value: float = float(params['value'])
            mean: float = float(params['mean'])
            std: float = max(float(params['std']), 1e-12)
            return float((value - mean) / std)
        raise ValueError(f"Unsupported operation: {operation}")


class DeepseekMathProvider:
    """
    Placeholder provider for Deepseek-backed computations.
    Currently proxies to NumPyProvider, but exposes the same capabilities so we can A/B swap.
    """
    def __init__(self, fallback: Optional[MathProvider] = None):
        self._np = fallback or NumPyProvider()
        self._caps = set(self._np.get_capabilities())

    def supports(self, operation: str) -> bool:
        return operation in self._caps

    def get_capabilities(self) -> List[str]:
        return sorted(self._caps)

    def compute(self, operation: str, **params) -> Any:
        # In future: route to remote Deepseek service.
        return self._np.compute(operation, **params)


class MathEngine:
    """Simple registry/dispatcher for math providers."""

    def __init__(self):
        self._providers: List[MathProvider] = []

    def register_provider(self, provider: MathProvider, prepend: bool = False):
        if prepend:
            self._providers.insert(0, provider)
        else:
            self._providers.append(provider)

    def providers(self) -> List[MathProvider]:
        return list(self._providers)

    def compute(self, operation: str, **params):
        for p in self._providers:
            if p.supports(operation):
                return p.compute(operation, **params)
        raise ValueError(f"No provider supports operation '{operation}'")

    def compute_with_timing(self, operation: str, **params):
        start = time.perf_counter()
        result = self.compute(operation, **params)
        elapsed = time.perf_counter() - start
        return result, elapsed


# Default engine with NumPy provider registered
_default_engine = MathEngine()
_default_engine.register_provider(NumPyProvider())


def get_default_engine() -> MathEngine:
    return _default_engine
