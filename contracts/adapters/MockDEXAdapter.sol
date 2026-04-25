// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../interfaces/IDEXAdapter.sol";

/**
 * @title MockDEXAdapter
 * @notice Stateless simulated DEX adapter for 0G Hackathon.
 *         Simulates a 0.3% fee.
 */
contract MockDEXAdapter is IDEXAdapter {
    function swap(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 minAmountOut,
        address recipient
    ) external payable override returns (uint256 amountOut) {
        amountOut = (amountIn * 997) / 1000;
        require(amountOut >= minAmountOut, "MockDEX: Insufficient output amount");

        // If we want native tokens out (e.g. closing a position)
        if (tokenOut == address(0)) {
            require(address(this).balance >= amountOut, "MockDEX: Insufficient liquidity to return");
            (bool success, ) = payable(recipient).call{value: amountOut}("");
            require(success, "MockDEX: Refund to vault failed");
        }
    }

    function getQuote(
        address /*tokenIn*/,
        address /*tokenOut*/,
        uint256 amountIn
    ) external pure override returns (uint256 expectedOut) {
        return (amountIn * 997) / 1000;
    }

    function adapterName() external pure override returns (string memory) {
        return "Mock DEX (Stateless)";
    }

    receive() external payable {}
}
