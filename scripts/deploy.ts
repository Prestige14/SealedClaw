// Run script: npx hardhat run scripts/deploy.ts --network galileo
import { ethers } from "hardhat";
import fs from "fs";
import path from "path";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log(`\nDeploying with account : ${deployer.address}`);

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log(`Account balance        : ${ethers.formatEther(balance)} ETH\n`);

  // ── 1. Deploy SealedClawAgent ────────────────────────────────────────────
  console.log("Deploying SealedClawAgent...");
  const SealedClawAgent = await ethers.getContractFactory("SealedClawAgent");
  const agentNFT = await SealedClawAgent.deploy(0n);
  await agentNFT.waitForDeployment();
  const agentNFTAddress = await agentNFT.getAddress();
  console.log(`SealedClawAgent deployed to: ${agentNFTAddress}`);

  // ── 2. Resolve TEE Public Key ─────────────────────────────────────────────
  const teeEnclaveAddr =
    process.env.TEE_PUB_KEY &&
      process.env.TEE_PUB_KEY !== "0xYourTeeEnclavePublicKeyHere"
      ? process.env.TEE_PUB_KEY
      : deployer.address;

  console.log(`\nTEE Enclave PubKey     : ${teeEnclaveAddr}`);
  if (teeEnclaveAddr === deployer.address) {
    console.warn(
      "⚠️  WARNING: Using deployer address as mock TEE key.\n" +
      "   Set TEE_PUB_KEY in .env for production.\n"
    );
  }

  // ── 3. Deploy PolicyVault ─────────────────────────────────────────────────
  console.log("\nDeploying PolicyVault...");
  const PolicyVault = await ethers.getContractFactory("PolicyVault");
  const vault = await PolicyVault.deploy(agentNFTAddress, teeEnclaveAddr);
  await vault.waitForDeployment();
  const vaultAddress = await vault.getAddress();
  console.log(`PolicyVault deployed to: ${vaultAddress}`);

  // ── 4. Deploy StrategyVault ───────────────────────────────────────────────
  console.log("\nDeploying StrategyVault...");
  const StrategyVault = await ethers.getContractFactory("StrategyVault");
  const strategyVault = await StrategyVault.deploy(agentNFTAddress, vaultAddress);
  await strategyVault.waitForDeployment();
  const strategyVaultAddress = await strategyVault.getAddress();
  console.log(`StrategyVault deployed to: ${strategyVaultAddress}`);

  // ── 5. Deploy MockDEX ─────────────────────────────────────────────────────
  console.log("\nDeploying MockDEX...");
  const MockDEX = await ethers.getContractFactory("MockDEX");
  const dex = await MockDEX.deploy();
  await dex.waitForDeployment();
  const dexAddress = await dex.getAddress();
  console.log(`MockDEX deployed to: ${dexAddress}`);

  // ── 6. Save deployment info ───────────────────────────────────────────────
  const deploymentsDir = path.join(__dirname, "..", "deployments");
  if (!fs.existsSync(deploymentsDir)) fs.mkdirSync(deploymentsDir);

  const payload = {
    network: "galileo",
    chainId: 16602,
    deployedAt: new Date().toISOString(),
    deployer: deployer.address,
    SealedClawAgent: agentNFTAddress,
    PolicyVault: vaultAddress,
    StrategyVault: strategyVaultAddress,
    MockDEX: dexAddress,
    teeEnclavePubKey: teeEnclaveAddr,
  };

  const outPath = path.join(deploymentsDir, "testnet.json");
  fs.writeFileSync(outPath, JSON.stringify(payload, null, 2));
  console.log(`\n📁 Saved → ${outPath}`);

  // ── 7. Print .env setup ───────────────────────────────────────────────────
  console.log("\n─── Add to your .env ─────────────────────────────────────────");
  console.log(`POLICY_VAULT_ADDRESS=${vaultAddress}`);
  console.log(`STRATEGY_VAULT_ADDRESS=${strategyVaultAddress}`);
  console.log(`TARGET_DEX_ADDRESS=${dexAddress}`);
  console.log("──────────────────────────────────────────────────────────────\n");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});