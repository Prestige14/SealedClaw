import { ethers } from "hardhat";

async function main() {
  const oldVaultAddress = "0xC36d724BFbC540F2b4f531AaB7B941B3DaD20Eb8";
  const oldDexAddress = "0xddf3768Ed264A72949643985b2994259f30d18FF";
  
  const vBal = await ethers.provider.getBalance(oldVaultAddress);
  console.log(`Old Vault Native Balance: ${ethers.formatEther(vBal)} A0GI`);
  
  const dBal = await ethers.provider.getBalance(oldDexAddress);
  console.log(`Old DEX Native Balance  : ${ethers.formatEther(dBal)} A0GI`);

  const vault = await ethers.getContractAt("PolicyVault", oldVaultAddress);
  const virtualBal = await vault.vaultBalances(0);
  console.log(`Token 0 Virtual Balance in Vault: ${ethers.formatEther(virtualBal)} A0GI`);
}

main().catch(console.error);
