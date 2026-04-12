// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

/**
 * @title SealedClawAgent
 * @dev ERC-7857 Agentic iNFT for SealedClaw Trader.
 *      Metadata CID points to encrypted memory in 0G Storage.
 *
 * FIXES vs v1:
 *  - mintAgent: removed onlyOwner → anyone can mint their own agent
 *  - Added mintPrice so the contract is sustainable
 *  - Added pause/unpause for emergency control
 *  - Added burn so owner can destroy their agent
 *  - revokeUsage event added for iNFT transfer protocol
 */
contract SealedClawAgent is ERC721URIStorage, Ownable, Pausable {

    uint256 private _nextTokenId;
    uint256 public mintPrice;   // in wei; 0 = free mint (hackathon mode)

    // ── Events ──────────────────────────────────────────────────────────────
    event AgentMinted(
        uint256 indexed tokenId,
        address indexed owner,
        string  metadataCID
    );
    event UsageAuthorized(
        uint256 indexed tokenId,
        address indexed agent,
        uint256 permissions
    );
    event UsageRevoked(
        uint256 indexed tokenId,
        address indexed agent
    );
    event MetadataUpdated(
        uint256 indexed tokenId,
        string  newMetadataCID
    );

    // ── Constructor ──────────────────────────────────────────────────────────
    constructor(uint256 _mintPrice)
        ERC721("SealedClaw Agent", "SCA")
        Ownable(msg.sender)
    {
        mintPrice = _mintPrice;
    }

    // ── Core: Mint ───────────────────────────────────────────────────────────
    /**
     * @notice Anyone can mint their own SealedClaw Agent.
     * @param metadataCID  The 0G Storage CID for the encrypted agent metadata.
     *                     Stored with "0g://" protocol prefix per 0G convention.
     */
    function mintAgent(string memory metadataCID)
        external
        payable
        whenNotPaused
    {
        require(msg.value >= mintPrice, "Insufficient mint fee");
        require(bytes(metadataCID).length > 0, "CID cannot be empty");

        uint256 tokenId = _nextTokenId++;
        _mint(msg.sender, tokenId);
        _setTokenURI(
            tokenId,
            string(abi.encodePacked("0g://", metadataCID))
        );

        emit AgentMinted(tokenId, msg.sender, metadataCID);
    }

    // ── Core: Authorize / Revoke ─────────────────────────────────────────────
    /**
     * @notice Authorizes a contract (e.g. PolicyVault) to act on behalf of
     *         this iNFT with specific permissions (bitmask).
     *         This event is indexed by Vaults and Orchestrators.
     */
    function authorizeUsage(
        uint256 tokenId,
        address agent,
        uint256 permissions
    ) external whenNotPaused {
        require(ownerOf(tokenId) == msg.sender, "Not token owner");
        require(agent != address(0), "Invalid agent address");
        emit UsageAuthorized(tokenId, agent, permissions);
    }

    /**
     * @notice Revokes authorization — part of the iNFT transfer protocol.
     *         Called during ownership transfer to signal downstream systems.
     */
    function revokeUsage(uint256 tokenId, address agent) external {
        require(ownerOf(tokenId) == msg.sender, "Not token owner");
        emit UsageRevoked(tokenId, agent);
    }

    // ── Metadata Update ──────────────────────────────────────────────────────
    /**
     * @notice Owner can update 0G Storage CID (e.g. after re-encryption
     *         during key rotation or iNFT transfer).
     */
    function updateMetadata(uint256 tokenId, string memory newCID)
        external
        whenNotPaused
    {
        require(ownerOf(tokenId) == msg.sender, "Not token owner");
        require(bytes(newCID).length > 0, "CID cannot be empty");
        _setTokenURI(
            tokenId,
            string(abi.encodePacked("0g://", newCID))
        );
        emit MetadataUpdated(tokenId, newCID);
    }

    // ── Burn ─────────────────────────────────────────────────────────────────
    function burn(uint256 tokenId) external {
        require(ownerOf(tokenId) == msg.sender, "Not token owner");
        _burn(tokenId);
    }

    // ── Admin ─────────────────────────────────────────────────────────────────
    function setMintPrice(uint256 _price) external onlyOwner {
        mintPrice = _price;
    }

    function withdrawFees() external onlyOwner {
        uint256 bal = address(this).balance;
        require(bal > 0, "Nothing to withdraw");
        (bool ok, ) = msg.sender.call{value: bal}("");
        require(ok, "Transfer failed");
    }

    function pause()   external onlyOwner { _pause(); }
    function unpause() external onlyOwner { _unpause(); }

    // ── View ──────────────────────────────────────────────────────────────────
    function totalMinted() external view returns (uint256) {
        return _nextTokenId;
    }
}