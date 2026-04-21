import { ethers } from "hardhat";
import fs from "fs";
import path from "path";

async function main() {
  const deploymentsPath = path.join(__dirname, "..", "deployments", "testnet.json");
  const deps = JSON.parse(fs.readFileSync(deploymentsPath, "utf-8"));
  
  const vault = await ethers.getContractAt("PolicyVault", deps.PolicyVault);
  const agent = await ethers.getContractAt("SealedClawAgent", deps.SealedClawAgent);
  const dex   = await ethers.getContractAt("MockDEX", deps.MockDEX);

  console.log("\n--- Final System Check ---");
  console.log(`Vault Address: ${deps.PolicyVault}`);
  
  const owner = await agent.ownerOf(0);
  console.log(`Token 0 Owner: ${owner}`);

  const vBal = await ethers.provider.getBalance(deps.PolicyVault);
  console.log(`Vault Native Balance: ${ethers.formatEther(vBal)} A0GI`);

  const vb0 = await vault.vaultBalances(0);
  console.log(`Token 0 Vault Credit: ${ethers.formatEther(vb0)} A0GI`);

  const dBal = await ethers.provider.getBalance(deps.MockDEX);
  console.log(`MockDEX Native Balance: ${ethers.formatEther(dBal)} A0GI`);
  
  const vETH = await dex.getVirtualBalance(0, "ETH");
  console.log(`Token 0 vETH: ${ethers.formatEther(vETH)}`);

  console.log("\n--- Readiness ---");
  if (vb0 > 0n || vBal > 0n) {
      console.log("✅ SYSTEM READY: Vault is funded.");
  } else {
      console.log("⚠️ WARNING: Vault has 0 balance. You need to Deposit again.");
  }
}

main().catch(console.error);
