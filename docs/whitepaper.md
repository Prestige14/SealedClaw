# SealedClaw Technical Whitepaper: Sovereign iNFT Trading Agents on 0G

## Abstract
SealedClaw is an autonomous trading framework designed to operate natively within the 0G ecosystem. It leverages Trusted Execution Environments (TEEs) to ensure the integrity and privacy of trading strategies, and the 0G EVM to enforce risk policies on-chain. By representing agents as ERC-7857 iNFTs, SealedClaw enables a new class of transferable, self-custodial AI assets.

## 1. System Architecture
The SealedClaw ecosystem consists of three primary layers:
1.  **Intent & Intelligence Layer**: Utilizes Large Language Models (LLMs) like Llama 3 via Groq to translate natural language into structured trading intents.
2.  **Verifiable Compute Layer (TEE)**: Executes strategies off-chain within a secure enclave. The enclave generates cryptographic proofs (ECDSA signatures) for every transaction, ensuring that the code running off-chain is exactly as intended.
3.  **On-Chain Enforcement Layer (0G EVM)**: The `PolicyVault` contract verifies TEE signatures and enforces pre-defined risk parameters (e.g., daily spend limits, max drawdown, and authorized DEXs) before any trade is finalized.

## 2. The iNFT Standard (ERC-7857)
Agents in SealedClaw are not just scripts; they are **iNFTs (intelligent NFTs)**. 
- **Ownership**: The owner of the NFT has control over the agent's high-level policies.
- **Custody**: Each iNFT is linked to a dedicated `PolicyVault` on-chain, which holds the agent's funds.
- **Transferability**: When an iNFT is sold or transferred, the new owner inherits the agent's state, memory, and vault balance trustlessly.

## 3. TEE Attestation & Security Flow
SealedClaw implements a robust security chain:
- **Identity**: Each agent is assigned a unique ECDSA keypair generated inside the TEE. The public key is registered on-chain in the `PolicyVault`.
- **Signature Verification**: Every trade must be signed by the TEE key. `PolicyVault.executeWithProof()` uses `ecrecover` to verify the signer.
- **Attestation**: The `TEEAttestationRegistry` allows for the verification of `MRENCLAVE` and `MRSIGNER` measurements, ensuring that the off-chain worker is indeed running the correct version of the SealedClaw software inside a genuine TEE.

## 4. 0G Storage Integration
To enable stateful agents without high on-chain costs, SealedClaw uses **0G Storage**:
- **Persistence**: Agent memory (technical indicators, trade history, and reasoning) is serialized and uploaded to 0G Storage after each cycle.
- **Root Hash**: Only the `root_hash` of the state is tracked, allowing the agent to "remember" its context in a decentralized and cost-effective manner.

## 5. Risk Mitigation & Guardrails
- **Daily Spend Limits**: Enforced on-chain to prevent "fat-finger" errors or black-swan strategy failures.
- **DEX Allowlist**: Restricts agents to verified liquidity pools (e.g., XSwap).
- **Reduce-Only Mode**: During agent handovers or periods of high volatility, the owner can force the agent into a state where it can only close positions, never open new ones.

## 6. Conclusion
SealedClaw represents the future of Agentic DeFi on 0G. By combining the speed of off-chain AI with the security of TEEs and the trustlessness of 0G's modular infrastructure, it provides a truly sovereign platform for automated asset management.
