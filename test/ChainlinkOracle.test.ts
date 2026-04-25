import { expect } from "chai";
import { ethers } from "hardhat";

describe("Chainlink On-Chain Oracle Integration", function () {
    let verifier: any;
    let mockAggregator: any;
    let deployer: any;

    before(async function () {
        [deployer] = await ethers.getSigners();

        // 1. Deploy MockAggregatorV3
        const MockAggregator = await ethers.getContractFactory("MockAggregatorV3");
        mockAggregator = await MockAggregator.deploy();
        await mockAggregator.waitForDeployment();

        // 2. Deploy ChainlinkOracleVerifier
        const Verifier = await ethers.getContractFactory("ChainlinkOracleVerifier");
        verifier = await Verifier.deploy();
        await verifier.waitForDeployment();

        // 3. Add feed
        await verifier.addFeed("ETH/USD", await mockAggregator.getAddress());
    });

    it("should retrieve price directly from the feed", async function () {
        const [price, updatedAt] = await verifier.getPrice("ETH/USD");
        // We set $2000 in constructor of MockAggregatorV3 (2000 * 10^8)
        expect(price).to.equal(2000n * (10n ** 8n));
        expect(updatedAt).to.be.gt(0n);
    });

    it("should validate price within tolerance", async function () {
        // chainlink price is 200000000000
        // agentPrice = 2010.00
        const agentPrice = 2010n * (10n ** 8n);
        // tolerance = 100 bps (1%)
        const valid = await verifier.validatePrice("ETH/USD", agentPrice, 100n);
        expect(valid).to.be.true;
    });

    it("should revert if price deviation exceeds tolerance", async function () {
        // chainlink price is 200000000000
        // agentPrice = 2100.00 (deviation is 5%, tolerance is 1%)
        const agentPrice = 2100n * (10n ** 8n);
        
        await expect(
            verifier.validatePrice("ETH/USD", agentPrice, 100n)
        ).to.be.revertedWith("Price deviation exceeds tolerance");
    });
});
