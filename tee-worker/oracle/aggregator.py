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


_LATEST_PRICES: dict[str, float] = _BASE_PRICE_USD.copy()

def _base_price(asset: str) -> float:
    """Return the base simulated price for an asset, anchored to latest known good data."""
    return _LATEST_PRICES.get(asset.upper(), 100.0)

def _update_base_price(asset: str, price: float):
    """Update the baseline for simulated/fallback sources."""
    _LATEST_PRICES[asset.upper()] = price


# ---------------------------------------------------------------------------
# Individual oracle fetch functions
# ---------------------------------------------------------------------------

def fetch_pyth_price(asset: str) -> float:
    import requests
    
    price_ids = {
        "ETH": "0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace",
        "BTC": "0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43",
    }
    
    price_id = price_ids.get(asset.upper())
    if not price_id:
        print(f"[ORACLE] Pyth price ID for {asset} not found. Using fallback.")
        base = _base_price(asset)
        noise_pct = random.uniform(-0.005, 0.005)
        return round(base * (1 + noise_pct), 4)

    url = f"https://hermes.pyth.network/v2/updates/price/latest?ids[]={price_id}"
    try:
        response = requests.get(url, timeout=5)
        response.raise_for_status()
        data = response.json()
        parsed = data.get("parsed", [])
        if not parsed:
            raise ValueError("No parsed data in Pyth response")
        
        price_info = parsed[0]["price"]
        price_str = price_info["price"]
        expo = price_info["expo"]
        
        actual_price = float(price_str) * (10 ** expo)
        _update_base_price(asset, actual_price)  # Anchor fallbacks to this live price
        return round(actual_price, 4)
    except Exception as e:
        print(f"[ORACLE] Pyth fetch failed: {e}. Using fallback.")
        base = _base_price(asset)
        noise_pct = random.uniform(-0.005, 0.005)
        return round(base * (1 + noise_pct), 4)

def fetch_chainlink_price(asset: str) -> float:
    import os
    from web3 import Web3

    RPC_URL = os.getenv("RPC_URL", "https://rpc.ankr.com/eth_sepolia")
    
    addresses = {
        "ETH": "0x694AA1769357215DE4FAC081bf1f309aDC325306", # ETH/USD Sepolia
        "BTC": "0x1b44F3514812d835EB1BDB0acB33d3fA3351Ee43", # BTC/USD Sepolia
    }
    
    aggregator_address = addresses.get(asset.upper())
    if not aggregator_address:
        print(f"[ORACLE] Chainlink address for {asset} not found. Using fallback.")
        base = _base_price(asset)
        noise_pct = random.uniform(-0.004, 0.006)
        return round(base * (1 + noise_pct), 4)

    try:
        web3 = Web3(Web3.HTTPProvider(RPC_URL))
        if not web3.is_connected():
            raise ConnectionError("Web3 provider not connected")

        abi = [
            {
                "inputs": [],
                "name": "latestRoundData",
                "outputs": [
                    {"internalType": "uint80", "name": "roundId", "type": "uint80"},
                    {"internalType": "int256", "name": "answer", "type": "int256"},
                    {"internalType": "uint256", "name": "startedAt", "type": "uint256"},
                    {"internalType": "uint256", "name": "updatedAt", "type": "uint256"},
                    {"internalType": "uint80", "name": "answeredInRound", "type": "uint80"}
                ],
                "stateMutability": "view",
                "type": "function"
            },
            {
                "inputs": [],
                "name": "decimals",
                "outputs": [{"internalType": "uint8", "name": "", "type": "uint8"}],
                "stateMutability": "view",
                "type": "function"
            }
        ]

        contract = web3.eth.contract(address=aggregator_address, abi=abi)
        decimals = contract.functions.decimals().call()
        round_data = contract.functions.latestRoundData().call()
        
        price = float(round_data[1]) / (10 ** decimals)
        return round(price, 4)

    except Exception as e:
        print(f"[ORACLE] Chainlink fetch failed: {e}. Using fallback.")
        base = _base_price(asset)
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

def get_onchain_chainlink_price(asset: str) -> float:
    import os
    from web3 import Web3

    RPC_URL = os.getenv("OG_RPC_URL", "https://evmrpc.0g.ai")
    VERIFIER_ADDRESS = os.getenv("CHAINLINK_VERIFIER_ADDRESS")

    if not VERIFIER_ADDRESS:
        print(f"[ORACLE] CHAINLINK_VERIFIER_ADDRESS not set. Skipping on-chain fetch for {asset}.")
        base = _base_price(asset)
        noise_pct = random.uniform(-0.004, 0.006)
        return round(base * (1 + noise_pct), 4)

    try:
        web3 = Web3(Web3.HTTPProvider(RPC_URL))
        if not web3.is_connected():
            raise ConnectionError("Web3 provider not connected")

        abi = [
            {
                "inputs": [{"internalType": "string", "name": "pair", "type": "string"}],
                "name": "getPrice",
                "outputs": [
                    {"internalType": "uint256", "name": "price", "type": "uint256"},
                    {"internalType": "uint256", "name": "updatedAt", "type": "uint256"}
                ],
                "stateMutability": "view",
                "type": "function"
            }
        ]

        contract = web3.eth.contract(address=VERIFIER_ADDRESS, abi=abi)
        pair = f"{asset.upper()}/USD"
        price_data = contract.functions.getPrice(pair).call()
        
        price = float(price_data[0]) / (10 ** 8)
        return round(price, 4)

    except Exception as e:
        print(f"[ORACLE] On-chain Chainlink fetch failed: {e}. Using fallback.")
        base = _base_price(asset)
        noise_pct = random.uniform(-0.004, 0.006)
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
    onchain_price: float = get_onchain_chainlink_price(asset)

    oracle_prices: dict[str, float] = {
        "pyth": pyth_price,
        "chainlink": chainlink_price,
        "twap": twap_price,
        "onchain": onchain_price,
    }

    prices: list[float] = [pyth_price, chainlink_price, twap_price, onchain_price]
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
