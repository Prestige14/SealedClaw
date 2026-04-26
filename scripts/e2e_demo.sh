#!/bin/bash
# SealedClaw End-to-End Demo Script
# Usage: bash scripts/e2e_demo.sh

set -e  # Exit on error

echo "🚀 SealedClaw E2E Demo | 0G Galileo Testnet"
echo "================================================"

# Step 1: Check prerequisites
echo "📋 Checking prerequisites..."
command -v node >/dev/null || { echo "❌ Node.js not found"; exit 1; }
command -v python3 >/dev/null || { echo "❌ Python3 not found"; exit 1; }
[ -f "tee-worker/.env" ] || { echo "❌ tee-worker/.env not found. Copy from .env.example and fill values."; exit 1; }

# Step 2: Generate TEE payload
echo ""
echo "🔐 Phase 1: TEE Worker generating trading signal..."
cd tee-worker
python3 main.py --output /tmp/sealedclaw_payload.json
cd ..
echo "✅ Payload generated: /tmp/sealedclaw_payload.json"

# Step 3: Submit to chain
echo ""
echo "⛓️  Phase 2: Submitting executeWithProof to 0G..."
npx hardhat run scripts/submit_payload.ts --network galileo

echo ""
echo "================================================"
echo "✅ Demo complete! Check explorer for transaction."
