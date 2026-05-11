import { expect } from "chai";
import { ethers } from "hardhat";
import * as path from "path";

describe("Mainnet Readiness: Relayer Integration", function () {
    this.timeout(120_000);

    let vault: any;
    let agentNFT: any;
    let registry: any;
    let owner: any;
    let relayer: any;
    let teePubKey: string;
    let vaultAddress: string;

    before(async function () {
        [owner, relayer] = await ethers.getSigners();

        // 1. Deploy TEE Registry
        const TEEAttestationRegistry = await ethers.getContractFactory("TEEAttestationRegistry");
        registry = await TEEAttestationRegistry.deploy();
        await registry.waitForDeployment();

        // 2. Deploy NFT
        const SealedClawAgent = await ethers.getContractFactory("SealedClawAgent");
        agentNFT = await SealedClawAgent.deploy(0n);
        await agentNFT.waitForDeployment();

        // 3. Mint NFT to Owner
        await agentNFT.connect(owner).mintAgent("test-cid");

        // 4. Mock TEE Key
        teePubKey = "0xf706e2e1f24fa67297f37063d5b36f775f16261e"; 

        // 5. Deploy PolicyVault with TEE Key
        const PolicyVault = await ethers.getContractFactory("PolicyVault");
        vault = await PolicyVault.deploy(
            await agentNFT.getAddress(),
            teePubKey,
            await registry.getAddress()
        );
        await vault.waitForDeployment();
        vaultAddress = await vault.getAddress();

        // 6. Setup Policy for Token 0
        const policy = {
            maxDrawdown: 1000,
            riskMaxPercent: 1000, // 10%
            allowedTokens: [],
            allowedDEXs: [],
            dailyLimit: ethers.parseEther("10.0")
        };
        await vault.connect(owner).updatePolicy(0, policy);

        // 7. Fund Agent Vault
        await vault.connect(owner).deposit(0, { value: ethers.parseEther("1.0") });
    });

    it("should allow a separate RELAYER to execute a valid TEE-signed trade", async function () {
        const tokenId = 0;
        const nonce = 0;
        const deadline = Math.floor(Date.now() / 1000) + 3600;
        
        const strategyData = ethers.AbiCoder.defaultAbiCoder().encode(
            ["string", "uint256", "address", "address"],
            ["BUY", ethers.parseEther("0.1"), ethers.ZeroAddress, "0x0000000000000000000000000000000000000001"]
        );

        const actualTeeWallet = new ethers.Wallet("0xabc123abc123abc123abc123abc123abc123abc123abc123abc123abc123abcd");
        const actualTeeAddr = actualTeeWallet.address;
        
        const PolicyVault = await ethers.getContractFactory("PolicyVault");
        const realVault = await PolicyVault.deploy(
            await agentNFT.getAddress(),
            actualTeeAddr,
            await registry.getAddress()
        );
        await realVault.waitForDeployment();
        const realVaultAddr = await realVault.getAddress();

        // Deploy simple adapter
        const simpleAdapter = await (await ethers.getContractFactory("SimpleTestAdapter")).deploy();
        await simpleAdapter.waitForDeployment();
        const adapterAddr = await simpleAdapter.getAddress();
        await realVault.connect(owner).setAdapter(adapterAddr, true);

        // Update policy with adapterAddr in allowlist
        await realVault.connect(owner).updatePolicy(0, {
            maxDrawdown: 1000,
            riskMaxPercent: 1000,
            allowedTokens: [],
            allowedDEXs: [adapterAddr],
            dailyLimit: ethers.parseEther("10.0")
        });
        await realVault.connect(owner).deposit(0, { value: ethers.parseEther("1.0") });

        // Generate Real Signature
        const realMsgHash = ethers.solidityPackedKeccak256(
            ["uint256", "bytes", "uint256", "uint256", "address"],
            [tokenId, strategyData, nonce, deadline, realVaultAddr]
        );
        const signature = await actualTeeWallet.signMessage(ethers.getBytes(realMsgHash));

        // EXECUTE AS RELAYER
        await expect(
            realVault.connect(relayer).executeWithProof(
                tokenId,
                strategyData,
                ethers.parseEther("0.1"),
                adapterAddr,
                signature,
                deadline
            )
        ).to.emit(realVault, "AdapterUsed");
        
        expect(await realVault.nonces(0)).to.equal(1);
    });

    it("should enforce riskMaxPercent based on vaultBalances[tokenId]", async function () {
        const tokenId = 0;
        const deadline = Math.floor(Date.now() / 1000) + 3600;
        const tradeAmount = ethers.parseEther("0.5"); // 50% of vault
        
        const strategyData = ethers.AbiCoder.defaultAbiCoder().encode(
            ["string", "uint256", "address", "address"],
            ["BUY", tradeAmount, ethers.ZeroAddress, "0x0000000000000000000000000000000000000001"]
        );

        const actualTeeWallet = new ethers.Wallet("0xabc123abc123abc123abc123abc123abc123abc123abc123abc123abc123abcd");
        const TEEAttestationRegistry = await ethers.getContractFactory("TEEAttestationRegistry");
        const reg = await TEEAttestationRegistry.deploy();
        const SealedClawAgent = await ethers.getContractFactory("SealedClawAgent");
        const nft = await SealedClawAgent.deploy(0n);
        await nft.connect(owner).mintAgent("test-cid");
        
        const PolicyVault = await ethers.getContractFactory("PolicyVault");
        const v = await PolicyVault.deploy(await nft.getAddress(), actualTeeWallet.address, await reg.getAddress());
        const vAddr = await v.getAddress();

        const adapter = await (await ethers.getContractFactory("SimpleTestAdapter")).deploy();
        const adapterAddr = await adapter.getAddress();
        await v.connect(owner).setAdapter(adapterAddr, true);

        // Policy: 10% risk max per trade
        await v.connect(owner).updatePolicy(0, {
            maxDrawdown: 1000,
            riskMaxPercent: 1000, // 10%
            allowedTokens: [],
            allowedDEXs: [adapterAddr],
            dailyLimit: ethers.parseEther("10.0")
        });

        // Deposit 1.0 ETH -> Max trade allowed is 0.1 ETH
        await v.connect(owner).deposit(0, { value: ethers.parseEther("1.0") });

        const msgHash = ethers.solidityPackedKeccak256(
            ["uint256", "bytes", "uint256", "uint256", "address"],
            [tokenId, strategyData, 0, deadline, vAddr]
        );
        const sig = await actualTeeWallet.signMessage(ethers.getBytes(msgHash));

        // This should fail because 0.5 ETH > 10% of 1.0 ETH
        await expect(
            v.connect(relayer).executeWithProof(
                tokenId,
                strategyData,
                tradeAmount,
                adapterAddr,
                sig,
                deadline
            )
        ).to.be.revertedWith("Exceeds risk max per trade");
    });
});
