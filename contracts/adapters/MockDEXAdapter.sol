// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../interfaces/IDEXAdapter.sol";

interface IMockDEX {
    function executeTradeFor(uint256 tokenId, string calldata action, uint256 amount, string calldata asset) external payable;
}

/**
 * @title MockDEXAdapter
 * @notice Adapter that routes trades to the persistent MockDEX contract.
 */
contract MockDEXAdapter is IDEXAdapter {
    address public constant MOCK_DEX = 0xcf37B8CE11477101E6e1700a6c4e27d32E962D53;

    function swap(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 minAmountOut,
        address recipient
    ) external payable override returns (uint256 amountOut) {
        // Decode action from context (we assume tokenId is passed via a side channel or hardcoded for demo)
        // For hackathon simplicity, we assume tokenId 1
        uint256 tokenId = 1; 
        
        string memory action = (tokenIn == address(0)) ? "BUY" : "REDUCE_ONLY";
        uint256 effectiveIn = (tokenIn == address(0)) ? msg.value : amountIn;

        // Call the actual MockDEX to record virtual balance
        IMockDEX(MOCK_DEX).executeTradeFor{value: msg.value}(
            tokenId,
            action,
            effectiveIn,
            "ETH"
        );

        amountOut = (effectiveIn * 997) / 1000;
        require(amountOut >= minAmountOut, "MockDEX: Insufficient output amount");
    }

    function getQuote(
        address /*tokenIn*/,
        address /*tokenOut*/,
        uint256 amountIn
    ) external pure override returns (uint256 expectedOut) {
        return (amountIn * 997) / 1000;
    }

    function adapterName() external pure override returns (string memory) {
        return "Mock DEX (Persistent)";
    }

    receive() external payable {}
}
