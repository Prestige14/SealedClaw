const { ethers } = require("ethers");

async function main() {
    const provider = new ethers.JsonRpcProvider("https://evmrpc-testnet.0g.ai");
    const privateKey = "13a682229bd044e3b5441378b0ac068259cb76866633d300b3d6ad1127ad6fc0";
    const wallet = new ethers.Wallet(privateKey, provider);
    
    const vaultAddress = "0x0076b4052066F6211229dA2806BEa9A9e246aD5D";
    const abi = [
        "function updateTeeEnclavePubKey(uint256 tokenId, address newKey, bytes attestation) external",
        "function agentTeeKeys(uint256) view returns (address)"
    ];
    
    const vault = new ethers.Contract(vaultAddress, abi, wallet);
    const tokenId = 1;
    const teePub = "0xf706e2e1f24fa67297f37063d5b36f775f16261e";

    console.log(`--- REGISTERING TEE KEY FOR AGENT #${tokenId} ---`);
    try {
        const tx = await vault.updateTeeEnclavePubKey(tokenId, teePub, "0x");
        console.log(`Transaction broadcasted: ${tx.hash}`);
        await tx.wait();
        console.log(`[SUCCESS] TEE Key registered for Agent #${tokenId}!`);
        
        const registered = await vault.agentTeeKeys(tokenId);
        console.log(`New Registered Key: ${registered}`);
    } catch (e) {
        console.error("Failed to register TEE key:", e.message);
    }
}

main();
