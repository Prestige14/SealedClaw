# SealedClaw Deployment & Reproduction Guide

This guide is intended for hackathon judges and developers who wish to deploy or verify the SealedClaw ecosystem on 0G Mainnet.

## Prerequisites
- **Node.js v18+**
- **Python 3.11+**
- **Docker & Docker Compose**
- A wallet funded with **$0G tokens** on the 0G Mainnet.

## 1. Environment Setup
Clone the repository and install dependencies:
```bash
git clone <repo-url>
cd SealedClaw
npm install
pip install -r requirements.txt
```

Create your `.env` file from the example:
```bash
cp .env.example .env
```
Fill in the following mandatory fields:
- `PRIVATE_KEY`: Your deployer wallet private key.
- `RELAYER_PRIVATE_KEY`: Your relayer wallet private key.
- `GROQ_API_KEY`: Get a free key from [console.groq.com](https://console.groq.com).
- `MAINNET_RPC_URL`: `https://rpc.ankr.com/0g_mainnet_evm`

## 2. Smart Contract Deployment
To deploy a fresh set of contracts to 0G Mainnet:
```bash
npx hardhat run scripts/deploy.ts --network og_mainnet
```
The script will output the addresses for `PolicyVault`, `SealedClawAgent`, and `XSwapAdapter`. Update your `.env` with these values.

## 3. Running with Docker (Recommended)
SealedClaw's backend (Orchestrator + API) is containerized for easy deployment.
```bash
docker-compose up --build -d
```
This will:
- Start the **FastAPI Bridge** on port `8000`.
- Start the **Orchestrator** which runs trading cycles every 60 seconds.

## 4. Launching the Frontend
```bash
cd frontend
npm install
npm run dev
```
Access the dashboard at `http://localhost:5173`. Ensure `frontend/src/config.js` points to your newly deployed contract addresses.

## 5. Verification
- **Health Check**: Visit `http://localhost:8000/health` to verify the API is live.
- **Agent Status**: Visit `http://localhost:8000/status` to see the real-time thought process of the agent.
- **On-Chain**: Check the [0G ChainScan](https://chainscan.0g.ai) for transactions involving your `PolicyVault` address.

## Troubleshooting
- **ENOTFOUND**: If the RPC URL is unreachable, ensure you are using a stable provider like Ankr or QuickNode.
- **Insufficient Balance**: Ensure both the `PRIVATE_KEY` (deployer/owner) and `RELAYER_PRIVATE_KEY` have enough $0G for gas.
