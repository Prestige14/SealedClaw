import { ethers } from "hardhat";
import fs from "fs";
import path from "path";

async function main() {
    const deploymentPath = path.join(__dirname, "..", "deployments", "testnet.json");
    const deployment = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));

    const registryAddr = deployment.TEEAttestationRegistry;
    const registry = await ethers.getContractAt("TEEAttestationRegistry", registryAddr);

    const MRENCLAVE = "0xa3f2c9d1e8b74a0f56c3912d7b4e8fa261c5d3a9e0f1b2c8d7a4e9f3b6c2d1e5";
    const MRSIGNER = "0xd1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2";

    console.log(`Authorizing enclave ${MRENCLAVE}...`);
    const tx1 = await registry.authorizeEnclave(MRENCLAVE);
    await tx1.wait();

    console.log(`Authorizing signer ${MRSIGNER}...`);
    const tx2 = await registry.authorizeSigner(MRSIGNER);
    await tx2.wait();

    console.log("✅ Enclave and Signer authorized in TEEAttestationRegistry.");
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
