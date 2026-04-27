const { ethers } = require("ethers");

const NEW_ADAPTER = "0xEff0a95E5486156e5Ece457302812931A19B9328";
const VAULT = "0x0076b4052066F6211229dA2806BEa9A9e246aD5D";

async function main() {
    const provider = new ethers.JsonRpcProvider("https://evmrpc-testnet.0g.ai");
    const wallet = new ethers.Wallet("13a682229bd044e3b5441378b0ac068259cb76866633d300b3d6ad1127ad6fc0", provider);
    
    const vaultAbi = ["function setAdapter(address adapter, bool approved) external"];
    const vault = new ethers.Contract(VAULT, vaultAbi, wallet);

    console.log("--- APPROVING NEW PERSISTENT ADAPTER ---");
    let tx = await vault.setAdapter(NEW_ADAPTER, true);
    await tx.wait();
    console.log(`[OK] New persistent adapter approved: ${NEW_ADAPTER}`);
}

main().catch(console.error);
