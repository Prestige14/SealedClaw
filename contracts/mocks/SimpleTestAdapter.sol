// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../interfaces/IDEXAdapter.sol";

contract SimpleTestAdapter is IDEXAdapter {
    address public owner;

    constructor() {
        owner = msg.sender;
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    function swap(
        address /*tokenIn*/,
        address /*tokenOut*/,
        uint256 amountIn,
        uint256 /*minAmountOut*/,
        address /*recipient*/
    ) external payable override returns (uint256 amountOut) {
        // Funds stay here to simulate a "position"
        return amountIn;
    }

    // Manual withdraw button for the user
    function withdrawAll() external onlyOwner {
        (bool ok, ) = msg.sender.call{value: address(this).balance}("");
        require(ok, "Transfer failed");
    }

    function getQuote(
        address /*tokenIn*/,
        address /*tokenOut*/,
        uint256 amountIn
    ) external pure override returns (uint256 expectedOut) {
        return amountIn;
    }

    function adapterName() external pure override returns (string memory) {
        return "Simple Test Adapter";
    }
}
