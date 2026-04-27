const { ethers } = require("ethers");

async function main() {
    const provider = new ethers.JsonRpcProvider("https://evmrpc-testnet.0g.ai");
    
    // Check MockDEX (0xcf37) - original persistent storage
    const mockDexAddress = "0xcf37B8CE11477101E6e1700a6c4e27d32E962D53";
    const mockDexAbi = [
        "function getVirtualBalance(uint256 tokenId, string asset) view returns (uint256)",
        "function virtualBalances(uint256, string) view returns (uint256)",
        "function nativeSwapped(uint256) view returns (uint256)"
    ];
    const mockDex = new ethers.Contract(mockDexAddress, mockDexAbi, provider);

    console.log("=== CHECKING MOCKDEX STATE ===");
    for (const tokenId of [0, 1]) {
        try {
            const vEth = await mockDex.getVirtualBalance(tokenId, "ETH");
            const nativeIn = await mockDex.nativeSwapped(tokenId);
            console.log(`  Token #${tokenId} → vETH: ${ethers.formatEther(vEth)}, nativeSwapped: ${ethers.formatEther(nativeIn)}`);
        } catch(e) {
            console.log(`  Token #${tokenId} → Error: ${e.message}`);
        }
    }

    // Check current approved adapters in vault
    const vaultAddress = "0x0076b4052066F6211229dA2806BEa9A9e246aD5D";
    const vaultAbi = ["function approvedAdapters(address) view returns (bool)"];
    const vault = new ethers.Contract(vaultAddress, vaultAbi, provider);

    const adapters = {
        "Original (0xcf37)": "0xcf37B8CE11477101E6e1700a6c4e27d32E962D53",
        "2nd stateless (0x8B4a)": "0x8B4a5477D9531A719Fa9F80AE8466101e9EC5C60",
        "3rd persistent (0xEff0)": "0xEff0a95E5486156e5Ece457302812931A19B9328"
    };

    console.log("\n=== APPROVED ADAPTERS ===");
    for (const [name, addr] of Object.entries(adapters)) {
        const approved = await vault.approvedAdapters(addr);
        console.log(`  ${name}: ${approved ? "✅ APPROVED" : "❌ NOT APPROVED"}`);
    }

    // Check vault balance for token 1
    const vaultAbi2 = ["function vaultBalances(uint256) view returns (uint256)"];
    const vault2 = new ethers.Contract(vaultAddress, vaultAbi2, provider);
    const vaultBal = await vault2.vaultBalances(1);
    console.log(`\n=== VAULT BALANCE ===`);
    console.log(`  Token #1 in Vault: ${ethers.formatEther(vaultBal)} 0G`);
}

main().catch(console.error);
