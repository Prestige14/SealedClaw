const { ethers } = require("ethers");

const NEW_ADAPTER = "0x8B4a5477D9531A719Fa9F80AE8466101e9EC5C60";
const OLD_ADAPTER = "0xcf37B8CE11477101E6e1700a6c4e27d32E962D53";
const VAULT = "0x0076b4052066F6211229dA2806BEa9A9e246aD5D";

async function main() {
    const provider = new ethers.JsonRpcProvider("https://evmrpc-testnet.0g.ai");
    const wallet = new ethers.Wallet("13a682229bd044e3b5441378b0ac068259cb76866633d300b3d6ad1127ad6fc0", provider);
    
    const vaultAbi = [
        "function setAdapter(address adapter, bool approved) external",
        "function approvedAdapters(address) view returns (bool)"
    ];
    const vault = new ethers.Contract(VAULT, vaultAbi, wallet);

    console.log("--- APPROVING NEW ADAPTER & REVOKING OLD ---");
    
    // Approve new adapter
    let tx = await vault.setAdapter(NEW_ADAPTER, true);
    await tx.wait();
    console.log(`[OK] New adapter approved: ${NEW_ADAPTER}`);
    
    // Revoke old adapter
    tx = await vault.setAdapter(OLD_ADAPTER, false);
    await tx.wait();
    console.log(`[OK] Old adapter revoked: ${OLD_ADAPTER}`);
    
    const isApproved = await vault.approvedAdapters(NEW_ADAPTER);
    console.log(`Verify new adapter approved: ${isApproved}`);
}

main().catch(console.error);
