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

  // mintPrice = 0 for hackathon (free mint)
  const agentNFT = await SealedClawAgent.deploy(0n);
  await agentNFT.waitForDeployment();
  const agentNFTAddress = await agentNFT.getAddress();
  console.log(`SealedClawAgent deployed to: ${agentNFTAddress}`);

  // ── 2. Resolve TEE Public Key ─────────────────────────────────────────────
  // In production: replace with the actual Ethereum address derived from
  // the ECDSA public key generated inside the TEE enclave.
  // For testnet / hackathon: falls back to deployer address as mock.
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

  // ── 4. Save deployment info ───────────────────────────────────────────────
  const deploymentsDir = path.join(__dirname, "..", "deployments");
  if (!fs.existsSync(deploymentsDir)) fs.mkdirSync(deploymentsDir);

  const payload = {
    network: "galileo",
    chainId: 16602,
    deployedAt: new Date().toISOString(),
    deployer: deployer.address,
    SealedClawAgent: agentNFTAddress,
    PolicyVault: vaultAddress,
    teeEnclavePubKey: teeEnclaveAddr,
  };

  const outPath = path.join(deploymentsDir, "testnet.json");
  fs.writeFileSync(outPath, JSON.stringify(payload, null, 2));
  console.log(`\n📁 Saved → ${outPath}`);

  // ── 5. Verification commands ──────────────────────────────────────────────
  console.log("\n── Verify on 0G Explorer ──────────────────────────────────");
  console.log(
    `npx hardhat verify --network galileo ${agentNFTAddress} "0"`
  );
  console.log(
    `npx hardhat verify --network galileo ${vaultAddress}` +
    ` "${agentNFTAddress}" "${teeEnclaveAddr}"`
  );
  console.log("─────────────────────────────────────────────────────────────\n");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});