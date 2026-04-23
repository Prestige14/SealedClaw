import { ethers } from "hardhat";

async function main() {
  const oldVaultAddress = "0xC36d724BFbC540F2b4f531AaB7B941B3DaD20Eb8";
  const oldAgentAddress = "0xD40628dF285897C72Ecb7f5b2dEb31a6Bfd7F815";
  const [deployer] = await ethers.getSigners();
  
  const agent = await ethers.getContractAt("SealedClawAgent", oldAgentAddress);
  const owner = await agent.ownerOf(0);
  console.log(`Token 0 Owner: ${owner}`);
  console.log(`Your Address : ${deployer.address}`);

  const vault = await ethers.getContractAt("PolicyVault", oldVaultAddress);
  const available = await ethers.provider.getBalance(oldVaultAddress);
  console.log(`Actual Contract Balance: ${ethers.formatEther(available)} A0GI`);

  if (available > 0n) {
      console.log(`Withdrawing ${ethers.formatEther(available)} A0GI...`);
      // Force withdraw the actual cash balance, ignoring the virtual balance mismatch
      const tx = await vault.getFunction("withdraw(uint256,uint256)")(0, available);
      await tx.wait();
      console.log("✅ Success!");
  }
}

main().catch(console.error);
