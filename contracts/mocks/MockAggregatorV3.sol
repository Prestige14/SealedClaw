// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";

contract MockAggregatorV3 is Ownable {
    int256 private _price;
    uint256 private _updatedAt;

    constructor() Ownable(msg.sender) {
        _price = 2000 * 10**8; // $2000 with 8 decimals
        _updatedAt = block.timestamp;
    }

    function setPrice(int256 price) external onlyOwner {
        _price = price;
        _updatedAt = block.timestamp;
    }

    function latestRoundData() external view returns (
        uint80 roundId,
        int256 answer,
        uint256 startedAt,
        uint256 updatedAt,
        uint80 answeredInRound
    ) {
        return (1, _price, _updatedAt, _updatedAt, 1);
    }
}
