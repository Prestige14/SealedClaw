const { ethers } = require("ethers");

async function main() {
    const provider = new ethers.JsonRpcProvider("https://evmrpc-testnet.0g.ai");
    const wallet = new ethers.Wallet("13a682229bd044e3b5441378b0ac068259cb76866633d300b3d6ad1127ad6fc0", provider);
    
    const mockDexAddress = "0xcf37B8CE11477101E6e1700a6c4e27d32E962D53";
    const mockDexAbi = [
        "function executeTradeFor(uint256 tokenId, string action, uint256 amount, string asset) external payable",
        "function getVirtualBalance(uint256 tokenId, string asset) view returns (uint256)"
    ];
    const mockDex = new ethers.Contract(mockDexAddress, mockDexAbi, wallet);

    console.log("=== INJECTING vETH BALANCE FOR TOKEN #1 ===");
    // Simulate 0.25 ETH buy for token #1 by calling MockDEX directly
    // We send 0.25 ETH as msg.value to simulate a BUY
    const amount = ethers.parseEther("0.1");
    const tx = await mockDex.executeTradeFor(1, "BUY", amount, "ETH", { value: amount });
    await tx.wait();
    console.log(`[OK] Injected 0.25 vETH for Token #1. Tx: ${tx.hash}`);

    const vEth = await mockDex.getVirtualBalance(1, "ETH");
    console.log(`[VERIFY] Token #1 vETH balance: ${ethers.formatEther(vEth)}`);
}

main().catch(console.error);
