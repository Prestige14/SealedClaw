# SealedClaw Trader - Phase 1

**Sovereign iNFT Trading Agent built for 0G APAC Hackathon 2026**

Phase 1 (Foundation & Smart Contracts) has been fully completed and is ready for production.

## Features 🚀
- **ERC-7857 Agentic iNFT**: Proper implementation of the 0G standard including encapsulated storage logic (`SealedClawAgent.sol`).
- **PolicyVault**: Core constraint-enforcing vault that governs agent interactions and thresholds (`PolicyVault.sol`).
- **Sealed Inference ECDSA Verification**: Using secure keys derived from TEE enclaves to prevent arbitrary execution, ensuring verifiable actions combined with strict `nonReentrant` and anti-replay methodologies (`executeWithProof()`).
- **0G Galileo Deployment Setup**: Verified deployment pipeline tailored for 0G testnet Chain ID 16601.

## Setup Instructions

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment
Copy our `.env.example` to `.env` and fill in your keys:
```bash
cp .env.example .env
```
Ensure you have testnet equivalents covering gas on the 0G Galileo testnet (`https://evmrpc-testnet.0g.ai`).

### 3. Compile Contracts
```bash
npm run compile
```

### 4. Deploy to 0G Galileo Testnet
```bash
npm run deploy:testnet
```
After successful deployment, addresses securely auto-map to `deployments/testnet.json`.

### 5. Verify Source on Block Explorer
Follow the console output instructions during deployment to verify using the chainscan explorer tools via Hardhat.

## Testnet Contract Addresses
- **SealedClawAgent**: *[TBD after running deploy script - paste here]*
- **PolicyVault**: *[TBD after running deploy script - paste here]*

## Developed standard conventions:
- Solidity `^0.8.24` strict mode enabled
- Floating points prevented (scaling up via BPS)
- Standard OpenZeppelin implementations applied:
  - `ReentrancyGuard`
  - `Pausable` overrides for failsafes
  - `Ownable`
