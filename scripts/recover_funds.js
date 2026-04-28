const { ethers } = require("hardhat");

async function main() {
    const [deployer] = await ethers.getSigners();
    console.log("Using account:", deployer.address);

    const VAULT_V1 = "0x0076b4052066F6211229dA2806BEa9A9e246aD5D";
    const DEX_V1 = "0xcf37B8CE11477101E6e1700a6c4e27d32E962D53";

    // 1. Recover from MockDEX V1 (Very easy due to the security flaw)
    console.log("\n[1/2] Recovering from MockDEX V1...");
    const dexBalance = await ethers.provider.getBalance(DEX_V1);
    if (dexBalance > 0n) {
        const dexAbi = ["function emergencyWithdraw() external"];
        const dex = new ethers.Contract(DEX_V1, dexAbi, deployer);
        try {
            console.log(`Withdrawing ${ethers.formatEther(dexBalance)} 0G from DEX...`);
            const tx = await dex.emergencyWithdraw();
            await tx.wait();
            console.log("✅ DEX recovery successful!");
        } catch (e) {
            console.error("[-] DEX recovery failed:", e.message);
        }
    } else {
        console.log("No funds in DEX V1.");
    }

    // 2. Recover from PolicyVault V1
    console.log("\n[2/2] Recovering from PolicyVault V1...");
    const vaultBalance = await ethers.provider.getBalance(VAULT_V1);
    if (vaultBalance > 0n) {
        // We need to know the tokenId. User's previous .env had TOKEN_ID=1.
        // We'll try TOKEN_ID 0 and 1.
        const vaultAbi = [
            "function withdraw(uint256 tokenId, uint256 amount) external",
            "function getVaultBalance(uint256 tokenId) external view returns (uint256)"
        ];
        const vault = new ethers.Contract(VAULT_V1, vaultAbi, deployer);
        
        for (let tid = 0; tid <= 1; tid++) {
            try {
                const bal = await vault.getVaultBalance(tid);
                if (bal > 0n) {
                    console.log(`Found ${ethers.formatEther(bal)} 0G for Token ID ${tid}. Withdrawing...`);
                    const tx = await vault.withdraw(tid, bal);
                    await tx.wait();
                    console.log(`✅ Vault recovery successful for Token ID ${tid}!`);
                }
            } catch (e) {
                console.log(`[-] Skip Token ID ${tid}: ${e.reason || "Not owner or no balance"}`);
            }
        }
    } else {
        console.log("No funds in PolicyVault V1.");
    }

    const finalBalance = await ethers.provider.getBalance(deployer.address);
    console.log(`\nFinal Wallet Balance: ${ethers.formatEther(finalBalance)} 0G`);
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
