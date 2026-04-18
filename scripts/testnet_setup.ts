import { ethers } from "hardhat";
import fs from "fs";
import path from "path";

async function main() {
  const [deployer] = await ethers.getSigners();
  const newOwner = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8"; // dummy arbitrary owner
  
  console.log(`\nSetting up state on Testnet with account : ${deployer.address}`);

  const deploymentsPath = path.join(__dirname, "..", "deployments", "testnet.json");
  const deployments = JSON.parse(fs.readFileSync(deploymentsPath, "utf-8"));

  const agentAddress = deployments.SealedClawAgent;
  const vaultAddress = deployments.PolicyVault;

  const agentNFT = await ethers.getContractAt("SealedClawAgent", agentAddress);
  const vault = await ethers.getContractAt("PolicyVault", vaultAddress);

  // deposit some funds to relayer
  console.log("Depositing funds to PolicyVault to allow operations");
  await (await vault.deposit({ value: ethers.parseEther("0.05") })).wait();

  // 1. Mint Token 0
  try {
      if (await agentNFT.ownerOf(0)) {
          console.log("Token ID 0 already logic minted.");
      }
  } catch (e) {
      console.log("Minting Token ID 0...");
      await (await agentNFT.mintAgent("bafkreimockmockmock")).wait();
      console.log(`✅ Minted Token ID 0`);
  }

  // 2. Set Policy
  const policy = {
      maxDrawdown: 1000,
      riskMaxPercent: 10000,
      allowedTokens: ["0x0000000000000000000000000000000000000000"],
      allowedDEXs: ["0x000000000000000000000000000000000000dEaD"],
      dailyLimit: ethers.parseEther("100")
  };
  console.log("Updating policy...");
  await (await vault.updatePolicy(0, policy)).wait();
  console.log(`✅ Policy updated`);
  
  // 3. Initiate Transfer
  console.log("Initiating transfer...");
  await (await vault.initiateTransfer(0, newOwner)).wait();
  console.log(`✅ initiateTransfer called! newOwner: ${newOwner}`);

  // 4. Update .env
  const dotenvPath = path.join(__dirname, "..", ".env");
  let envContent = fs.existsSync(dotenvPath) ? fs.readFileSync(dotenvPath, "utf-8") : "";
  
  const envVars: any = {
    "POLICY_VAULT_ADDRESS": vaultAddress,
  };

  for (const [key, val] of Object.entries(envVars)) {
      if (envContent.includes(key + "=")) {
          envContent = envContent.replace(new RegExp(`${key}=.*`, "g"), `${key}=${val}`);
      } else {
          envContent += `\n${key}=${val}`;
      }
  }

  fs.writeFileSync(dotenvPath, envContent);
  console.log(`✅ Updated .env with Testnet addresses`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
