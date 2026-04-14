"""
agent/
Autonomous trading strategy module for SealedClaw iNFT agent.

Reads sealed memory state from 0G Storage to maintain continuity
across execution cycles. All decisions are cryptographically signed
by the TEE enclave before being forwarded to PolicyVault.

# TEE BOUNDARY: Strategy execution is sandboxed inside the enclave.
# No external network calls are permitted during decision-making.
"""
