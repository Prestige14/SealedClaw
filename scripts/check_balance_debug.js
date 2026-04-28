const { ethers } = require("ethers");

async function main() {
    const provider = new ethers.JsonRpcProvider("https://evmrpc-testnet.0g.ai");
    
    const vaultAddress = "0xCD4D495572A4b195ED393dE6E99aebfe181dce22";
    const mockDexV1 = "0xcf37B8CE11477101E6e1700a6c4e27d32E962D53";
    const mockDexV2 = "0x652EdA0876EF813dC397D01cfAB20457a80c113b";

    const vaultAbi = ["function getVaultBalance(uint256 tokenId) view returns (uint256)"];
    const mockDexAbi = ["function getVirtualBalance(uint256 tokenId, string asset) view returns (uint256)"];

    const vault = new ethers.Contract(vaultAddress, vaultAbi, provider);
    const dex1 = new ethers.Contract(mockDexV1, mockDexAbi, provider);
    const dex2 = new ethers.Contract(mockDexV2, mockDexAbi, provider);

    for (const tokenId of [0, 1]) {
        console.log(`\n=== BALANCES FOR TOKEN ID #${tokenId} ===`);

        try {
            const bal0G = await vault.getVaultBalance(tokenId);
            console.log(`[Vault] 0G Native: ${ethers.formatEther(bal0G)} 0G`);
        } catch (e) {}

        try {
            const vEth1 = await dex1.getVirtualBalance(tokenId, "ETH");
            console.log(`[MockDEX v1] vETH: ${ethers.formatEther(vEth1)} ETH`);
        } catch (e) {}

        try {
            const vEth2 = await dex2.getVirtualBalance(tokenId, "ETH");
            console.log(`[MockDEX v2] vETH: ${ethers.formatEther(vEth2)} ETH`);
        } catch (e) {}
    }

    console.log("\n===========================================");
}

main().catch(console.error);
