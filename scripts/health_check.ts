import { ethers } from "hardhat";
import { CONFIG } from "../frontend/src/config";

async function main() {
  console.log("\n" + "=" .repeat(60));
  console.log("  SEALEDCLAW HEALTH CHECK | 0G Galileo Testnet");
  console.log("=" .repeat(60) + "\n");

  const contracts = [
    { name: "SealedClawAgent", address: CONFIG.AGENT_ADDRESS, abi: ["function totalMinted() view returns (uint256)"] },
    { name: "PolicyVault", address: CONFIG.VAULT_ADDRESS, abi: ["function owner() view returns (address)"] },
    { name: "TEERegistry", address: CONFIG.TEE_ATTESTATION_REGISTRY, abi: ["function owner() view returns (address)"] },
    { name: "ChainlinkVerifier", address: CONFIG.CHAINLINK_ORACLE_VERIFIER, abi: ["function owner() view returns (address)"] },
    { name: "AgentMarketplace", address: CONFIG.AGENT_MARKETPLACE, abi: ["function PROTOCOL_FEE_BPS() view returns (uint256)"] },
  ];

  for (const c of contracts) {
    try {
      const contract = await ethers.getContractAt(c.abi, c.address);
      let detail = "";

      if (c.name === "SealedClawAgent") {
        const total = await contract.totalMinted();
        detail = `totalMinted: ${total}`;
      } else if (c.name === "AgentMarketplace") {
        const fee = await contract.PROTOCOL_FEE_BPS();
        detail = `fee: ${Number(fee) / 100}%`;
      } else {
        // Use owner() for others to verify connection without needing specific state
        const owner = await contract.owner();
        detail = `owner: ${owner.slice(0, 6)}...`;
      }

      console.log(`✅ ${c.name.padEnd(20)} | ${detail.padEnd(25)} | ${c.address}`);
    } catch (err: any) {
      const errMsg = err.message.split('\n')[0].slice(0, 40);
      console.log(`❌ ${c.name.padEnd(20)} | ERROR: ${errMsg}...`);
    }
  }

  console.log("\n" + "=" .repeat(60) + "\n");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
