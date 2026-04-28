const { ethers } = require("ethers");

async function main() {
    const provider = new ethers.JsonRpcProvider("https://evmrpc-testnet.0g.ai");
    const agentAddress = "0xd8572C039ea363FF52e30C022Fd5d99664f5c08d";
    const abi = ["function ownerOf(uint256 tokenId) view returns (address)"];
    const agent = new ethers.Contract(agentAddress, abi, provider);

    for (const id of [0, 1]) {
        try {
            const owner = await agent.ownerOf(id);
            console.log(`Token #${id} owner: ${owner}`);
        } catch (e) {
            console.log(`Token #${id} not minted or error: ${e.message}`);
        }
    }
}

main().catch(console.error);
