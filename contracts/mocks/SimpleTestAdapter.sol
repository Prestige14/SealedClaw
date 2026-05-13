// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../interfaces/IDEXAdapter.sol";

contract SimpleTestAdapter is IDEXAdapter {
    function swap(
        address /*tokenIn*/,
        address /*tokenOut*/,
        uint256 amountIn,
        uint256 /*minAmountOut*/,
        address /*recipient*/
    ) external payable override returns (uint256 amountOut) {
        // Safety: Refund the ETH back to PolicyVault so it can credit the agent back
        if (msg.value > 0) {
            (bool ok, ) = msg.sender.call{value: msg.value}("");
            require(ok, "Refund failed");
        }
        return amountIn;
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
