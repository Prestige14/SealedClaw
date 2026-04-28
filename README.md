# SealedClaw — Sovereign iNFT Trading Agent on 0G

> An autonomous, TEE-secured AI trading agent framework built natively for the 0G ecosystem.  
> Deployed on **0G Galileo Testnet** (ChainID: 16602).

---

## 📋 Deployed Contract Addresses (0G Galileo Testnet)

| Contract | Address |
|---|---|
| **SealedClawAgent** (ERC-7857 iNFT) | [`0xd8572C039ea363FF52e30C022Fd5d99664f5c08d`](https://chainscan-galileo.0g.ai/address/0xd8572C039ea363FF52e30C022Fd5d99664f5c08d) |
| **PolicyVault** | [`0xCD4D495572A4b195ED393dE6E99aebfe181dce22`](https://chainscan-galileo.0g.ai/address/0xCD4D495572A4b195ED393dE6E99aebfe181dce22) |
| **StrategyVault** | [`0xcd43f5FE14BC64455A1a852eae7D277E687B16FD`](https://chainscan-galileo.0g.ai/address/0xcd43f5FE14BC64455A1a852eae7D277E687B16FD) |
| **MockDEXAdapter** | [`0x1c6a39d272760EC39F05393432B9aBBb26264823`](https://chainscan-galileo.0g.ai/address/0x1c6a39d272760EC39F05393432B9aBBb26264823) |
| **XSwapAdapter** | [`0x972699d9fEBdfa418D6DC69fd3F307cd241dC5b6`](https://chainscan-galileo.0g.ai/address/0x972699d9fEBdfa418D6DC69fd3F307cd241dC5b6) |
| **AgentMarketplace** | [`0x72Edd9218162a6bdc0AAa8365C9aF79fEfbF087e`](https://chainscan-galileo.0g.ai/address/0x72Edd9218162a6bdc0AAa8365C9aF79fEfbF087e) |
| **TEEAttestationRegistry** | [`0x04f514beaC867D5c6Dcc5aD346ec0a8a5E15c599`](https://chainscan-galileo.0g.ai/address/0x04f514beaC867D5c6Dcc5aD346ec0a8a5E15c599) |
| **ChainlinkOracleVerifier** | [`0xDcA9c41814d44A7F2d6dB014dBa0230E08313696`](https://chainscan-galileo.0g.ai/address/0xDcA9c41814d44A7F2d6dB014dBa0230E08313696) |

> **Deployed at:** 2026-04-27 · **Deployer:** `0x1960C0c9A89755eA6E56758C8fFb1e03180B1521`  
> **TEE Enclave Key:** `0xf706e2e1f24fa67297f37063d5b36f775f16261e`

---

## 📖 Project Overview

SealedClaw is a **sovereign, intent-driven AI trading agent** built on the 0G ecosystem. It combines three layers of trust to enable autonomous, verifiable, and tamper-proof on-chain trading:

1. **Intent Layer** — Users send natural-language commands (e.g., "Buy ETH aggressively today") via Telegram or CLI. A Groq-powered Llama 3 LLM parses and classifies the intent.

2. **Secure Execution Layer** — A Python-based TEE (Trusted Execution Environment) worker processes the trading strategy inside an isolated enclave. It produces an ECDSA signature over the exact payload it intends to submit — including `tokenId`, `strategyData`, `nonce`, `deadline`, and the `PolicyVault` contract address — preventing any tampering or replay attacks.

3. **Verification Layer** — The `PolicyVault` smart contract on 0G EVM recovers the signer address via `ecrecover` and only proceeds if it matches the registered TEE public key, enforcing risk policy rules (daily limit, max drawdown, DEX allowlist) on-chain before any trade executes.

Agents are represented as **ERC-7857 iNFT** tokens (SealedClawAgent), meaning the AI agent and its custody vault are transferable, composable digital assets — and can be listed on the built-in AgentMarketplace.

---

## 🏗️ System Architecture

```
┌───────────────────────────────────────────────────────────────────┐
│                         USER INTERFACE                            │
│    Telegram Bot  ──────────────────────────  React Dashboard      │
└─────────────────────────────┬─────────────────────────────────────┘
                              │ NLP Intent
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                   OPENCLAW AGENT (orchestrator.py)              │
│  Groq Llama 3  ──►  Intent Router  ──►  execute_sealed_trade() │
└─────────────────────────────┬───────────────────────────────────┘
                              │ subprocess
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│               TEE WORKER ENCLAVE (tee-worker/main.py)           │
│                                                                  │
│  Oracle Price Feed ──► Strategy Engine ──► ECDSA Signer         │
│  (Chainlink / mock)     (BUY/SELL/HOLD)    (eth_account)        │
│                              │                                   │
│  Agent Memory ◄────────────►  0G Storage Testnet                │
│  (stateful context)          (root_hash persisted)              │
└─────────────────────────────┬───────────────────────────────────┘
                              │ signed payload (JSON)
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│               0G GALILEO TESTNET (EVM Chain 16602)              │
│                                                                  │
│  PolicyVault.executeWithProof()                                  │
│    ├─ ecrecover(signature) == defaultTeeKey  ✓                   │
│    ├─ nonces[tokenId]++ (replay protection) ✓                    │
│    ├─ dailyLimit enforcement                ✓                    │
│    ├─ DEX allowlist check                  ✓                    │
│    └─ call IDEXAdapter.swap()  ──►  MockDEXAdapter / XSwap      │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🔧 Which 0G Modules Are Used & How

### 1. 0G EVM — Galileo Testnet (ChainID 16602)

**What it is:** The modular EVM-compatible execution layer of the 0G ecosystem.

**How SealedClaw uses it:**
- All smart contracts (`SealedClawAgent`, `PolicyVault`, `StrategyVault`, `AgentMarketplace`) are deployed here.
- `PolicyVault.executeWithProof()` uses Solidity's `ecrecover` to verify the TEE ECDSA signature on every trade. This means **no trade executes without cryptographic proof** from the registered enclave.
- On-chain nonces (`nonces[tokenId]`) prevent replay attacks — each signed payload is single-use.
- The `AgentMarketplace` enables trustless listing and purchase of iNFT agents.

### 2. 0G Storage — Decentralized Blob Storage

**What it is:** 0G's modular storage layer for large/persistent data that shouldn't live on-chain.

**How SealedClaw uses it:**
- After each trading cycle, the TEE worker serializes its **agent memory** (price history, moving averages, last trade context) as a JSON blob and uploads it to the 0G Storage testnet (`https://storage-testnet.0g.ai`).
- The returned `root_hash` is stored locally and used in the next cycle to **fetch the previous state**, giving the agent persistent memory across executions without consuming EVM blockspace.
- This implements a *stateful agent loop*: `Fetch Memory → Decide → Sign → Execute → Update Memory → Upload`.

### 3. 0G Verifiable Compute — TEE Integration

**What it is:** 0G's trust layer for provably correct, private off-chain computation.

**How SealedClaw uses it:**
- The Python TEE worker simulates an enclave environment where trading logic runs isolated from the operator.
- The ECDSA key (`defaultTeeKey`) registered in `PolicyVault` is derived from the TEE worker's deterministic private key — forming a **cryptographic identity** for the agent.
- `TEEAttestationRegistry` is deployed on-chain to support future hardware attestation (`mrenclave` / `mrsigner` measurement verification) via `updateAgentTeeKey()`, enabling a full trust chain from hardware to on-chain.
- The `StrategyVault` stores agent strategy classes on-chain, which the orchestrator reads dynamically and injects into the TEE worker at runtime.

---

## 🚀 Local Deployment & Reproduction Steps

### Prerequisites
- **Node.js** v18+
- **Python** 3.10+
- A wallet funded with 0G Galileo testnet tokens — get from [faucet.0g.ai](https://faucet.0g.ai)
- (Optional) Free [Groq API key](https://console.groq.com) for LLM intent parsing

---

### Step 1: Clone & Configure Environment

```bash
git clone <your-repo-url>
cd SealedClaw

# Root environment (orchestrator + hardhat)
cp .env.example .env

# TEE worker environment (standalone runs)
cp tee-worker/.env.example tee-worker/.env
```

Fill in your `.env`:

```env
# Required
PRIVATE_KEY=<your_deployer_wallet_private_key>
RELAYER_PRIVATE_KEY=<your_relayer_wallet_private_key>
POLICY_VAULT_ADDRESS=0xCD4D495572A4b195ED393dE6E99aebfe181dce22
TOKEN_ID=0

# Optional but recommended
GROQ_API_KEY=<free_key_from_console.groq.com>
STRATEGY_VAULT_ADDRESS=0xcd43f5FE14BC64455A1a852eae7D277E687B16FD
TARGET_DEX_ADDRESS=0x1c6a39d272760EC39F05393432B9aBBb26264823
TELEGRAM_BOT_TOKEN=<from_botfather>
```

> **Note:** If you want to use the already-deployed contracts above, skip Step 2 and go directly to Step 3.

---

### Step 2: Smart Contract Compilation & Deployment (optional — skip if using deployed contracts)

```bash
npm install
npx hardhat compile

# Deploy to 0G Galileo Testnet
npx hardhat run scripts/deploy.ts --network galileo
```

After deployment, the script prints all contract addresses. Copy them into your `.env`.

**Run tests to verify contract integrity:**
```bash
npx hardhat test
# Expected: all suites in test/TEEAttestation.test.ts and test/DEXAdapter.test.ts pass
# test/TEESignature.test.ts requires tee-worker Python environment (see Step 3)
```

---

### Step 3: Python Environment Setup

```bash
pip install -r requirements.txt

# Optionally set up TEE worker dependencies separately
pip install -r tee-worker/requirements.txt
```

---

### Step 4: Run a Trading Cycle (CLI)

```bash
python orchestrator.py
```

This will:
1. Connect to the 0G Galileo RPC and fetch on-chain nonce + policy for `TOKEN_ID`
2. Spawn the TEE worker subprocess with the current strategy parameters
3. TEE worker fetches agent memory from 0G Storage, runs price analysis, generates ECDSA signature
4. Orchestrator broadcasts `executeWithProof()` to `PolicyVault` on-chain
5. Receipt is printed with TX hash

---

### Step 5: Run via Telegram Bot (optional)

```bash
python telegram_bot.py
```

Send `/start` to your bot, then type any trading intent (e.g., `"Buy ETH now"` or `"Reduce position by 30%"`).

---

### Step 6: Launch Frontend Dashboard

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173` to access:
- **Agent Dashboard** — live portfolio, vault balance, execution history
- **Marketplace** — browse and purchase iNFT agents
- **Oracle Monitor** — price feeds and strategy class display

---

## 🧪 Reviewer Notes & Test Information

### Faucet
Get free testnet `$A0GI` at: **https://faucet.0g.ai**
- Network: 0G Galileo Testnet
- ChainID: `16602`
- RPC: `https://evmrpc-testnet.0g.ai`

### No-API-Key Mode (Judging Fallback)
If you run `orchestrator.py` without a `GROQ_API_KEY`, the agent automatically falls back to keyword-based intent matching and directly executes the TEE trade skill. The end-to-end signing and on-chain verification flow is identical — the LLM step is simply bypassed.

### Running the Integration Test Manually
```bash
# Make sure tee-worker/.env is configured with POLICY_VAULT_ADDRESS
npx hardhat test test/TEESignature.test.ts
```
This test:
1. Deploys a temporary `PolicyVault`
2. Spawns the Python TEE worker to discover its public key
3. Redeploys `PolicyVault` with the Python key as `defaultTeeKey`
4. Runs Python again to generate a signed payload for the final vault address
5. Calls `executeWithProof()` on-chain and asserts `ecrecover` matches

### Key Design Decisions for Judges
| Decision | Rationale |
|---|---|
| ECDSA key in constructor | Avoids 24h `KEY_ROTATION_COOLDOWN` during testing — key set at deploy time |
| `nonces[tokenId]` separated from Policy | Policy updates no longer reset replay protection |
| 0G Storage for memory | Stateful agent loop without bloating EVM state |
| `agentTeeKeys[tokenId]` per-agent override | Each iNFT can have its own TEE key; `defaultTeeKey` is the global fallback |
| `MockDEXAdapter` implements `IDEXAdapter` | Stateless, upgradeable adapter pattern; real DEX integration via `XSwapAdapter` |

---

## 📁 Project Structure

```
SealedClaw/
├── contracts/
│   ├── SealedClawAgent.sol        # ERC-7857 iNFT — agent identity
│   ├── PolicyVault.sol            # TEE verification + risk enforcement
│   ├── StrategyVault.sol          # On-chain strategy class registry
│   ├── AgentMarketplace.sol       # iNFT listing & purchase
│   ├── TEEAttestationRegistry.sol # Hardware attestation verifier
│   ├── adapters/                  # XSwapAdapter (real DEX)
│   ├── mocks/                     # MockDEXAdapter (testing)
│   ├── interfaces/                # IDEXAdapter
│   ├── oracles/                   # ChainlinkOracleVerifier
│   └── legacy/                    # MockDEX.sol (deprecated, kept for reference)
├── tee-worker/
│   ├── main.py                    # TEE worker entrypoint
│   ├── agent/                     # Strategy engine + LLM (Groq)
│   ├── enclave/                   # ECDSA signing
│   ├── oracle/                    # Price feed fetcher
│   ├── storage/                   # 0G Storage read/write
│   └── payload/                   # Payload builder (abi.encodePacked)
├── scripts/
│   ├── deploy.ts                  # Full deployment script
│   └── setup_agent.ts             # Post-deploy agent initialization
├── test/
│   ├── TEESignature.test.ts       # Phase 1↔2 integration test
│   ├── TEEAttestation.test.ts     # Attestation registry tests
│   └── DEXAdapter.test.ts         # Adapter ecosystem tests
├── frontend/                      # React + Vite dashboard
├── orchestrator.py                # OpenClaw Agent orchestrator
└── telegram_bot.py                # Telegram interface
```

---

## 📜 License

MIT
