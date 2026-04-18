# SealedClaw Agentic iNFT Framework

**Sovereign Autonomous Trading Agents — Built for 0G APAC Hackathon 2026**

SealedClaw is a pioneering framework for **Agentic iNFTs** (ERC-7857) built on the 0G ecosystem. It combines **Trusted Execution Environments (TEE)** with **0G Storage** and **0G Testnet** to create a secure, tamper-proof environment for AI agents that trade autonomously.

---

## 🚀 Live on 0G Galileo Testnet

The following infrastructure is deployed and verified on the 0G Galileo Testnet:

| Component | Contract Address |
| :--- | :--- |
| **SealedClawAgent** (ERC-7857 iNFT) | [`0x0D49E6f39370F3b01a87054c518C57bB729023E5`](https://chainscan-galileo.0g.ai/address/0x0D49E6f39370F3b01a87054c518C57bB729023E5) |
| **PolicyVault** (Risk & Handover) | [`0x03dEB78c61D8e3463EE7918066de2D9Ed7cF5186`](https://chainscan-galileo.0g.ai/address/0x03dEB78c61D8e3463EE7918066de2D9Ed7cF5186) |

- **Network**: 0G Galileo Testnet (Chain ID: `16602`)
- **Telegram Bot**: [@sealed_claw_bot](https://t.me/sealed_claw_bot)
- **Web Dashboard**: Runs locally via `frontend/`

---

## 🛠 Handover Protocol (Phase 4)

One of SealedClaw's core innovations is the **Secure Handover Protocol**. This allows AI agents to be traded safely between owners without exposing sensitive trading strategies.

1. **Initiate Transfer**: The current owner calls `initiateTransfer(tokenId, newOwner)`.
2. **48-Hour Cooldown**: A mandatory time-window where the Agent enters **Reduce-Only** mode.
3. **TEE Restriction**: The TEE Worker detects the pending transfer on-chain and automatically overrides all BUY signals with REDUCE-ONLY signals.
4. **Memory Re-encryption**: The TEE worker re-encrypts its decentralized memory (0G Storage) for the new owner, ensuring the seller has zero access post-sale.

---

## 🤖 Final Phase: Full Ecosystem Integration

SealedClaw is now a complete end-to-end ecosystem:

### 1. Telegram NLP Integration
- Users can talk to their agent via **Telegram**, powered by the **OpenClaw SDK**.
- Messages are processed as *Intents* (e.g., "Optimize yield with 5% risk").
- The Orchestrator relays these to the TEE Worker for secure blockchain execution on 0G.

### 2. Web Dashboard (Premium UI)
- A React-based SPA in the `frontend/` directory providing a visual dashboard for:
  - **Minting**: Initializing your Agentic iNFT.
  - **Depositing**: Funding your agent's trading balance.
  - **Handover**: Triggering the Phase 4 protocol with glassmorphism UI.

---

## 📂 Project Structure

```bash
SealedClaw/
├── contracts/          # Solidity Smart Contracts (ERC-7857 & Vault)
├── frontend/           # React + Vite + Tailwind Dashboard
├── tee-worker/         # Python TEE Simulator (Keyderivation, Crypto, Oracle)
├── orchestrator.py     # OpenClaw Agent SDK (Intent Routing)
├── telegram_bot.py     # Telegram Bot Interface
├── scripts/            # Deployment & Testnet Setup Scripts
└── requirements.txt    # Python Dependencies
```

## ⚡ Quick Start

### 1. Requirements
- Node.js 18+, Python 3.11+, MetaMask.
- `.env` with `OPENAI_API_KEY`, `PRIVATE_KEY`, and `TELEGRAM_BOT_TOKEN`.

### 2. Start the Agent
```bash
# Install and run the Telegram Bot
pip install -r requirements.txt
python telegram_bot.py

# Launch the Web Dashboard
cd frontend
npm install
npm run dev
```

---

## 🏆 Hackathon Roadmap

- [x] **Phase 1** — ERC-7857 Foundation & Verification logic.
- [x] **Phase 2** — TEE Worker simulation & ECDSA compatibility.
- [x] **Phase 3** — 0G Storage integration & Decentralized Memory.
- [x] **Phase 4** — Secure Handover Protocol & Reduce-Only Enforcement.
- [x] **Phase 5** — Telegram Bot & Premium Web Dashboard.

---
**SealedClaw is ready to redefine autonomous agency on the 0G Network. 🛡️⚡**
