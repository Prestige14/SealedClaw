// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title AgentMarketplace
 * @notice Marketplace for trading SealedClaw iNFT agents.
 *         Implements a 2.5% fee on all sales.
 */
contract AgentMarketplace is ReentrancyGuard, Ownable {
    struct Listing {
        address seller;
        uint256 price;
        bool isActive;
    }

    IERC721 public immutable agentNFT;
    uint256 public constant PROTOCOL_FEE_BPS = 250; // 2.5%
    
    mapping(uint256 => Listing) public listings;

    event AgentListed(uint256 indexed tokenId, address indexed seller, uint256 price);
    event AgentSold(uint256 indexed tokenId, address indexed seller, address indexed buyer, uint256 price);
    event ListingCancelled(uint256 indexed tokenId, address indexed seller);

    constructor(address _agentNFT) Ownable(msg.sender) {
        agentNFT = IERC721(_agentNFT);
    }

    function listAgent(uint256 tokenId, uint256 price) external nonReentrant {
        require(price > 0, "Price must be greater than zero");
        require(agentNFT.ownerOf(tokenId) == msg.sender, "Not the owner");
        require(
            agentNFT.getApproved(tokenId) == address(this) || 
            agentNFT.isApprovedForAll(msg.sender, address(this)), 
            "Marketplace not approved"
        );

        listings[tokenId] = Listing({
            seller: msg.sender,
            price: price,
            isActive: true
        });

        emit AgentListed(tokenId, msg.sender, price);
    }

    function buyAgent(uint256 tokenId) external payable nonReentrant {
        Listing storage listing = listings[tokenId];
        require(listing.isActive, "Listing not active");
        require(msg.value >= listing.price, "Insufficient payment");

        listing.isActive = false;
        address seller = listing.seller;
        uint256 price = listing.price;

        uint256 fee = (price * PROTOCOL_FEE_BPS) / 10000;
        uint256 sellerProceeds = price - fee;

        // Transfer funds
        (bool successFee, ) = payable(owner()).call{value: fee}("");
        require(successFee, "Fee transfer failed");

        (bool successSeller, ) = payable(seller).call{value: sellerProceeds}("");
        require(successSeller, "Seller payment failed");

        // Transfer NFT
        agentNFT.safeTransferFrom(seller, msg.sender, tokenId);

        emit AgentSold(tokenId, seller, msg.sender, price);
        
        // Refund excess ETH
        if (msg.value > price) {
            (bool successRefund, ) = payable(msg.sender).call{value: msg.value - price}("");
            require(successRefund, "Refund failed");
        }
    }

    function cancelListing(uint256 tokenId) external nonReentrant {
        Listing storage listing = listings[tokenId];
        require(listing.isActive, "Listing not active");
        require(listing.seller == msg.sender, "Not the seller");

        listing.isActive = false;
        emit ListingCancelled(tokenId, msg.sender);
    }
}
