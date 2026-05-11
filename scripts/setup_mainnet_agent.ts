import { ethers } from "hardhat";
import * as dotenv from "dotenv";

dotenv.config();

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Setting up agent on Mainnet with account:", deployer.address);

  const AGENT_ADDRESS = "0xD836bC71C9ECAe447F3f323d9C4E982A0ad178D2";
  const VAULT_ADDRESS = "0xBe9Db7735B06FEa557f3Aa18317eaB229BA6ebC5";
  const TARGET_DEX = "0x701D2037002F20c57217a7B0Cb04104622EF297C";

  const agent = await ethers.getContractAt("SealedClawAgent", AGENT_ADDRESS);
  const vault = await ethers.getContractAt("PolicyVault", VAULT_ADDRESS);

  // 1. Mint Agent #0 if not already minted
  try {
    const owner = await agent.ownerOf(0);
    console.log(`Agent #0 already exists. Owned by: ${owner}`);
  } catch (e) {
    console.log("Minting Agent #0...");
    const tx = await agent.mintAgent("ipfs://QmSealedClawInitialMetadata");
    await tx.wait();
    console.log("Agent #0 minted!");
  }

  // 2. Set Initial Policy
  console.log("Setting initial policy in PolicyVault...");
  const initialPolicy = {
    maxDrawdown: 1000, // 10%
    riskMaxPercent: 500, // 5%
    allowedTokens: [],
    allowedDEXs: [TARGET_DEX],
    dailyLimit: ethers.parseEther("1.0") // 1.0 $0G
  };

  const tx2 = await vault.updatePolicy(0, initialPolicy);
  await tx2.wait();
  console.log("Policy initialized!");

  // 3. Deposit some $0G to the vault
  const balance = await vault.getVaultBalance(0);
  if (balance === 0n) {
    console.log("Depositing 0.1 $0G to Agent #0 Vault...");
    const tx3 = await vault.deposit(0, { value: ethers.parseEther("0.1") });
    await tx3.wait();
    console.log("Deposit successful!");
  }

  console.log("\n--- SETUP COMPLETE ---");
  console.log("Your agent is now ready to trade on Mainnet.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
