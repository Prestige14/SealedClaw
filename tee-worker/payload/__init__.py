"""
payload/
Payload construction module for SealedClaw TEE worker.

Builds ABI-encoded strategy data and cryptographically signed payloads
that are directly consumable by PolicyVault.executeWithProof() on-chain.

Output format is compatible with both Hardhat and Foundry test suites.
"""
