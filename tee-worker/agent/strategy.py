"""
agent/strategy.py — Autonomous Trading Strategy Logic

Implements the SealedClaw agent's decision-making engine. Reads sealed memory
from previous execution cycles to determine trend direction and decides whether
to BUY, REDUCE_ONLY, or HOLD based on simple price-threshold rules.

The strategy is intentionally simple to keep the focus on TEE infrastructure.
In production this would be replaced by a more sophisticated ML-based strategy
running as a sealed inference model inside the 0G Compute enclave.

# TEE BOUNDARY: All decision logic runs inside the enclave. The resulting
# decision dict is signed before leaving the secure boundary.
# 
# 0G COMPUTE / ML INTEGRATION:
# The current strategy based on static thresholds is a placeholder. To integrate a real
# ML model (e.g. Scikit-learn, PyTorch, or ONNX format), follow these steps:
# 1. Package the ML model alongside the TEE enclave or fetch it via 0G Storage.
# 2. Add dependencies like `numpy` or `onnxruntime` to `requirements.txt`.
# 3. Replace the `make_trading_decision` logic below with model inference.
# 4. Use `previous_memory` to provide context (e.g., historical price windows).
# 5. Ensure inference runs entirely *within* the TEE (enclave memory).
"""

from typing import Any

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

# Simulated portfolio: 1 ETH worth of balance expressed in wei
_SIMULATED_BALANCE_WEI: int = 1_000_000_000_000_000_000  # 1 ETH in wei

# Price movement thresholds
_BUY_THRESHOLD_PCT: float = 2.0     # Buy if price rose more than 2%
_REDUCE_THRESHOLD_PCT: float = 3.0  # Reduce if price dropped more than 3%

# BUY size: 5% of the simulated portfolio balance
_BUY_SIZE_PCT: float = 0.05


# ---------------------------------------------------------------------------
# Decision types (explicit strings matching PolicyVault ABI expectations)
# ---------------------------------------------------------------------------

ACTION_BUY: str = "BUY"
ACTION_HOLD: str = "HOLD"
ACTION_REDUCE_ONLY: str = "REDUCE_ONLY"


def make_trading_decision(
    median_price: float,
    previous_memory: dict[str, Any] | None,
    token_id: int,
    is_pending_transfer: bool = False,
) -> dict[str, Any]:
    """
    Produce a signed-ready trading decision based on current price and memory.

    Implements a three-state threshold strategy:

    1. **No memory (first run)** → return HOLD. The agent has no baseline price
       to compare against, so it is conservative on the first execution cycle.
    2. **Price rose > 2% from last recorded price** → BUY 5% of portfolio.
    3. **Price dropped > 3% from last recorded price** → REDUCE_ONLY (close risk).
    4. **Otherwise** → HOLD.

    Parameters
    ----------
    median_price : float
        Current manipulation-resistant median price from ``oracle.aggregator``.
    previous_memory : dict[str, Any] or None
        Decrypted memory dict from the previous cycle, containing at minimum:
        - ``"last_price"`` (float): Price at the end of the previous cycle.
        - ``"balance_wei"`` (int): Simulated portfolio balance in wei.
        Pass ``None`` if this is the first ever execution cycle.
    token_id : int
        The ERC-7857 token ID of this agent (for informational purposes).

    Returns
    -------
    dict[str, Any]
        Decision dict with keys:
        - ``action`` (str): One of ``"BUY"``, ``"REDUCE_ONLY"``, ``"HOLD"``.
        - ``amount_wei`` (int): Position size in wei (0 for HOLD).
        - ``asset`` (str): Ticker of the traded asset.
        - ``rationale`` (str): Human-readable explanation of the decision.
        - ``current_price`` (float): The median price used for this decision.
        - ``price_change_pct`` (float | None): Percentage change vs last cycle.
        - ``token_id`` (int): Echo of the input token ID.

    Notes
    -----
    # TEE BOUNDARY: Decision is computed inside the enclave. The resulting
    # dict is signed by the TEE ECDSA key before being forwarded to PolicyVault.
    # 0G INTEGRATION: In production, replace simple threshold logic with
    #   a sealed ML inference call via 0G Compute Inference API.
    """
    asset: str = "ETH"

    # -----------------------------------------------------------------------
    # Case 0: Handover pending — force REDUCE_ONLY mode
    # -----------------------------------------------------------------------
    if is_pending_transfer:
        return {
            "action": ACTION_REDUCE_ONLY,
            "amount_wei": 0,
            "asset": asset,
            "rationale": "Transfer pending. REDUCE_ONLY to secure portfolio for handover.",
            "current_price": median_price,
            "price_change_pct": None,
            "token_id": token_id,
        }

    # -----------------------------------------------------------------------
    # Case 1: First execution — no historical baseline available
    # -----------------------------------------------------------------------
    if previous_memory is None:
        return {
            "action": ACTION_HOLD,
            "amount_wei": 0,
            "asset": asset,
            "rationale": (
                "First execution cycle — no historical price baseline available. "
                "HOLD to establish reference point."
            ),
            "current_price": median_price,
            "price_change_pct": None,
            "token_id": token_id,
        }

    last_price: float = float(previous_memory.get("last_price", median_price))
    balance_wei: int = int(previous_memory.get("balance_wei", _SIMULATED_BALANCE_WEI))

    # Guard against division-by-zero if last_price is somehow zero
    if last_price == 0:
        return {
            "action": ACTION_HOLD,
            "amount_wei": 0,
            "asset": asset,
            "rationale": "Invalid historical price (zero). HOLD for safety.",
            "current_price": median_price,
            "price_change_pct": None,
            "token_id": token_id,
        }

    price_change_pct: float = ((median_price - last_price) / last_price) * 100.0

    # -----------------------------------------------------------------------
    # Case 2: Bullish signal — BUY
    # -----------------------------------------------------------------------
    if price_change_pct > _BUY_THRESHOLD_PCT:
        buy_amount_wei: int = int(balance_wei * _BUY_SIZE_PCT)
        return {
            "action": ACTION_BUY,
            "amount_wei": buy_amount_wei,
            "asset": asset,
            "rationale": (
                f"Price rose {price_change_pct:.2f}% (> {_BUY_THRESHOLD_PCT}% threshold). "
                f"BUY {_BUY_SIZE_PCT*100:.0f}% of portfolio = {buy_amount_wei} wei."
            ),
            "current_price": median_price,
            "price_change_pct": round(price_change_pct, 4),
            "token_id": token_id,
        }

    # -----------------------------------------------------------------------
    # Case 3: Bearish signal — REDUCE_ONLY
    # -----------------------------------------------------------------------
    if price_change_pct < -_REDUCE_THRESHOLD_PCT:
        return {
            "action": ACTION_REDUCE_ONLY,
            "amount_wei": 0,  # REDUCE_ONLY closes existing positions, no new capital
            "asset": asset,
            "rationale": (
                f"Price dropped {abs(price_change_pct):.2f}% (> {_REDUCE_THRESHOLD_PCT}% threshold). "
                "REDUCE_ONLY to limit downside risk."
            ),
            "current_price": median_price,
            "price_change_pct": round(price_change_pct, 4),
            "token_id": token_id,
        }

    # -----------------------------------------------------------------------
    # Case 4: No clear signal — HOLD
    # -----------------------------------------------------------------------
    return {
        "action": ACTION_HOLD,
        "amount_wei": 0,
        "asset": asset,
        "rationale": (
            f"Price change {price_change_pct:+.2f}% is within neutral band "
            f"[-{_REDUCE_THRESHOLD_PCT}%, +{_BUY_THRESHOLD_PCT}%]. HOLD position."
        ),
        "current_price": median_price,
        "price_change_pct": round(price_change_pct, 4),
        "token_id": token_id,
    }


def build_updated_memory(
    previous_memory: dict[str, Any] | None,
    decision: dict[str, Any],
    median_price: float,
    cycle_number: int = 0,
) -> dict[str, Any]:
    """
    Construct the updated memory dict to be sealed and stored after a cycle.

    Parameters
    ----------
    previous_memory : dict[str, Any] or None
        Memory from the previous cycle (None for first run).
    decision : dict[str, Any]
        Decision dict returned by ``make_trading_decision``.
    median_price : float
        The oracle median price used in this cycle.
    cycle_number : int, optional
        Monotonically increasing cycle counter for auditability.

    Returns
    -------
    dict[str, Any]
        Updated memory dict to encrypt and upload to 0G Storage.

    Notes
    -----
    # 0G INTEGRATION: This dict is passed to enclave.crypto.encrypt_memory()
    #   and the resulting blob is uploaded to 0G Storage KV store.
    """
    base_balance: int = (
        previous_memory.get("balance_wei", _SIMULATED_BALANCE_WEI)
        if previous_memory
        else _SIMULATED_BALANCE_WEI
    )

    return {
        "last_price": median_price,
        "last_action": decision["action"],
        "last_amount_wei": decision["amount_wei"],
        "balance_wei": base_balance,
        "cycle": cycle_number,
        "price_change_pct": decision.get("price_change_pct"),
    }
