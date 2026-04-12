# SealedClaw Trader

**Sovereign iNFT Trading Agent built for the 0G APAC Hackathon 2026**

SealedClaw is an autonomous on-chain trading agent powered by ERC-7857 Agentic iNFTs, TEE-based ECDSA signature verification, and 0G Storage for encrypted memory persistence. Phase 1 (Foundation & Smart Contracts) is fully deployed to 0G Galileo Testnet.

---

## ✅ Deployed Contracts — 0G Galileo Testnet

| Contract | Address |
|---|---|
| **SealedClawAgent** | [`0xD836bC71C9ECAe447F3f323d9C4E982A0ad178D2`](https://chainscan-galileo.0g.ai/address/0xD836bC71C9ECAe447F3f323d9C4E982A0ad178D2) |
| **PolicyVault** | [`0x60aC7E3E0e7D498fCa1d7F526BB21F90d1E43D5F`](https://chainscan-galileo.0g.ai/address/0x60aC7E3E0e7D498fCa1d7F526BB21F90d1E43D5F) |

- **Network**: 0G Galileo Testnet
- **Chain ID**: `16602`
- **RPC**: `https://evmrpc-testnet.0g.ai`
- **Deployed at**: 2026-04-12T15:38:53Z
- **Deployer**: `0x1960C0c9A89755eA6E56758C8fFb1e03180B1521`

---

## 🚀 Features

- **ERC-7857 Agentic iNFT** — `SealedClawAgent.sol` implements the 0G agentic iNFT standard. Each agent NFT stores an encrypted metadata CID on 0G Storage (`0g://` protocol prefix). Anyone can mint their own agent; the owner controls metadata updates and usage authorization.

- **PolicyVault** — Custody vault that enforces per-agent risk policies on-chain:
  - Maximum drawdown (basis points)
  - Per-trade size cap (`riskMaxPercent`)
  - Daily spending limit (`dailyLimit`) with automatic day-boundary reset
  - DEX allowlist enforcement
  - 24-hour cooldown on TEE key rotation

- **TEE ECDSA Verification** — `executeWithProof()` verifies an ECDSA signature produced inside a Trusted Execution Environment (TEE) enclave before executing any strategy. Prevents unauthorized trades. Signature binds `tokenId + strategyData + nonce + deadline + address(this)` to block cross-contract replay.

- **Nonce Anti-Replay** — Nonces stored in a separate mapping (`nonces[tokenId]`), independent of policy updates. Updating a policy never resets the nonce.

- **OpenZeppelin v5 Security Primitives**: `ReentrancyGuard`, `Pausable`, `Ownable` applied throughout.

---

## 🛠 Setup

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment
```bash
cp .env.example .env
```

Edit `.env`:
```env
PRIVATE_KEY=your_wallet_private_key
RPC_URL=https://evmrpc-testnet.0g.ai
ETHERSCAN_API_KEY=your_0g_chainscan_api_key
TEE_PUB_KEY=0xYourTeeEnclaveAddressHere
```

> ⚠️ **Never commit `.env`** — it is listed in `.gitignore`.

### 3. Compile Contracts
```bash
npm run compile
```

Compiled against Solidity `^0.8.24`, EVM target `cancun` (required for OpenZeppelin v5 `mcopy` opcode).

### 4. Deploy to 0G Galileo Testnet
```bash
npm run deploy:testnet
```

Deployment info is automatically saved to `deployments/testnet.json`.

### 5. Verify on 0G Explorer
```bash
npx hardhat verify --network galileo 0xD836bC71C9ECAe447F3f323d9C4E982A0ad178D2 "0"

npx hardhat verify --network galileo 0x60aC7E3E0e7D498fCa1d7F526BB21F90d1E43D5F \
  "0xD836bC71C9ECAe447F3f323d9C4E982A0ad178D2" \
  "0x1960C0c9A89755eA6E56758C8fFb1e03180B1521"
```

---

## 📁 Project Structure

```
SealedClaw/
├── contracts/
│   ├── SealedClawAgent.sol   # ERC-7857 iNFT contract
│   └── PolicyVault.sol       # Risk policy + TEE ECDSA vault
├── scripts/
│   └── deploy.ts             # Deployment script (Galileo testnet)
├── deployments/
│   └── testnet.json          # Auto-generated deployment info
├── hardhat.config.ts         # Hardhat config (chainId 16602, evmVersion: cancun)
├── .env.example              # Environment variable template
└── package.json
```

---

## 🔧 Technical Stack

| Layer | Tech |
|---|---|
| Smart Contracts | Solidity `^0.8.24` |
| EVM Target | Cancun (for OZ v5 `mcopy`) |
| Framework | Hardhat `^2.22` + TypeScript |
| Libraries | OpenZeppelin Contracts `^5.0` |
| Network | 0G Galileo Testnet (Chain ID: 16602) |
| Storage Protocol | 0G Storage (`0g://` CID prefix) |
| Key Security | TEE ECDSA (mock deployer key for testnet) |

---

## 🗺 Roadmap

- [x] Phase 1 — Smart contract foundation & testnet deployment
- [ ] Phase 2 — TEE enclave integration + real 0G Storage CID pinning
- [ ] Phase 3 — Off-chain trading strategy engine + DEX integrations
- [ ] Phase 4 — Frontend dashboard + agent marketplace
