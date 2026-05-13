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
from agent.llm import generate_ai_rationale, analyze_intent_override, analyze_market_context

# Action Constants
ACTION_HOLD = "HOLD"
ACTION_BUY = "BUY"
ACTION_REDUCE_ONLY = "REDUCE_ONLY"

# Simulation Constants
_SIMULATED_BALANCE_WEI = 1000000000000000000 # 1 ETH

def _load_strategy_params() -> StrategyParams:
    """Load and resolve strategy parameters from environment."""
    class_id = int(os.getenv("STRATEGY_CLASS_ID", "2")) # Default: Balanced Merc
    return resolve_strategy(class_id)

def make_trading_decision(
    median_price: float,
    previous_memory: dict[str, Any] | None,
    token_id: int,
    is_pending_transfer: bool = False,
    intent: str = "",
) -> dict[str, Any]:
    """
    Produce a signed-ready trading decision.
    Now uses deep AI analysis to nudge technical signals.
    """
    params = _load_strategy_params()
    ZERO_ADDRESS = "0x0000000000000000000000000000000000000000"

    # 1. Deep AI Analysis
    market_analysis = analyze_market_context(median_price, previous_memory, intent)
    ai_confidence = market_analysis.get("confidence", 50)
    size_mult = market_analysis.get("size_multiplier", 1.0)

    # Extract state from memory
    last_price: float = 0.0
    balance_wei: int = _SIMULATED_BALANCE_WEI
    if previous_memory:
        last_price = float(previous_memory.get("last_price", 0))
        balance_wei = int(previous_memory.get("balance_wei", _SIMULATED_BALANCE_WEI))

    # 2. Base Technical Signal
    price_change_pct = 0.0
    action = ACTION_HOLD
    tech_rationale = "Technical assessment."

    if is_pending_transfer:
        action = ACTION_REDUCE_ONLY
        tech_rationale = "Handover protocol active. Forcing REDUCE_ONLY."
    elif last_price > 0:
        price_change_pct = ((median_price - last_price) / last_price) * 100.0
        
        if price_change_pct > params.buy_threshold_pct:
            action = ACTION_BUY
            tech_rationale = f"Price +{price_change_pct:.2f}% exceeds {params.buy_threshold_pct}% threshold."
        elif price_change_pct < -params.reduce_threshold_pct:
            action = ACTION_REDUCE_ONLY
            tech_rationale = f"Price {price_change_pct:.2f}% below -{params.reduce_threshold_pct}% threshold."
        else:
            tech_rationale = f"Price change {price_change_pct:+.2f}% within neutral band."

    # 3. AI Overlay & Intent
    if not is_pending_transfer:
        # Intent-driven override
        action = analyze_intent_override(intent, action, price_change_pct, params.buy_threshold_pct)
        
        # Confidence Veto: If AI confidence is extremely low (< 20%), force HOLD to prevent erratic behavior
        if ai_confidence < 20 and action != ACTION_HOLD:
            action = ACTION_HOLD
            tech_rationale += " [AI VETO: Low Confidence]"

    # 4. Dynamic Sizing
    # Adjust base buy size by the AI multiplier
    base_buy_amount = int(balance_wei * params.buy_size_pct)
    final_amount_wei = int(base_buy_amount * size_mult) if action == ACTION_BUY else 0

    # 5. Generate Rationale (Passing the analysis)
    ai_rationale = generate_ai_rationale(
        technical_decision=action,
        price=median_price,
        price_change_pct=price_change_pct if previous_memory else None,
        strategy_name=params.class_name,
        user_intent=intent,
        market_analysis=market_analysis
    )

    # Use WNATIVE as fallback if TOKEN_ADDRESS is missing or blank
    _raw_token = (
        os.getenv("TOKEN_ADDRESS", "").strip()
        or os.getenv("WNATIVE_ADDRESS", "").strip()
        or ZERO_ADDRESS
    )
    TOKEN_ADDR = _raw_token
    if action == ACTION_BUY:
        token_in, token_out = ZERO_ADDRESS, TOKEN_ADDR
    elif action == ACTION_REDUCE_ONLY:
        token_in, token_out = TOKEN_ADDR, ZERO_ADDRESS
    else:
        token_in, token_out = ZERO_ADDRESS, ZERO_ADDRESS

    return {
        "action": action,
        "amount_wei": final_amount_wei,
        "token_in": token_in,
        "token_out": token_out,
        "rationale": ai_rationale,
        "current_price": median_price,
        "price_change_pct": round(price_change_pct, 4),
        "token_id": token_id,
        "strategy_class": params.class_name,
        "technical_summary": tech_rationale,
        "ai_confidence": ai_confidence
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
