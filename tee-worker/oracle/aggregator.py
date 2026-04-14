"""
oracle/aggregator.py — Multi-Oracle Price Aggregation

Fetches asset prices from three independent oracle sources (Pyth Network,
Chainlink Data Feeds, and on-chain TWAP), then computes the median to produce
a manipulation-resistant price feed for the trading strategy.

Raises OracleDeviationError if any oracle diverges beyond the 2% threshold,
preventing the agent from acting on potentially corrupted price data.

# 0G INTEGRATION: All `fetch_*` functions will call live oracle APIs/contracts
# when deployed on 0G Chain.
"""

import random
import statistics
from typing import Any


# ---------------------------------------------------------------------------
# Custom exceptions
# ---------------------------------------------------------------------------

class OracleDeviationError(Exception):
    """
    Raised when oracle price sources diverge beyond the acceptable threshold.

    This is a safety mechanism: if oracles disagree by more than 2%, the
    agent should refuse to execute trades and fall back to REDUCE_ONLY mode.

    Attributes
    ----------
    deviation_pct : float
        The actual deviation percentage that triggered the error.
    prices : dict[str, float]
        Dict of oracle name → price at the time of the error.
    """

    def __init__(self, deviation_pct: float, prices: dict[str, float]) -> None:
        self.deviation_pct = deviation_pct
        self.prices = prices
        super().__init__(
            f"Oracle deviation {deviation_pct:.4f}% exceeds 2% threshold. "
            f"Prices: {prices}"
        )


# ---------------------------------------------------------------------------
# Base simulated prices (realistic ETH price range for simulation)
# ---------------------------------------------------------------------------

_BASE_PRICE_USD: dict[str, float] = {
    "ETH": 3_142.50,
    "BTC": 67_800.00,
    "OG":  1.85,
}


def _base_price(asset: str) -> float:
    """Return the base simulated price for an asset."""
    return _BASE_PRICE_USD.get(asset.upper(), 100.0)


# ---------------------------------------------------------------------------
# Individual oracle fetch functions
# ---------------------------------------------------------------------------

def fetch_pyth_price(asset: str) -> float:
    """
    Fetch the current asset price from Pyth Network.

    Returns a simulated price with slight random noise to mimic real
    oracle variability.

    Parameters
    ----------
    asset : str
        Asset ticker symbol (e.g. ``"ETH"``, ``"BTC"``).

    Returns
    -------
    float
        Current asset price in USD as reported by Pyth.

    Notes
    -----
    # In production: call Pyth Network Hermes API
    #   GET https://hermes.pyth.network/v2/updates/price/latest
    #   with price_ids=[<PYTH_FEED_ID_FOR_ASSET>]
    # 0G INTEGRATION: Route via 0G Compute verified data channel.
    """
    base = _base_price(asset)
    # Simulate up to ±0.5% noise around base price
    noise_pct = random.uniform(-0.005, 0.005)
    return round(base * (1 + noise_pct), 4)


def fetch_chainlink_price(asset: str) -> float:
    """
    Fetch the current asset price from Chainlink Data Feeds.

    Returns a simulated price that is slightly offset from Pyth to
    represent realistic inter-oracle variance.

    Parameters
    ----------
    asset : str
        Asset ticker symbol (e.g. ``"ETH"``, ``"BTC"``).

    Returns
    -------
    float
        Current asset price in USD as reported by Chainlink.

    Notes
    -----
    # In production: call Chainlink Data Feeds on 0G Chain
    #   AggregatorV3Interface.latestRoundData() on the deployed feed contract.
    # 0G INTEGRATION: Use 0G Chain RPC to call the Chainlink feed contract.
    """
    base = _base_price(asset)
    # Chainlink tends to lag slightly — simulate with a small systematic offset
    noise_pct = random.uniform(-0.004, 0.006)
    return round(base * (1 + noise_pct), 4)


def fetch_twap_price(asset: str) -> float:
    """
    Fetch the Time-Weighted Average Price (TWAP) for an asset.

    Returns a simulated TWAP that smooths short-term volatility, typically
    slightly more stable than spot oracle prices.

    Parameters
    ----------
    asset : str
        Asset ticker symbol (e.g. ``"ETH"``, ``"BTC"``).

    Returns
    -------
    float
        TWAP of the asset over the simulated window period (e.g. 30 minutes).

    Notes
    -----
    # In production: compute from on-chain DEX price history
    #   by averaging the cumulative price accumulators from the AMM pool
    #   over the last N blocks on 0G Chain.
    # 0G INTEGRATION: Read UniswapV3-style oracle from 0G DEX pool contract.
    """
    base = _base_price(asset)
    # TWAP is smoother — smaller noise band
    noise_pct = random.uniform(-0.003, 0.003)
    return round(base * (1 + noise_pct), 4)


# ---------------------------------------------------------------------------
# Aggregation & deviation check
# ---------------------------------------------------------------------------

def get_median_price(asset: str) -> tuple[float, dict[str, float]]:
    """
    Fetch prices from all three oracles and return the manipulation-resistant median.

    Checks that oracle prices do not deviate from each other by more than 2%.
    If they do, raises ``OracleDeviationError`` so the calling agent can
    fall back to a safe mode (e.g. REDUCE_ONLY).

    Parameters
    ----------
    asset : str
        Asset ticker symbol (e.g. ``"ETH"``).

    Returns
    -------
    tuple[float, dict[str, float]]
        A 2-tuple of:
        - ``median_price`` (float): Median of the three oracle prices in USD.
        - ``oracle_prices`` (dict): Individual prices keyed by oracle name:
          ``{"pyth": float, "chainlink": float, "twap": float}``.

    Raises
    ------
    OracleDeviationError
        If ``(max_price - min_price) / median_price > 0.02`` (2% threshold).

    Notes
    -----
    Median is more robust than mean against individual oracle manipulation —
    an attacker would need to corrupt at least 2 of 3 sources to skew the result.
    """
    pyth_price: float = fetch_pyth_price(asset)
    chainlink_price: float = fetch_chainlink_price(asset)
    twap_price: float = fetch_twap_price(asset)

    oracle_prices: dict[str, float] = {
        "pyth": pyth_price,
        "chainlink": chainlink_price,
        "twap": twap_price,
    }

    prices: list[float] = [pyth_price, chainlink_price, twap_price]
    median_price: float = statistics.median(prices)

    # Deviation check: MAX - MIN relative to median
    max_price: float = max(prices)
    min_price: float = min(prices)

    if median_price == 0:
        raise ValueError("Median price is zero — invalid oracle data.")

    deviation_pct: float = ((max_price - min_price) / median_price) * 100.0

    if deviation_pct > 2.0:
        raise OracleDeviationError(
            deviation_pct=deviation_pct,
            prices=oracle_prices,
        )

    return round(median_price, 4), oracle_prices
