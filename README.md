# SealedClaw Trader

**Sovereign iNFT Trading Agent — 0G APAC Hackathon 2026**

SealedClaw is an autonomous on-chain trading agent built on the 0G ecosystem. Each agent is represented as an **ERC-7857 Agentic iNFT** with a cryptographically enforced risk policy vault and a **Python TEE worker** that generates tamper-proof trading signals from inside a simulated Trusted Execution Environment.

---

## 🚀 Deployed Contracts — 0G Galileo Testnet

The following infrastructure is deployed and verified on the 0G Galileo Testnet:

| Contract | Address |
|---|---|
| **SealedClawAgent** (ERC-7857 iNFT) | [`0x0D49E6f39370F3b01a87054c518C57bB729023E5`](https://chainscan-galileo.0g.ai/address/0x0D49E6f39370F3b01a87054c518C57bB729023E5) |
| **PolicyVault** (Risk & Handover) | [`0x03dEB78c61D8e3463EE7918066de2D9Ed7cF5186`](https://chainscan-galileo.0g.ai/address/0x03dEB78c61D8e3463EE7918066de2D9Ed7cF5186) |

- **Network**: 0G Galileo Testnet · **Chain ID**: `16602`
- **RPC**: `https://evmrpc-testnet.0g.ai`
- **Telegram Bot**: [@sealed_claw_bot](https://t.me/sealed_claw_bot)
- **Web Dashboard**: Runs locally via `frontend/`

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                  0G Galileo Testnet                     │
│                                                         │
│   ┌──────────────────┐    ┌──────────────────────────┐  │
│   │ SealedClawAgent  │    │      PolicyVault         │  │
│   │   (ERC-7857)     │◄───│  executeWithProof()      │  │
│   │                  │    │  • ecrecover(signature)  │  │
│   │  Agentic iNFT    │    │  • nonce anti-replay     │  │
│   │  + 0G Storage    │    │  • risk policy checks    │  │
│   │  CID metadata    │    │  • DEX allowlist         │  │
│   └──────────────────┘    └──────────┬───────────────┘  │
│                                      │ verify sig        │
└──────────────────────────────────────┼──────────────────┘
                                       │
                    ┌──────────────────▼──────────────────┐
                    │        TEE Worker (Python)           │
                    │                                      │
                    │  ┌─────────┐  ┌──────────────────┐  │
                    │  │ Enclave │  │  Oracle Agg.     │  │
                    │  │ ECDSA   │  │  Pyth+CL+TWAP    │  │
                    │  │ keypair │  │  median price    │  │
                    │  │ AES-GCM │  └──────────────────┘  │
                    │  │ sealing │  ┌──────────────────┐  │
                    │  └────┬────┘  │ Strategy Engine  │  │
                    │       │sign   │ BUY/HOLD/REDUCE  │  │
                    │  ┌────▼────┐  └──────────────────┘  │
                    │  │Payload  │  ┌──────────────────┐  │
                    │  │Builder  │  │ 0G Storage       │  │
                    │  │ABI-enc. │  │ Encrypted Memory │  │
                    │  └─────────┘  └──────────────────┘  │
                    └─────────────────────────────────────┘
```

---

## Phase 1 - Smart Contracts Foundation

### `SealedClawAgent.sol` — ERC-7857 Agentic iNFT

- Standard ERC-721 NFT where each token represents an autonomous trading agent
- Metadata CID stored on-chain with `0g://` prefix → points to encrypted agent config on 0G Storage
- Owner-controlled metadata updates and collaborator authorization

### `PolicyVault.sol` — Risk Policy + TEE Verification Vault

Core execution function:

```solidity
function executeWithProof(
    uint256 tokenId,
    bytes calldata strategyData,
    uint256 tradeAmount,
    address targetDEX,
    bytes calldata signature,
    uint256 deadline
) external
```

Security checks: 
- Anti-replay nonces, TEE ECDSA recovery, daily spend limits, and DEX allowlists.

---

## Phase 2 - TEE Worker Enclave Simulator

Python package simulating a **Trusted Execution Environment** via 0G Compute Sealed Inference.

### Execution Cycle

```
[1] TEE INIT       Generate deterministic ECDSA + AES-256 keys via HKDF
[2] ORACLE         Fetch Pyth + Chainlink prices; Compute median
[3] MEMORY READ    Decrypt agent memory blob from 0G Storage
[4] AGENT          Decision logic: BUY (+2% price) | REDUCE (-3%) | HOLD
[5] PAYLOAD        ABI-encode & Sign payload for executeWithProof()
[6] MEMORY WRITE   Encrypt & Upload updated state to 0G Storage
```

---

## Phase 3 - OpenClaw Agent SDK & 0G Storage integration

The top-level `orchestrator.py` acts as an autonomous NLP-driven AI Agent using the **OpenClaw SDK Framework**.
- **NLP Intent Routing**: User sets a prompt -> Agent calls `execute_sealed_trade` skill autonomously via OpenAI.
- **Dynamic Nonce Sync**: Fetches anti-replay nonces directly from 0G Galileo Testnet.
- **0G Public Storage**: Enclave memory blobs are stored on the public RPC at `https://rpc-storage-testnet.0g.ai`.

---

## Phase 4 - Secure Handover Protocol

SealedClaw introduces a **Secure Handover Protocol** for Agentic iNFTs, allowing agents to be traded safely without exposing strategies.

1. **Initiate Transfer**: Owner calls `initiateTransfer(tokenId, newOwner)`.
2. **48-Hour Cooldown**: Mandatory window where the Agent enters **Reduce-Only** mode.
3. **TEE Enforcement**: TEE Worker detects the pending transfer and automatically overrides BUY signals with REDUCE-ONLY.
4. **Memory Re-encryption**: TEE worker re-encrypts its decentralized memory for the new owner post-cooldown.

---

## Phase 5 - Telegram Bot & Web Dashboard

SealedClaw is now a complete end-to-end ecosystem:

### 1. Telegram NLP Interaction
- Users chat with their agent via **Telegram**, powered by the **OpenClaw SDK**.
- Messages processed as *Intents* (e.g., "Optimize yield with 5% risk").

### 2. Web Dashboard (Premium UI)
- A React-based SPA in the `frontend/` directory providing a visual dashboard for Minting, Depositing, and Handover Protocol interaction.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Smart Contracts | Solidity `^0.8.24`, EVM `cancun` |
| Blockchain | 0G Galileo Testnet (Chain ID: 16602) |
| Storage Protocol | 0G Storage (`0g://` CID prefix) |
| TEE Simulation | Python 3.11+, `eth-keys`, `cryptography`, `eth-abi` |
| Bot Interface | Python-Telegram-Bot (v20+) |
| Frontend UI | React + Vite + Tailwind CSS |

---

## Roadmap

- [x] **Phase 1** - Smart contract foundation & testnet deployment
- [x] **Phase 2** - TEE worker simulation & ECDSA compatibility
- [x] **Phase 3** - Live 0G Storage integration & OpenClaw Agent SDK
- [x] **Phase 4** - Secure Handover Protocol & Reduce-Only mode
- [x] **Phase 5** - Frontend Dashboard & Telegram Bot Integration

---
**SealedClaw is ready to revolutionize autonomous agency on the 0G Network. 🛡️⚡**
