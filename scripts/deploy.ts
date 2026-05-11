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

  // ── 3. Deploy TEEAttestationRegistry ─────────────────────────────────────
  console.log("\nDeploying TEEAttestationRegistry...");
  const TEEAttestationRegistry = await ethers.getContractFactory("TEEAttestationRegistry");
  const registry = await TEEAttestationRegistry.deploy();
  await registry.waitForDeployment();
  const registryAddress = await registry.getAddress();
  console.log(`TEEAttestationRegistry deployed to: ${registryAddress}`);

  // ── 4. Deploy PolicyVault ─────────────────────────────────────────────────
  console.log("\nDeploying PolicyVault...");
  const PolicyVault = await ethers.getContractFactory("PolicyVault");
  const vault = await PolicyVault.deploy(agentNFTAddress, teeEnclaveAddr, registryAddress);
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

  // ── 5. Deploy Adapters ─────────────────────────────────────────────────────
  console.log("\nDeploying MockDEXAdapter...");
  const MockDEXAdapter = await ethers.getContractFactory("MockDEXAdapter");
  const dexAdapter = await MockDEXAdapter.deploy();
  await dexAdapter.waitForDeployment();
  const dexAdapterAddress = await dexAdapter.getAddress();
  console.log(`MockDEXAdapter deployed to: ${dexAdapterAddress}`);

  console.log("Approving MockDEXAdapter in PolicyVault...");
  await vault.setAdapter(dexAdapterAddress, true);

  // Resolve XSwap router addresses from env — fall back to deployer for testnet demo
  const networkName = hre.network.name;
  const isMainnet = networkName === "og_mainnet";

  const xSwapRouter = process.env.XSWAP_ROUTER_ADDRESS;
  const wNativeAddr  = process.env.WNATIVE_ADDRESS;

  if (isMainnet && (!xSwapRouter || !wNativeAddr)) {
    throw new Error(
      "❌ CRITICAL: Cannot deploy to Mainnet without XSWAP_ROUTER_ADDRESS and WNATIVE_ADDRESS.\n" +
      "   Please set these in your .env file."
    );
  }

  const finalRouter = xSwapRouter || deployer.address;
  const finalWNative = wNativeAddr  || deployer.address;

  if (!xSwapRouter || !wNativeAddr) {
    console.warn(
      "\n⚠️  WARNING: XSwapAdapter deployed with MOCK router/wNative (deployer.address).\n" +
      "   Set XSWAP_ROUTER_ADDRESS and WNATIVE_ADDRESS in .env for production.\n"
    );
  }
  console.log("\nDeploying XSwapAdapter...");
  const XSwapAdapter = await ethers.getContractFactory("XSwapAdapter");
  const xSwap = await XSwapAdapter.deploy(finalRouter, finalWNative);
  await xSwap.waitForDeployment();
  const xSwapAddress = await xSwap.getAddress();
  console.log(`XSwapAdapter deployed to: ${xSwapAddress}`);

  console.log("Approving XSwapAdapter in PolicyVault...");
  await vault.setAdapter(xSwapAddress, true);

  // ── 6. Deploy ChainlinkOracleVerifier ─────────────────────────────────────
  console.log("\nDeploying ChainlinkOracleVerifier...");
  const ChainlinkOracleVerifier = await ethers.getContractFactory("ChainlinkOracleVerifier");
  const oracleVerifier = await ChainlinkOracleVerifier.deploy();
  await oracleVerifier.waitForDeployment();
  const oracleVerifierAddress = await oracleVerifier.getAddress();
  console.log(`ChainlinkOracleVerifier deployed to: ${oracleVerifierAddress}`);

  // ── 7. Deploy AgentMarketplace ─────────────────────────────────────────────
  console.log("\nDeploying AgentMarketplace...");
  const AgentMarketplace = await ethers.getContractFactory("AgentMarketplace");
  const marketplace = await AgentMarketplace.deploy(agentNFTAddress, strategyVaultAddress);
  await marketplace.waitForDeployment();
  const marketplaceAddress = await marketplace.getAddress();
  console.log(`AgentMarketplace deployed to: ${marketplaceAddress}`);

  // ── 6. Save deployment info ───────────────────────────────────────────────
  const deploymentsDir = path.join(__dirname, "..", "deployments");
  if (!fs.existsSync(deploymentsDir)) fs.mkdirSync(deploymentsDir);

  const payload = {
    network: "galileo",
    chainId: 16602,
    deployedAt: new Date().toISOString(),
    deployer: deployer.address,
    SealedClawAgent: agentNFTAddress,
    TEEAttestationRegistry: registryAddress,
    PolicyVault: vaultAddress,
    StrategyVault: strategyVaultAddress,
    MockDEXAdapter: dexAdapterAddress,
    XSwapAdapter: xSwapAddress,
    ChainlinkOracleVerifier: oracleVerifierAddress,
    AgentMarketplace: marketplaceAddress,
    teeEnclavePubKey: teeEnclaveAddr,
  };

  const outPath = path.join(deploymentsDir, "testnet.json");
  fs.writeFileSync(outPath, JSON.stringify(payload, null, 2));
  console.log(`\n📁 Saved → ${outPath}`);

  console.log("\n─── Add to your .env ─────────────────────────────────────────");
  console.log(`POLICY_VAULT_ADDRESS=${vaultAddress}`);
  console.log(`STRATEGY_VAULT_ADDRESS=${strategyVaultAddress}`);
  console.log(`TARGET_DEX_ADDRESS=${dexAdapterAddress}`);
  console.log(`CHAINLINK_VERIFIER_ADDRESS=${oracleVerifierAddress}`);
  console.log("──────────────────────────────────────────────────────────────\n");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});