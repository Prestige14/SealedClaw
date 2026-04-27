const { ethers } = require("ethers");

async function main() {
    const provider = new ethers.JsonRpcProvider("https://evmrpc-testnet.0g.ai");
    const privateKey = "13a682229bd044e3b5441378b0ac068259cb76866633d300b3d6ad1127ad6fc0";
    const wallet = new ethers.Wallet(privateKey, provider);
    
    const vaultAddress = "0x0076b4052066F6211229dA2806BEa9A9e246aD5D";
    const abi = [
        "function setDefaultTeeKey(address newKey) external",
        "function defaultTeeKey() view returns (address)"
    ];
    
    const vault = new ethers.Contract(vaultAddress, abi, wallet);
    const teePub = "0xf706e2e1f24fa67297f37063d5b36f775f16261e";

    console.log(`--- SETTING DEFAULT TEE KEY TO ${teePub} ---`);
    try {
        const tx = await vault.setDefaultTeeKey(teePub);
        console.log(`Transaction broadcasted: ${tx.hash}`);
        await tx.wait();
        console.log(`[SUCCESS] Default TEE Key updated!`);
        
        const registered = await vault.defaultTeeKey();
        console.log(`Current Default Key: ${registered}`);
    } catch (e) {
        console.error("Failed to set default TEE key:", e.message);
    }
}

main();
