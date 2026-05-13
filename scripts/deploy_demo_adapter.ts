/**
 * deploy_demo_adapter.ts
 * Deploys the SimpleTestAdapter (demo-safe DEX adapter) to 0G Aristotle Mainnet
 * and registers it in PolicyVault as an approved adapter.
 *
 * Run: npx hardhat run scripts/deploy_demo_adapter.ts --network og_mainnet
 */
import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("Balance:", ethers.formatEther(balance), "ETH\n");

  // 1. Deploy SimpleTestAdapter
  console.log("[1] Deploying SimpleTestAdapter...");
  const Adapter = await ethers.getContractFactory("SimpleTestAdapter");
  const adapter = await Adapter.deploy();
  await adapter.waitForDeployment();
  const adapterAddress = await adapter.getAddress();
  console.log("[+] SimpleTestAdapter deployed at:", adapterAddress);

  // 2. Register as approved adapter in PolicyVault
  const POLICY_VAULT = process.env.POLICY_VAULT_ADDRESS!;
  if (!POLICY_VAULT) throw new Error("POLICY_VAULT_ADDRESS not set in .env");

  console.log("\n[2] Registering adapter in PolicyVault:", POLICY_VAULT);
  const vault = await ethers.getContractAt("PolicyVault", POLICY_VAULT);
  const tx1 = await vault.setAdapter(adapterAddress, true);
  await tx1.wait();
  console.log("[+] Adapter approved globally. Tx:", tx1.hash);

  // 3. Update policy for Token #0 to allow the new adapter
  const TOKEN_ID = 0;
  const policy = await vault.getPolicy(TOKEN_ID);
  // Convert read-only Result arrays to mutable JS arrays
  const existingDEXs: string[] = Array.from(policy.allowedDEXs as unknown as string[]);
  const existingTokens: string[] = Array.from(policy.allowedTokens as unknown as string[]);
  const newAllowedDEXs = [...new Set([...existingDEXs, adapterAddress])];
  const newPolicy = [
    policy.maxDrawdown > 0n ? policy.maxDrawdown : 1000n,
    policy.riskMaxPercent > 0n ? policy.riskMaxPercent : 500n,
    existingTokens,
    newAllowedDEXs,
    policy.dailyLimit > 0n ? policy.dailyLimit : ethers.parseEther("1"),
  ];
  const tx2 = await vault.updatePolicy(TOKEN_ID, newPolicy);
  await tx2.wait();
  console.log("[+] Policy updated to include new adapter. Tx:", tx2.hash);

  console.log("\n============================================================");
  console.log("  DONE — Update these env vars in HF Secrets:");
  console.log(`  TARGET_DEX_ADDRESS = ${adapterAddress}`);
  console.log("============================================================");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
