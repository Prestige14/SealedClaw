import { expect } from "chai";
import { ethers } from "hardhat";
import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";

/**
 * Integration test: Python TEE worker (Phase 2) <-> PolicyVault (Phase 1)
 *
 * Critical design constraint:
 *   - PolicyVault hash: keccak256(abi.encodePacked(tokenId, strategyData, nonce, deadline, address(this)))
 *   - The vault address MUST be known before Python signs (it's part of the hash)
 *   - updateTeeEnclavePubKey has 24h KEY_ROTATION_COOLDOWN
 *
 * Solution: Deploy vault with Python TEE key from the START.
 * Approach:
 *   Step 1: Deploy vault with a TEMPORARY key (deployer address)
 *   Step 2: Run Python with the vault address → get TEE pub key + signed payload
 *   Step 3: Redeploy vault with Python TEE key as initial key (no rotation needed)
 *   Step 4: Run Python AGAIN with the new vault address → new signed payload
 *   Step 5: Call executeWithProof with this payload
 *
 * This is the correct pattern because PolicyVault includes address(this) in the hash.
 * We cannot pre-know the vault address before deployment.
 *
 * DEX addresses must match exactly:
 *   Python builder._MOCK_DEX_ADDRESS = "0x000000000000000000000000000000000000dEaD"
 */

// Must match payload/builder.py _MOCK_DEX_ADDRESS exactly
const MOCK_DEX = "0x000000000000000000000000000000000000dEaD";

const TEE_WORKER_DIR = path.join(__dirname, "..", "tee-worker");
const OUT_FILE = path.join(TEE_WORKER_DIR, "test_output.json");

/** Helper: run Python tee-worker and return parsed payload */
function runPythonWorker(vaultAddress: string): any {
    execSync(
        `python main.py --output "${OUT_FILE}" --vault ${vaultAddress} --token-id 0 --nonce 0`,
        {
            cwd: TEE_WORKER_DIR,
            env: {
                ...process.env,
                POLICY_VAULT_ADDRESS: vaultAddress,
                TOKEN_ID: "0",
                CURRENT_NONCE: "0",
                TARGET_DEX_ADDRESS: MOCK_DEX,
            },
            stdio: "pipe",
        }
    );
    return JSON.parse(fs.readFileSync(OUT_FILE, "utf-8"));
}

describe("Phase 1 <-> Phase 2 Integration: TEE Signature Verification", function () {
    this.timeout(120_000); // Python subprocess + two deploys

    let vault: any;
    let agentNFT: any;
    let deployer: any;
    let user: any;
    let pythonPayload: any;
    let vaultAddress: string;

    before(async function () {
        [deployer, user] = await ethers.getSigners();

        // ── Step 1: Deploy SealedClawAgent NFT ────────────────────────────────
        const SealedClawAgent = await ethers.getContractFactory("SealedClawAgent");
        agentNFT = await SealedClawAgent.deploy(0n);
        await agentNFT.waitForDeployment();

        // ── Step 2: Deploy PolicyVault with deployer as TEMP TEE key ──────────
        // We need the real vault address before Python can sign, because
        // address(this) is part of the Solidity message hash.
        const PolicyVault = await ethers.getContractFactory("PolicyVault");
        const tempVault = await PolicyVault.deploy(
            await agentNFT.getAddress(),
            deployer.address  // temporary placeholder — we will redeploy
        );
        await tempVault.waitForDeployment();
        const tempVaultAddress = await tempVault.getAddress();
        console.log(`\n  [Step 1] Temp vault deployed: ${tempVaultAddress}`);

        // ── Step 3: Run Python ONCE to get the TEE pub key ────────────────────
        // Use temp vault address just to get the TEE pub key (the key itself
        // doesn't depend on vault address; only the signature does)
        console.log("  [Step 2] Running Python to discover TEE pub key...");
        const tempPayload = runPythonWorker(tempVaultAddress);
        const teePubKey: string = tempPayload.tee_pub_key;
        console.log(`  [Step 2] TEE pub key: ${teePubKey}`);

        // ── Step 4: Deploy FINAL PolicyVault with Python TEE key from the start ─
        // This avoids KEY_ROTATION_COOLDOWN entirely — no rotation needed.
        // lastKeyRotation is set to block.timestamp in constructor.
        console.log("  [Step 3] Deploying final PolicyVault with Python TEE key...");
        vault = await PolicyVault.deploy(
            await agentNFT.getAddress(),
            teePubKey  // Python TEE key set at deployment — no cooldown
        );
        await vault.waitForDeployment();
        vaultAddress = await vault.getAddress();
        console.log(`  [Step 3] Final vault deployed: ${vaultAddress}`);

        // Confirm vault has the correct TEE key
        const storedKey = await vault.teeEnclavePubKey();
        expect(storedKey.toLowerCase()).to.equal(
            teePubKey.toLowerCase(),
            "Vault must store Python TEE key"
        );

        // ── Step 5: Mint iNFT for user ─────────────────────────────────────────
        const mintTx = await agentNFT.connect(user).mintAgent("mock-cid-for-testing");
        await mintTx.wait();
        console.log("  [Step 4] iNFT minted for user (tokenId=0)");

        // ── Step 6: Set policy — allowedDEXs MUST match Python MOCK_DEX ───────
        const setPolicy = await vault.connect(user).updatePolicy(0n, {
            maxDrawdown: 1000n,        // 10% max drawdown
            riskMaxPercent: 500n,      // 5% max single trade
            allowedTokens: [],
            allowedDEXs: [MOCK_DEX],  // MUST match builder.py _MOCK_DEX_ADDRESS
            dailyLimit: ethers.parseEther("1.0"),
        });
        await setPolicy.wait();
        console.log(`  [Step 5] Policy set (allowedDEX=${MOCK_DEX})`);

        // ── Step 7: Deposit funds ──────────────────────────────────────────────
        await vault.connect(user).deposit({ value: ethers.parseEther("0.1") });
        console.log("  [Step 6] Deposited 0.1 ETH");

        // ── Step 8: Run Python AGAIN with the FINAL vault address ──────────────
        // This is the critical run — the signature now includes the correct
        // vault address in the hash.
        console.log(`  [Step 7] Running Python tee-worker with final vault address...`);
        pythonPayload = runPythonWorker(vaultAddress);

        console.log(`  [Step 7] TEE pub key : ${pythonPayload.tee_pub_key}`);
        console.log(`  [Step 7] Target DEX  : ${pythonPayload.targetDEX}`);
        console.log(`  [Step 7] Signature   : ${pythonPayload.signature.slice(0, 22)}...`);
        console.log(`  [Step 7] Decision    : ${pythonPayload.decision.action}`);
        console.log(`  [Step 7] Deadline    : ${pythonPayload.deadline}`);

        // Sanity checks before running tests
        expect(pythonPayload.tee_pub_key.toLowerCase()).to.equal(
            teePubKey.toLowerCase(),
            "Second Python run must use the same TEE key (same process, same key)"
        );
        expect(pythonPayload.targetDEX.toLowerCase()).to.equal(
            MOCK_DEX.toLowerCase(),
            "Python must use the same DEX address as the policy allowlist"
        );

        console.log("\n  Setup complete. Running test assertions...");
    });

    // ── Test 1: Core signature verification ───────────────────────────────────
    it("should verify Python TEE signature on-chain via ecrecover", async function () {
        const tokenId = 0n;
        const currentNonce = await vault.getNonce(tokenId);
        expect(currentNonce).to.equal(0n, "Nonce must be 0 before first execution");

        console.log(`\n  Calling executeWithProof...`);
        const tx = await vault.connect(user).executeWithProof(
            tokenId,
            pythonPayload.strategyData,
            BigInt(pythonPayload.tradeAmount),
            pythonPayload.targetDEX,
            pythonPayload.signature,
            BigInt(pythonPayload.deadline),
        );
        const receipt = await tx.wait();
        expect(receipt!.status).to.equal(1, "executeWithProof must succeed (status=1)");
        console.log("  [PASS] ecrecover matched Python-generated signature!");
    });

    // ── Test 2: Nonce increment ────────────────────────────────────────────────
    it("should increment nonce after successful execution", async function () {
        const nonceAfter = await vault.getNonce(0n);
        expect(nonceAfter).to.equal(1n, "Nonce must be 1 after first execution");
        console.log("  [PASS] Nonce incremented to 1");
    });

    // ── Test 3: Replay protection ──────────────────────────────────────────────
    it("should reject replayed signature (nonce mismatch)", async function () {
        // Nonce is now 1. Replaying the nonce=0 signature must produce
        // a different message hash -> ecrecover returns wrong address -> revert.
        await expect(
            vault.connect(user).executeWithProof(
                0n,
                pythonPayload.strategyData,
                BigInt(pythonPayload.tradeAmount),
                pythonPayload.targetDEX,
                pythonPayload.signature,
                BigInt(pythonPayload.deadline),
            )
        ).to.be.revertedWith("Invalid TEE signature");
        console.log("  [PASS] Replay attack correctly rejected");
    });

    // ── Test 4: Expired deadline ────────────────────────────────────────────────
    it("should reject expired deadline", async function () {
        // Use a deadline that is definitely in the past relative to real time
        const expiredDeadline = Math.floor(Date.now() / 1000) - 600; // 10 min ago
        await expect(
            vault.connect(user).executeWithProof(
                0n,
                pythonPayload.strategyData,
                BigInt(pythonPayload.tradeAmount),
                pythonPayload.targetDEX,
                pythonPayload.signature,
                BigInt(expiredDeadline),
            )
        ).to.be.revertedWith("Transaction expired");
        console.log("  [PASS] Expired deadline correctly rejected");
    });
});