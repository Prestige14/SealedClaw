// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";

interface AggregatorV3Interface {
    function latestRoundData() external view returns (
        uint80 roundId,
        int256 answer,
        uint256 startedAt,
        uint256 updatedAt,
        uint80 answeredInRound
    );
}

/**
 * @title ChainlinkOracleVerifier
 * @notice Verifies price feeds from Chainlink for the agent.
 */
contract ChainlinkOracleVerifier is Ownable {
    mapping(bytes32 => address) public priceFeeds;

    constructor() Ownable(msg.sender) {}

    function addFeed(string memory pair, address feed) external onlyOwner {
        priceFeeds[keccak256(bytes(pair))] = feed;
    }

    function getPrice(string memory pair) external view returns (uint256 price, uint256 updatedAt) {
        address feed = priceFeeds[keccak256(bytes(pair))];
        require(feed != address(0), "Feed not found");
        
        (, int256 answer, , uint256 updateTime, ) = AggregatorV3Interface(feed).latestRoundData();
        require(answer > 0, "Invalid price");
        require(block.timestamp - updateTime <= 1 hours, "Stale price"); // Max 1 hour
        
        return (uint256(answer), updateTime);
    }

    function validatePrice(
        string memory pair,
        uint256 agentPrice,
        uint256 toleranceBps
    ) external view returns (bool) {
        (uint256 chainlinkPrice, ) = this.getPrice(pair);
        
        uint256 diff;
        if (chainlinkPrice > agentPrice) {
            diff = chainlinkPrice - agentPrice;
        } else {
            diff = agentPrice - chainlinkPrice;
        }
        
        uint256 maxDiff = (chainlinkPrice * toleranceBps) / 10000;
        
        require(diff <= maxDiff, "Price deviation exceeds tolerance");
        return true;
    }
}
