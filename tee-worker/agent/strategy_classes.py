"""
agent/strategy_classes.py — Strategy Class Definitions for RPG-style Agent

Maps on-chain StrategyClass enum to TEE decision parameters.
The orchestrator reads STRATEGY_CLASS_ID from env (fetched from StrategyVault),
and this module translates that into thresholds used by the decision engine.
"""

from dataclasses import dataclass
from enum import IntEnum


class StrategyClass(IntEnum):
    """Mirrors StrategyVault.StrategyClass enum on-chain."""
    SAFE_GUARDIAN   = 0
    YIELD_SNIPER    = 1
    BALANCED_MERC   = 2
    MOON_CHASER     = 3
    CUSTOM          = 4


@dataclass
class StrategyParams:
    """Resolved strategy parameters for the TEE decision engine."""
    class_id: int
    class_name: str
    class_emoji: str
    buy_threshold_pct: float    # Price rise % to trigger BUY
    reduce_threshold_pct: float # Price drop % to trigger REDUCE_ONLY
    buy_size_pct: float         # Portfolio fraction to deploy per BUY (0..1)
    description: str


# ── Preset Defaults (must match StrategyVault._getPresetParams) ──────────────

PRESET_STRATEGIES: dict[int, StrategyParams] = {
    StrategyClass.SAFE_GUARDIAN: StrategyParams(
        class_id=0,
        class_name="Safe Guardian",
        class_emoji="🛡️",
        buy_threshold_pct=4.0,     # 400 bps / 100
        reduce_threshold_pct=1.5,  # 150 bps / 100
        buy_size_pct=0.02,         # 200 bps / 10000
        description=(
            "Capital preservation first. Buys only on strong 4% rallies "
            "but exits quickly on any 1.5% dip to minimize losses."
        )
    ),
    StrategyClass.YIELD_SNIPER: StrategyParams(
        class_id=1,
        class_name="Yield Sniper",
        class_emoji="🎯",
        buy_threshold_pct=0.5,     # 50 bps
        reduce_threshold_pct=2.0,  # 200 bps
        buy_size_pct=0.15,         # 1500 bps
        description=(
            "High-frequency yield hunting. Enters on any 0.5% move "
            "with large 15% position size to maximise gains from micro-rallies."
        )
    ),
    StrategyClass.BALANCED_MERC: StrategyParams(
        class_id=2,
        class_name="Balanced Mercenary",
        class_emoji="⚔️",
        buy_threshold_pct=2.0,     # 200 bps
        reduce_threshold_pct=3.0,  # 300 bps
        buy_size_pct=0.05,         # 500 bps
        description=(
            "Balanced risk/reward. The default workhorse — buys on 2% "
            "positive momentum and reduces on 3% downswings."
        )
    ),
    StrategyClass.MOON_CHASER: StrategyParams(
        class_id=3,
        class_name="Moon Chaser",
        class_emoji="🚀",
        buy_threshold_pct=1.0,     # 100 bps
        reduce_threshold_pct=5.0,  # 500 bps
        buy_size_pct=0.25,         # 2500 bps — 25% of portfolio!
        description=(
            "Maximum aggression. Enters eagerly on 1% rallies with a massive "
            "25% position, and rides the wave until a 5% crash forces an exit."
        )
    ),
}


def resolve_strategy(class_id: int, custom_params: dict | None = None) -> StrategyParams:
    """
    Resolve strategy parameters from a class_id and optional custom params.

    Parameters
    ----------
    class_id : int
        Strategy class ID (0-4). Matches StrategyClass enum.
    custom_params : dict or None
        For CUSTOM (4): must contain buy_threshold_bps, reduce_threshold_bps,
        buy_size_bps (all as integers in basis points).

    Returns
    -------
    StrategyParams with resolved thresholds for the TEE engine.
    """
    if class_id == StrategyClass.CUSTOM:
        if not custom_params:
            # Fallback to BALANCED_MERC if custom params not provided
            return PRESET_STRATEGIES[StrategyClass.BALANCED_MERC]
        return StrategyParams(
            class_id=4,
            class_name="Custom",
            class_emoji="⚙️",
            buy_threshold_pct=custom_params.get("buy_threshold_bps", 200) / 100.0,
            reduce_threshold_pct=custom_params.get("reduce_threshold_bps", 300) / 100.0,
            buy_size_pct=custom_params.get("buy_size_bps", 500) / 10000.0,
            description="User-defined custom strategy parameters."
        )

    return PRESET_STRATEGIES.get(class_id, PRESET_STRATEGIES[StrategyClass.BALANCED_MERC])
