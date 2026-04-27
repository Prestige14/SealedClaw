const { ethers } = require("ethers");

async function main() {
    const provider = new ethers.JsonRpcProvider("https://evmrpc-testnet.0g.ai");
    const mockDex = "0xcf37B8CE11477101E6e1700a6c4e27d32E962D53";
    
    const abi = ["function getVirtualBalance(uint256 tokenId, string asset) view returns (uint256)"];
    const contract = new ethers.Contract(mockDex, abi, provider);

    try {
        const bal = await contract.getVirtualBalance(1, "ETH");
        console.log(`vETH Balance for #1: ${ethers.formatEther(bal)}`);
    } catch (e) {
        console.error("0xcf37 is not MockDEX or call failed:", e.message);
    }
}

main();
