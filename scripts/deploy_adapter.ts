import { ethers } from "ethers";
import fs from "fs";
import path from "path";

async function main() {
    const provider = new ethers.JsonRpcProvider("https://evmrpc-testnet.0g.ai");
    const privateKey = "13a682229bd044e3b5441378b0ac068259cb76866633d300b3d6ad1127ad6fc0";
    const wallet = new ethers.Wallet(privateKey, provider);

    console.log(`Deploying from: ${wallet.address}`);

    // Load the compiled artifact for MockDEXAdapter
    const artifactPath = path.join(__dirname, "../artifacts/contracts/adapters/MockDEXAdapter.sol/MockDEXAdapter.json");
    const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));

    const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, wallet);
    
    console.log("Deploying new MockDEXAdapter...");
    const contract = await factory.deploy();
    await contract.waitForDeployment();
    
    const newAddress = await contract.getAddress();
    console.log(`\n[SUCCESS] New MockDEXAdapter deployed at: ${newAddress}`);
    console.log(`\nUpdate .env: TARGET_DEX_ADDRESS=${newAddress}`);
    console.log(`Also call: PolicyVault.setAdapter("${newAddress}", true)`);
}

main().catch(console.error);
