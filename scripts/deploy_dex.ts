import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying MockDEX with account:", deployer.address);

  const MockDEX = await ethers.getContractFactory("MockDEX");
  const dex = await MockDEX.deploy();

  await dex.waitForDeployment();

  const address = await dex.getAddress();
  console.log("MockDEX deployed to:", address);
  
  console.log("\n--- UPDATE YOUR .env ---");
  console.log(`TARGET_DEX_ADDRESS=${address}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
