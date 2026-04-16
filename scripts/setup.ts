import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log(`Setting up with account: ${deployer.address}`);

  const agent = await ethers.getContractAt("SealedClawAgent", "0xBe9Db7735B06FEa557f3Aa18317eaB229BA6ebC5");
  const vault = await ethers.getContractAt("PolicyVault", "0xFAB206535E521be5B24AeEf30b3CB71f7bf21459");

  // Check if paused
  const agentPaused = await agent.paused();
  if (agentPaused) {
      console.log("Unpausing agent...");
      await (await agent.unpause()).wait();
  }

  // Mint Token 0
  try {
      const owner = await agent.ownerOf(0);
      console.log("Token 0 already minted to:", owner);
  } catch (e) {
      console.log("Minting token 0...");
      const mintPrice = await agent.mintPrice();
      const tx = await agent.mintAgent("bafkreimockmockmock", { value: mintPrice });
      await tx.wait();
      console.log("Token 0 minted successfully.");
  }

  // Set Policy
  try {
      const policy = {
          maxDrawdown: 1000,
          riskMaxPercent: 10000,
          allowedTokens: ["0x0000000000000000000000000000000000000000"],
          allowedDEXs: ["0x000000000000000000000000000000000000dEaD"],
          dailyLimit: ethers.parseEther("100")
      };
      console.log("Updating policy...");
      const txPolicy = await vault.updatePolicy(0, policy);
      await txPolicy.wait();
      console.log("Policy updated successfully.");
  } catch (e) {
      console.error("Error updating policy:", e);
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
