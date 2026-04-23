import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  const currentVaultAddress = "0x65d1B448a2765511B941B251B4770CfC5EC9930E";
  const tokenId = 0;

  console.log(`\n--- Rescue Script (Pre-Redeploy) ---`);
  console.log(`Connecting to current PolicyVault at: ${currentVaultAddress}`);
  
  const vault = await ethers.getContractAt("PolicyVault", currentVaultAddress);

  try {
    const balance = await vault.getVaultBalance(tokenId);
    console.log(`Token ID ${tokenId} Balance: ${ethers.formatEther(balance)} A0GI`);

    if (balance > 0n) {
      console.log(`Withdrawing ${ethers.formatEther(balance)} A0GI to ${deployer.address}...`);
      const tx = await vault.getFunction("withdraw(uint256,uint256)")(tokenId, balance);
      await tx.wait();
      console.log(`✅ Success! Funds secured.`);
    } else {
      console.log(`No funds to rescue.`);
    }
  } catch (error: any) {
    console.error(`Rescue failed:`, error.message || error);
  }
}

main().catch(console.error);
