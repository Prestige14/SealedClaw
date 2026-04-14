"""
oracle/
Multi-oracle price aggregation module for SealedClaw TEE worker.

Fetches prices from Pyth, Chainlink, and TWAP sources, then computes
a manipulation-resistant median. Raises OracleDeviationError if
sources diverge beyond acceptable threshold.

# 0G INTEGRATION: Oracle calls will be routed through 0G Compute's
# verified data feeds when deployed on 0G Chain.
"""
