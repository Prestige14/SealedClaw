import { ethers } from "hardhat";
import fs from "fs";
import path from "path";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log(`Using account: ${deployer.address}`);

  // Load deployed addresses from deployments/testnet.json
  const deploymentsPath = path.join(__dirname, "..", "deployments", "testnet.json");
  const deployments = JSON.parse(fs.readFileSync(deploymentsPath, "utf-8"));

  const SealedClawAgent = await ethers.getContractAt("SealedClawAgent", deployments.SealedClawAgent);
  const PolicyVault = await ethers.getContractAt("PolicyVault", deployments.PolicyVault);
  const StrategyVault = await ethers.getContractAt("StrategyVault", deployments.StrategyVault);

  console.log("Minting Token ID 0...");
  try {
      const mintTx = await SealedClawAgent.mintAgent("bafkreimockmockmock");
      await mintTx.wait();
      console.log("✅ Minted Agent 0");
  } catch (e) {
      console.log("Token ID 0 might already be minted on this instance.");
  }

  console.log("Updating Policy for Token 0...");
  const policy = {
      maxDrawdown: 1000,
      riskMaxPercent: 10000,
      allowedTokens: ["0x0000000000000000000000000000000000000000"],
      allowedDEXs: [deployments.MockDEX],
      dailyLimit: ethers.parseEther("100")
  };
  const policyTx = await PolicyVault.updatePolicy(0, policy);
  await policyTx.wait();
  console.log("✅ Policy set");

  console.log("Setting Moon Chaser Strategy...");
  const stratTx = await StrategyVault.commitStrategy(0, 3); // Moon Chaser = 3
  await stratTx.wait();
  console.log("✅ Strategy set to Moon Chaser");

  console.log(`Depositing 0.5 A0GI to Vault for Token 0...`);
  const depTx = await PolicyVault.getFunction("deposit(uint256)").send(0, { value: ethers.parseEther("0.5") });
  await depTx.wait();
  console.log("✅ Deposit successful");

  // Update .env with new addresses
  const dotenvPath = path.join(__dirname, "..", ".env");
  let envContent = fs.existsSync(dotenvPath) ? fs.readFileSync(dotenvPath, "utf-8") : "";
  
  const envVars: any = {
    "POLICY_VAULT_ADDRESS": deployments.PolicyVault,
    "STRATEGY_VAULT_ADDRESS": deployments.StrategyVault,
    "TARGET_DEX_ADDRESS": deployments.MockDEX,
    "AGENT_ADDRESS": deployments.SealedClawAgent
  };

  for (const [key, val] of Object.entries(envVars)) {
      if (envContent.includes(key + "=")) {
          envContent = envContent.replace(new RegExp(`${key}=.*`, "g"), `${key}=${val}`);
      } else {
          envContent += `\n${key}=${val}`;
      }
  }

  // Ensure CURRENT_NONCE is reset to 0 in .env for TEE Worker config
  if (envContent.includes("CURRENT_NONCE=")) {
      envContent = envContent.replace(/CURRENT_NONCE=.*/g, "CURRENT_NONCE=0");
  } else {
      envContent += `\nCURRENT_NONCE=0`;
  }

  fs.writeFileSync(dotenvPath, envContent);
  console.log("✅ Validated .env configuration");
  console.log("Setup complete! Dashboard and Agent should now work perfectly.");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
