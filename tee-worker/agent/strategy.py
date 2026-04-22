"""
agent/strategy.py — Autonomous Trading Strategy Logic (v2)

Now supports Dynamic Strategy Classes — thresholds are determined at runtime
from the STRATEGY_CLASS_ID environment variable (set by orchestrator from
StrategyVault.getResolvedParams()). Falls back to BALANCED_MERC if not set.

# TEE BOUNDARY: All decision logic runs inside the enclave.
"""
import os
from typing import Any

from agent.strategy_classes import resolve_strategy, StrategyParams
from agent.llm import generate_ai_rationale, analyze_intent_override

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

# Simulated portfolio: 1 ETH worth of balance expressed in wei
_SIMULATED_BALANCE_WEI: int = 1_000_000_000_000_000_000  # 1 ETH in wei

# Decision types (explicit strings matching PolicyVault ABI expectations)
ACTION_BUY: str = "BUY"
ACTION_HOLD: str = "HOLD"
ACTION_REDUCE_ONLY: str = "REDUCE_ONLY"


def _load_strategy_params() -> StrategyParams:
    """
    Load strategy parameters from environment at decision time.
    The orchestrator is responsible for setting:
      STRATEGY_CLASS_ID     — int (0-4)
      STRATEGY_BUY_BPS      — optional, for CUSTOM class
      STRATEGY_REDUCE_BPS   — optional, for CUSTOM class
      STRATEGY_SIZE_BPS     — optional, for CUSTOM class
    """
    class_id = int(os.getenv("STRATEGY_CLASS_ID", "2"))  # Default: BALANCED_MERC

    custom_params = None
    if class_id == 4:  # CUSTOM
        custom_params = {
            "buy_threshold_bps": int(os.getenv("STRATEGY_BUY_BPS", "200")),
            "reduce_threshold_bps": int(os.getenv("STRATEGY_REDUCE_BPS", "300")),
            "buy_size_bps": int(os.getenv("STRATEGY_SIZE_BPS", "500")),
        }

    return resolve_strategy(class_id, custom_params)


def make_trading_decision(
    median_price: float,
    previous_memory: dict[str, Any] | None,
    token_id: int,
    is_pending_transfer: bool = False,
    intent: str = "",
) -> dict[str, Any]:
    """
    Produce a signed-ready trading decision based on current price and memory.
    Thresholds are sourced from the agent's chosen Strategy Class.

    Parameters
    ----------
    median_price : float
        Current manipulation-resistant median price from oracle.aggregator.
    previous_memory : dict or None
        Decrypted memory from previous cycle. Key: last_price, balance_wei.
    token_id : int
        ERC-7857 token ID.
    is_pending_transfer : bool
        If True, force REDUCE_ONLY (handover protection).
    intent : str
        Natural language string from user's Telegram message.
    """
    params = _load_strategy_params()
    asset: str = "ETH"

    # Extract state from memory if available
    last_price: float = 0.0
    balance_wei: int = _SIMULATED_BALANCE_WEI
    if previous_memory:
        last_price = float(previous_memory.get("last_price", 0))
        balance_wei = int(previous_memory.get("balance_wei", _SIMULATED_BALANCE_WEI))

    buy_amount_wei: int = int(balance_wei * params.buy_size_pct)

    # -----------------------------------------------------------------------
    # Initial Baseline / Safe Halts
    # -----------------------------------------------------------------------
    price_change_pct = 0.0
    action = ACTION_HOLD
    tech_rationale = "Technical assessment."

    if is_pending_transfer:
        action = ACTION_REDUCE_ONLY
        tech_rationale = "Handover protocol active. Forcing REDUCE_ONLY."
    elif previous_memory is None:
        action = ACTION_HOLD
        tech_rationale = "First execution cycle. Baseline not established."
    elif last_price == 0:
        action = ACTION_HOLD
        tech_rationale = "Invalid historical price detected."
    else:
        # -----------------------------------------------------------------------
        # Standard Decision Logic (Technical Signal)
        # -----------------------------------------------------------------------
        price_change_pct = ((median_price - last_price) / last_price) * 100.0
        
        if price_change_pct > params.buy_threshold_pct:
            action = ACTION_BUY
            tech_rationale = f"Price +{price_change_pct:.2f}% exceeds {params.buy_threshold_pct}% threshold."
        elif price_change_pct < -params.reduce_threshold_pct:
            action = ACTION_REDUCE_ONLY
            tech_rationale = f"Price {price_change_pct:.2f}% below -{params.reduce_threshold_pct}% threshold."
        else:
            tech_rationale = f"Price change {price_change_pct:+.2f}% within neutral band."

    # -----------------------------------------------------------------------
    # AI Nudge: Intent-Aware Decision Adjustment
    # -----------------------------------------------------------------------
    # If the user says "Buy now", and we are at least near the boundary, AI allows it.
    if not is_pending_transfer:
        action = analyze_intent_override(intent, action, price_change_pct, params.buy_threshold_pct)

    # Re-calculate amount if action changed
    final_amount_wei = buy_amount_wei if action == ACTION_BUY else 0

    # -----------------------------------------------------------------------
    # AI Rationale: Human-like explanation
    # -----------------------------------------------------------------------
    ai_rationale = generate_ai_rationale(
        technical_decision=action,
        price=median_price,
        price_change_pct=price_change_pct if previous_memory else None,
        strategy_name=params.class_name,
        user_intent=intent
    )

    return {
        "action": action,
        "amount_wei": final_amount_wei,
        "asset": asset,
        "rationale": ai_rationale,
        "current_price": median_price,
        "price_change_pct": round(price_change_pct, 4),
        "token_id": token_id,
        "strategy_class": params.class_name,
        "technical_summary": tech_rationale
    }




def build_updated_memory(
    previous_memory: dict[str, Any] | None,
    decision: dict[str, Any],
    median_price: float,
    cycle_number: int = 0,
) -> dict[str, Any]:
    """
    Construct the updated memory dict to be sealed and stored after a cycle.
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
        "strategy_class": decision.get("strategy_class", "BALANCED_MERC"),
    }
