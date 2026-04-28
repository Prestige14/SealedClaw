const { ethers } = require("ethers");

async function main() {
    const provider = new ethers.JsonRpcProvider("https://evmrpc-testnet.0g.ai");
    
    const mockDexAddress = "0xcf37B8CE11477101E6e1700a6c4e27d32E962D53";
    const abi = [
        "event TradeFinalized(address indexed agent, uint256 indexed tokenId, string action, uint256 nativeAmount, string asset, uint256 virtualReceived, uint256 timestamp)"
    ];

    const mockDex = new ethers.Contract(mockDexAddress, abi, provider);

    console.log(`\n=== FETCHING ALL-TIME TRADE HISTORY FOR TOKEN ID #0 ===`);
    
    const filter = mockDex.filters.TradeFinalized(null, 0);
    
    // We'll fetch in chunks if needed, but let's try a large range first.
    // 0G Galileo blocks might be in the millions.
    try {
        const logs = await mockDex.queryFilter(filter, 0, 'latest');
        logs.forEach((log, index) => {
            const { action, nativeAmount, asset, virtualReceived, timestamp } = log.args;
            console.log(`[${index}] Action: ${action} | Amount: ${ethers.formatEther(nativeAmount)} | Asset: ${asset} | Received: ${ethers.formatEther(virtualReceived)} | Time: ${new Date(Number(timestamp) * 1000).toISOString()}`);
        });

        if (logs.length === 0) {
            console.log("No logs found even from block 0.");
        }
    } catch (e) {
        console.log("Range too large, trying last 50,000 blocks...");
        const logs = await mockDex.queryFilter(filter, -50000);
        logs.forEach((log, index) => {
            const { action, nativeAmount, asset, virtualReceived, timestamp } = log.args;
            console.log(`[${index}] Action: ${action} | Amount: ${ethers.formatEther(nativeAmount)} | Asset: ${asset} | Received: ${ethers.formatEther(virtualReceived)} | Time: ${new Date(Number(timestamp) * 1000).toISOString()}`);
        });
    }
    
    console.log("\n===============================================");
}

main().catch(console.error);
