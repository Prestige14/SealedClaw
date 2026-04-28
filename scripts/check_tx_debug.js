const { ethers } = require("ethers");

async function main() {
    const provider = new ethers.JsonRpcProvider("https://evmrpc-testnet.0g.ai");
    
    const txHash = "0xe6964705c8051151a58e502995f21bf379235b089cac73dbb475d9f77c0adc6b";
    
    console.log(`\n=== ANALYZING TRANSACTION: ${txHash} ===`);
    
    const tx = await provider.getTransaction(txHash);
    const receipt = await provider.getTransactionReceipt(txHash);

    if (!receipt) {
        console.log("Transaction receipt not found.");
        return;
    }

    console.log(`Block Number: ${receipt.blockNumber}`);
    console.log(`From: ${receipt.from}`);
    console.log(`To: ${receipt.to}`);
    console.log(`Status: ${receipt.status === 1 ? "Success" : "Failed"}`);

    console.log("\n--- Logs ---");
    // Interface for MockDEX events
    const dexIface = new ethers.Interface([
        "event TradeFinalized(address indexed agent, uint256 indexed tokenId, string action, uint256 nativeAmount, string asset, uint256 virtualReceived, uint256 timestamp)"
    ]);

    receipt.logs.forEach((log, index) => {
        console.log(`Log [${index}] Address: ${log.address}`);
        try {
            const parsed = dexIface.parseLog(log);
            if (parsed) {
                console.log(`  Decoded TradeFinalized:`);
                console.log(`    TokenID: ${parsed.args.tokenId}`);
                console.log(`    Action: ${parsed.args.action}`);
                console.log(`    Asset: ${parsed.args.asset}`);
                console.log(`    Virtual Received: ${ethers.formatEther(parsed.args.virtualReceived)}`);
            }
        } catch (e) {
            // Not a TradeFinalized log or different ABI
        }
    });

    console.log("\n===========================================");
}

main().catch(console.error);
