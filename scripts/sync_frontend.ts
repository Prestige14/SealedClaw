import fs from "fs";
import path from "path";

function updateFrontend() {
    const deploymentsPath = path.join(__dirname, "..", "deployments", "testnet.json");
    if (!fs.existsSync(deploymentsPath)) return;
    const deps = JSON.parse(fs.readFileSync(deploymentsPath, "utf-8"));

    const frontendPath = path.join(__dirname, "..", "frontend", "src", "pages", "DashboardPage.jsx");
    let content = fs.readFileSync(frontendPath, "utf-8");

    content = content.replace(/const AGENT_ADDRESS\s*=\s*".*";/, `const AGENT_ADDRESS    = "${deps.SealedClawAgent}";`);
    content = content.replace(/const VAULT_ADDRESS\s*=\s*".*";/, `const VAULT_ADDRESS    = "${deps.PolicyVault}";`);
    content = content.replace(/const STRATEGY_ADDRESS\s*=\s*".*";/, `const STRATEGY_ADDRESS = "${deps.StrategyVault}";`);
    content = content.replace(/const DEX_ADDRESS\s*=\s*".*";/, `const DEX_ADDRESS      = "${deps.MockDEX}";`);

    fs.writeFileSync(frontendPath, content);
    console.log("✅ Updated frontend DashboardPage.jsx with new contract addresses.");
}

updateFrontend();
