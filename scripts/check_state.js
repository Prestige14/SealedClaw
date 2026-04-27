const { ethers } = require("ethers");

async function main() {
    const provider = new ethers.JsonRpcProvider("https://evmrpc-testnet.0g.ai");
    const vaultAddress = "0x0076b4052066F6211229dA2806BEa9A9e246aD5D";
    
    const abi = [
        "function vaultBalances(uint256) view returns (uint256)",
        "function agentTeeKeys(uint256) view returns (address)",
        "function nonces(uint256) view returns (uint256)"
    ];
    
    const agentAddress = "0xa44488591E66DA2B270a5C376b2a9d1115CFd0Fa";
    const agentAbi = ["function ownerOf(uint256) view returns (address)"];

    const vault = new ethers.Contract(vaultAddress, abi, provider);
    const agent = new ethers.Contract(agentAddress, agentAbi, provider);

    const tokenId = 1;
    
    console.log("--- SEALEDCLAW STATE CHECK ---");
    try {
        const owner = await agent.ownerOf(tokenId);
        console.log(`Agent #${tokenId} Owner: ${owner}`);
        
        const balance = await vault.vaultBalances(tokenId);
        console.log(`Vault Balance for #${tokenId}: ${ethers.formatEther(balance)} 0G`);
        
        const teePub = await vault.agentTeeKeys(tokenId);
        console.log(`Registered TEE PubKey for #${tokenId}: ${teePub}`);
        
        const nonce = await vault.nonces(tokenId);
        console.log(`Current Nonce for #${tokenId}: ${nonce}`);
        
    } catch (e) {
        console.error("Error fetching state:", e.message);
    }
}

main();
