const { ethers } = require("hardhat");

async function main() {
    const addresses = [
        "0x0076b4052066F6211229dA2806BEa9A9e246aD5D", // PolicyVault v1
        "0x0bC980e0DeE87a9f312C0FB088bb279c9ECfcf69", // PolicyVault v2
        "0xcf37B8CE11477101E6e1700a6c4e27d32E962D53", // MockDEX v1
        "0x652EdA0876EF813dC397D01cfAB20457a80c113b"  // MockDEX v2 (middle)
    ];

    console.log("Checking balances on 0G Galileo...");
    for (const addr of addresses) {
        const balance = await ethers.provider.getBalance(addr);
        console.log(`${addr}: ${ethers.formatEther(balance)} 0G`);
    }
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
