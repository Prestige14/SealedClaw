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

## 🛠 Handover Protocol (Phase 4)

SealedClaw introduces a **Secure Handover Protocol** for Agentic iNFTs. This allows agents to be traded safely between owners without exposing sensitive trading strategies.

1. **Initiate Transfer**: The owner calls `initiateTransfer(tokenId, newOwner)`.
2. **48-Hour Cooldown**: A mandatory window where the Agent enters **Reduce-Only** mode.
3. **TEE Enforcement**: The TEE Worker detects the pending transfer on-chain and automatically overrides all BUY signals with REDUCE-ONLY signals.
4. **Memory Re-encryption**: The TEE worker re-encrypts its decentralized memory (stored on 0G Storage) for the new owner.

---

## 🤖 Full Ecosystem Integration (Phase 5)

SealedClaw is now a complete end-to-end ecosystem:

### 1. Telegram NLP Integration
- Users can talk to their agent via **Telegram**, powered by the **OpenClaw SDK**.
- Messages are processed as *Intents* (e.g., "Optimize yield with 5% risk").
- The Orchestrator relays these to the TEE Worker for secure blockchain execution on 0G.

### 2. Web Dashboard (Premium UI)
- A React-based SPA in the `frontend/` directory providing a visual dashboard for Minting, Depositing, and Handover Protocol interaction.

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

## Phase 1 — Smart Contracts

### `SealedClawAgent.sol` — ERC-7857 Agentic iNFT

- Standard ERC-721 NFT where each token represents an autonomous trading agent
- Metadata CID stored on-chain with `0g://` prefix → points to encrypted agent config on 0G Storage
- `mintAgent(metadataCID)` — public mint, one agent per transaction
- Owner-controlled metadata updates and collaborator authorization

### `PolicyVault.sol` — Risk Policy + TEE Verification Vault

Core execution function:

```solidity
function executeWithProof(
    uint256 tokenId,
    bytes calldata strategyData,   // ABI-encoded trade params
    uint256 tradeAmount,
    address targetDEX,
    bytes calldata signature,       // 65-byte ECDSA from TEE
    uint256 deadline
) external
```

Security checks performed on every execution:
1. **Deadline** — reverts if `block.timestamp > deadline`
2. **Policy set** — reverts if no policy configured for token
3. **DEX allowlist** — `targetDEX` must be in `policy.allowedDEXs`
4. **Daily limit** — cumulative spend resets at midnight UTC
5. **Risk per trade** — max `riskMaxPercent` of user balance per call
6. **TEE signature** — `keccak256(abi.encodePacked(tokenId, strategyData, nonce, deadline, address(this)))` is verified via `ecrecover`; signer must equal `teeEnclavePubKey`
7. **Nonce increment** — prevents replay attacks; nonce stored separately from policy

Additional features:
- `updateTeeEnclavePubKey()` — 24h rotation cooldown
- `ReentrancyGuard`, `Pausable`, `Ownable` from OpenZeppelin v5
- Per-user balance accounting (`deposit` / `withdraw`)
- `emergencyWithdraw()` for owner safety

---

## Phase 2 — TEE Worker (`tee-worker/`)

Python package simulating a **Trusted Execution Environment** via 0G Compute Sealed Inference.

### Package Structure

```
tee-worker/
├── main.py                  # End-to-end orchestration (7 phases)
├── enclave/
│   ├── keys.py              # ECDSA keypair (deterministic HKDF sealing)
│   ├── attestation.py       # Mock TEE attestation report
│   └── crypto.py            # Solidity-compatible hashing + AES-256-GCM
├── oracle/
│   └── aggregator.py        # Pyth + Chainlink + TWAP median aggregation
├── agent/
│   └── strategy.py          # BUY / HOLD / REDUCE_ONLY decision logic
├── payload/
│   └── builder.py           # ABI-encode + sign + assemble executeWithProof payload
├── scripts/
│   └── verify_phase2.py     # Standalone 7-point verification suite
├── requirements.txt
└── .env.example
```

### Execution Cycle

```
[1] TEE INIT       Generate ECDSA keypair (HKDF from TEE_IDENTITY)
                   Derive AES-256-GCM key (HKDF from TEE_IDENTITY)
                   Generate mock attestation report
                       → Simulates: PolicyVault.updateTeeEnclavePubKey()

[2] ORACLE         Fetch Pyth + Chainlink + TWAP prices
                   Compute manipulation-resistant median
                   Raise OracleDeviationError if MAX-MIN > 2%

[3] MEMORY READ    Decrypt agent memory blob from 0G Storage
                       → 0G INTEGRATION: fetch from 0G Storage KV store

[4] AGENT          make_trading_decision(price, memory, tokenId)
                   BUY if price +2% | REDUCE_ONLY if -3% | else HOLD

[5] PAYLOAD        ABI-encode decision as strategyData
                   Compute keccak256(abi.encodePacked(...)) — Solidity-exact
                   Apply toEthSignedMessageHash prefix
                   Sign with TEE ECDSA key (65-byte r+s+v)

[6] MEMORY WRITE   Encrypt updated state with AES-256-GCM
                   Upload encrypted blob to 0G Storage
                       → 0G INTEGRATION: store to 0G Storage KV store

[7] OUTPUT         Return JSON payload ready for executeWithProof()
```

### Cryptographic Compatibility

The Python hash construction exactly reproduces the Solidity message hash:

```python
# Python (enclave/crypto.py)
keccak256(
    tokenId.to_bytes(32, "big")       # uint256
    + strategy_data                    # bytes (raw)
    + nonce.to_bytes(32, "big")       # uint256
    + deadline.to_bytes(32, "big")    # uint256
    + bytes.fromhex(vault_address)    # address (20 bytes)
)
```

```solidity
// Solidity (PolicyVault.sol)
keccak256(abi.encodePacked(
    tokenId,        // uint256
    strategyData,   // bytes
    nonces[tokenId],// uint256
    deadline,       // uint256
    address(this)   // address
))
```

Both are then wrapped with `toEthSignedMessageHash` before signing/recovering.

---

## Phase 3 — OpenClaw Agent SDK & 0G Storage Testnet (`orchestrator.py`)

**Requirements**: Python 3.11+, OpenAI API Key

The top-level `orchestrator.py` acts as an autonomous NLP-driven AI Agent. It uses **OpenClaw SDK Framework** wrapped around the TEE worker.
- **NLP Intent Routing**: User sets a prompt (e.g. "Optimize yield") -> Agent calls `execute_sealed_trade` skill autonomously via OpenAI tool-calling.
- **Dynamic Nonce Sync**: Fetches the precise anti-replay nonce directly from `PolicyVault` on the 0G Galileo Testnet before spinning up the TEE enclave.
- **0G Public Storage**: The enclave memory blobs (`encrypted_blob`) are directly stored and retrieved from the public RPC at `https://rpc-storage-testnet.0g.ai`, keeping the TEE memory completely decentralized.

```bash
# Set OPENAI_API_KEY inside .env
python orchestrator.py
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Smart Contracts | Solidity `^0.8.24`, EVM `cancun` |
| Contract Framework | Hardhat `^2.22` + TypeScript |
| Contract Libraries | OpenZeppelin Contracts `^5.0` |
| Blockchain | 0G Galileo Testnet (Chain ID: 16602) |
| Storage Protocol | 0G Storage (`0g://` CID prefix) |
| TEE Simulation | Python 3.11+, `eth-keys`, `cryptography`, `eth-abi` |
| Key Derivation | HKDF-SHA256 (signing key + AES key from `TEE_IDENTITY`) |
| Memory Encryption | AES-256-GCM with GCM authentication tag |
| Oracle Feeds | Pyth Network + Chainlink + on-chain TWAP (simulated) |
| Signature Scheme | SECP256k1 ECDSA, 65-byte `r+s+v`, Ethereum canonical |
| Bot Interface | Python-Telegram-Bot (v20+) |
| Frontend UI | React + Vite + Tailwind CSS |

---

## Project Structure

```bash
SealedClaw/
├── contracts/          # Solidity Smart Contracts (ERC-7857 & Vault)
├── frontend/           # Phase 5: React + Vite + Tailwind Dashboard
├── tee-worker/         # Phase 2: Python TEE Simulator
├── orchestrator.py     # Phase 3: OpenClaw Agent SDK (Intent Routing)
├── telegram_bot.py     # Phase 5: Telegram Bot Interface
├── scripts/            # Deployment & Testnet Setup Scripts
├── test/               # Integration tests
└── requirements.txt    # Python Dependencies
```

---

## Roadmap

- [x] **Phase 1** — Smart contract foundation & testnet deployment
- [x] **Phase 2** — TEE worker simulation with verified Solidity signature compatibility
- [x] **Phase 3** — Live 0G Storage integration & OpenClaw Agent SDK intent routing
- [x] **Phase 4** — Secure Handover Protocol & Reduce-Only mode
- [x] **Phase 5** — Frontend Dashboard & Telegram Bot Integration

---
**SealedClaw is ready to revolutionize autonomous agency on the 0G Network. 🛡️⚡**
