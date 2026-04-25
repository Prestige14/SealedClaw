import { expect } from "chai";
import { ethers } from "hardhat";

describe("AgentMarketplace", function () {
    let agentNFT: any;
    let marketplace: any;
    let owner: any;
    let seller: any;
    let buyer: any;

    const MINT_PRICE = ethers.parseEther("0.1");
    const LISTING_PRICE = ethers.parseEther("1.0");

    before(async function () {
        [owner, seller, buyer] = await ethers.getSigners();

        const SealedClawAgent = await ethers.getContractFactory("SealedClawAgent");
        agentNFT = await SealedClawAgent.deploy(MINT_PRICE);
        await agentNFT.waitForDeployment();

        const AgentMarketplace = await ethers.getContractFactory("AgentMarketplace");
        marketplace = await AgentMarketplace.deploy(await agentNFT.getAddress());
        await marketplace.waitForDeployment();
    });

    it("should list an agent for sale", async function () {
        // 1. Mint agent to seller
        await agentNFT.connect(seller).mintAgent("metadata", { value: MINT_PRICE });
        const tokenId = 0;

        // 2. Approve marketplace
        await agentNFT.connect(seller).approve(await marketplace.getAddress(), tokenId);

        // 3. List
        await expect(marketplace.connect(seller).listAgent(tokenId, LISTING_PRICE))
            .to.emit(marketplace, "AgentListed")
            .withArgs(tokenId, seller.address, LISTING_PRICE);

        const listing = await marketplace.listings(tokenId);
        expect(listing.seller).to.equal(seller.address);
        expect(listing.price).to.equal(LISTING_PRICE);
        expect(listing.isActive).to.be.true;
    });

    it("should allow buying an agent and distribute fees", async function () {
        const tokenId = 0;
        const previousOwnerBalance = await ethers.provider.getBalance(owner.address);
        const previousSellerBalance = await ethers.provider.getBalance(seller.address);

        // 1. Buy
        await expect(marketplace.connect(buyer).buyAgent(tokenId, { value: LISTING_PRICE }))
            .to.emit(marketplace, "AgentSold")
            .withArgs(tokenId, seller.address, buyer.address, LISTING_PRICE);

        // 2. Check ownership
        expect(await agentNFT.ownerOf(tokenId)).to.equal(buyer.address);

        // 3. Check fee distribution
        // Fee is 2.5% of 1 ETH = 0.025 ETH
        // Seller gets 0.975 ETH
        const currentOwnerBalance = await ethers.provider.getBalance(owner.address);
        const currentSellerBalance = await ethers.provider.getBalance(seller.address);

        expect(currentOwnerBalance - previousOwnerBalance).to.equal(ethers.parseEther("0.025"));
        expect(currentSellerBalance - previousSellerBalance).to.equal(ethers.parseEther("0.975"));
    });

    it("should allow cancelling a listing", async function () {
        // 1. Mint & List another
        await agentNFT.connect(seller).mintAgent("metadata2", { value: MINT_PRICE });
        const tokenId = 1;
        await agentNFT.connect(seller).approve(await marketplace.getAddress(), tokenId);
        await marketplace.connect(seller).listAgent(tokenId, LISTING_PRICE);

        // 2. Cancel
        await expect(marketplace.connect(seller).cancelListing(tokenId))
            .to.emit(marketplace, "ListingCancelled")
            .withArgs(tokenId, seller.address);

        const listing = await marketplace.listings(tokenId);
        expect(listing.isActive).to.be.false;
    });
});
