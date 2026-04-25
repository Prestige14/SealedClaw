import { expect } from "chai";
import { ethers } from "hardhat";

describe("DEX Adapter Ecosystem", function () {
    let mockAdapter: any;
    let xSwapAdapter: any;
    let deployer: any;
    let vault: any;
    let agentNFT: any;

    before(async function () {
        [deployer] = await ethers.getSigners();
        
        const MockAdapter = await ethers.getContractFactory("MockDEXAdapter");
        mockAdapter = await MockAdapter.deploy();
        await mockAdapter.waitForDeployment();
        
        const XSwapAdapter = await ethers.getContractFactory("XSwapAdapter");
        xSwapAdapter = await XSwapAdapter.deploy(deployer.address, deployer.address);
        await xSwapAdapter.waitForDeployment();

        const SealedClawAgent = await ethers.getContractFactory("SealedClawAgent");
        agentNFT = await SealedClawAgent.deploy(0n);
        await agentNFT.waitForDeployment();

        const PolicyVault = await ethers.getContractFactory("PolicyVault");
        vault = await PolicyVault.deploy(await agentNFT.getAddress(), deployer.address);
        await vault.waitForDeployment();
    });

    it("should return correct adapter names", async function () {
        expect(await mockAdapter.adapterName()).to.equal("Mock DEX (Stateless)");
        expect(await xSwapAdapter.adapterName()).to.equal("XSwap Adapter");
    });

    it("should simulate 0.3% fee on MockDEX quote", async function () {
        const amountIn = ethers.parseEther("1.0");
        const expectedOut = await mockAdapter.getQuote(ethers.ZeroAddress, ethers.ZeroAddress, amountIn);
        expect(expectedOut).to.equal(ethers.parseEther("0.997"));
    });

    it("should allow owner to approve adapters in PolicyVault", async function () {
        const mockAddr = await mockAdapter.getAddress();
        await expect(vault.setAdapter(mockAddr, true)).to.not.be.reverted;
        expect(await vault.approvedAdapters(mockAddr)).to.be.true;

        // Revoke
        await expect(vault.setAdapter(mockAddr, false)).to.not.be.reverted;
        expect(await vault.approvedAdapters(mockAddr)).to.be.false;
    });
});
