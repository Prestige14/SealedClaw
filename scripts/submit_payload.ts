import { ethers } from "hardhat";
import * as fs from "fs";
import { CONFIG } from "../frontend/src/config";

async function main() {
  const payloadPath = "/tmp/sealedclaw_payload.json";
  
  if (!fs.existsSync(payloadPath)) {
    console.error(`❌ Payload file not found at ${payloadPath}`);
    process.exit(1);
  }

  const payload = JSON.parse(fs.readFileSync(payloadPath, "utf8"));
  
  const [deployer] = await ethers.getSigners();
  console.log(`\n📤 Submitting from: ${deployer.address}`);
  
  // Use the ABI from artifacts or a minimal one
  const vault = await ethers.getContractAt(
    "PolicyVault",
    CONFIG.VAULT_ADDRESS
  );
  
  console.log(`🎯 Token ID: ${payload.tokenId}`);
  console.log(`📊 Strategy: ${payload.strategyData.slice(0, 30)}...`);
  
  // Verify nonce before submit
  const currentNonce = await vault.getNonce(payload.tokenId);
  if (currentNonce.toString() !== payload.nonce_used.toString()) {
    console.warn(`⚠️  Nonce mismatch! Chain: ${currentNonce}, Payload: ${payload.nonce_used}`);
    // We continue anyway if it's a demo, but usually this would fail
  }
  
  console.log(`⏳ Submitting executeWithProof...`);
  
  const tx = await vault.executeWithProof(
    payload.tokenId,
    payload.strategyData,
    payload.tradeAmount,
    payload.targetDEX,
    payload.signature,
    payload.deadline,
    { gasLimit: 1000000 }
  );
  
  console.log(`\n🚀 Transaction submitted: ${tx.hash}`);
  const receipt = await tx.wait();
  
  if (receipt?.status === 1) {
    console.log(`✅ Confirmed in block: ${receipt.blockNumber}`);
    console.log(`🔗 Explorer: ${CONFIG.EXPLORER_URL}/tx/${tx.hash}`);
  } else {
    console.log(`❌ Transaction FAILED`);
  }
}

main().catch(console.error);
