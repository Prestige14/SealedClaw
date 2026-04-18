import { ethers } from "hardhat";
import fs from "fs";
import path from "path";

async function main() {
  const [deployer, newOwner] = await ethers.getSigners();
  console.log(`\nDeploying with account : ${deployer.address}`);

  // 1. Deploy
  const SealedClawAgent = await ethers.getContractFactory("SealedClawAgent");
  const agentNFT = await SealedClawAgent.deploy(0n);
  await agentNFT.waitForDeployment();
  const agentAddress = await agentNFT.getAddress();

  const teePub = "0xf706e2e1f24fa67297f37063d5b36f775f16261e"; // python derived tee pub key
  const PolicyVault = await ethers.getContractFactory("PolicyVault");
  const vault = await PolicyVault.deploy(agentAddress, teePub);
  await vault.waitForDeployment();
  const vaultAddress = await vault.getAddress();
  
  console.log(`✅ Deployed PolicyVault at ${vaultAddress}`);

  // deposit some funds to relayer
  console.log("Depositing funds to PolicyVault to allow operations if checked");
  await (await vault.deposit({ value: ethers.parseEther("1.0") })).wait();

  // 2. Setup (Mint & Policy)
  await (await agentNFT.mintAgent("bafkreimockmockmock")).wait();
  console.log(`✅ Minted Token ID 0`);

  const policy = {
      maxDrawdown: 1000,
      riskMaxPercent: 10000,
      allowedTokens: ["0x0000000000000000000000000000000000000000"],
      allowedDEXs: ["0x000000000000000000000000000000000000dEaD"],
      dailyLimit: ethers.parseEther("100")
  };
  await (await vault.updatePolicy(0, policy)).wait();
  console.log(`✅ Policy updated`);
  
  // 3. Initiate Transfer
  await (await vault.initiateTransfer(0, newOwner.address)).wait();
  console.log(`✅ initiateTransfer called! newOwner: ${newOwner.address}`);

  // 4. Update .env
  const dotenvPath = path.join(__dirname, "..", ".env");
  let envContent = fs.existsSync(dotenvPath) ? fs.readFileSync(dotenvPath, "utf-8") : "";
  
  const envVars: any = {
    "POLICY_VAULT_ADDRESS": vaultAddress,
    "RPC_URL": "http://127.0.0.1:8545",
    "RELAYER_PRIVATE_KEY": "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
    "TOKEN_ID": "0",
    "TEE_IDENTITY": "sealed-claw-tee-v1-mrenclave-default"
  };

  for (const [key, val] of Object.entries(envVars)) {
      if (envContent.includes(key + "=")) {
          envContent = envContent.replace(new RegExp(`${key}=.*`, "g"), `${key}=${val}`);
      } else {
          envContent += `\n${key}=${val}`;
      }
  }

  fs.writeFileSync(dotenvPath, envContent);
  console.log(`✅ Updated .env with new POLICY_VAULT_ADDRESS=${vaultAddress}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
