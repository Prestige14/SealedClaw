// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../interfaces/IDEXAdapter.sol";

// Minimal ERC20 for internal approvals
interface IERC20Minimal {
    function approve(address spender, uint256 amount) external returns (bool);
}

interface IXSwapRouter {
    function swapExactETHForTokens(
        uint amountOutMin,
        address[] calldata path,
        address to,
        uint deadline
    ) external payable returns (uint[] memory amounts);

    function swapExactTokensForETH(
        uint amountIn,
        uint amountOutMin,
        address[] calldata path,
        address to,
        uint deadline
    ) external returns (uint[] memory amounts);

    function swapExactTokensForTokens(
        uint amountIn,
        uint amountOutMin,
        address[] calldata path,
        address to,
        uint deadline
    ) external returns (uint[] memory amounts);

    function getAmountsOut(uint amountIn, address[] calldata path) external view returns (uint[] memory amounts);
}

/**
 * @title XSwapAdapter
 * @notice Adapter for XSwap on 0G Mainnet/Testnet.
 */
contract XSwapAdapter is IDEXAdapter {
    IXSwapRouter public immutable router;
    address public immutable wNative;

    constructor(address _router, address _wNative) {
        require(_router != address(0), "Invalid router");
        require(_wNative != address(0), "Invalid wNative");
        router = IXSwapRouter(_router);
        wNative = _wNative;
    }

    function swap(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 minAmountOut,
        address recipient
    ) external payable override returns (uint256 amountOut) {
        address[] memory path = new address[](2);
        uint256 deadline = block.timestamp + 300;

        if (tokenIn == address(0)) {
            // Native -> ERC20
            require(msg.value == amountIn, "XSwapAdapter: amountIn mismatch");
            path[0] = wNative;
            path[1] = tokenOut;
            uint[] memory amounts = router.swapExactETHForTokens{value: amountIn}(
                minAmountOut,
                path,
                recipient,
                deadline
            );
            return amounts[1];
        } else if (tokenOut == address(0)) {
            // ERC20 -> Native
            require(msg.value == 0, "XSwapAdapter: msg.value must be 0");
            IERC20Minimal(tokenIn).approve(address(router), amountIn);
            path[0] = tokenIn;
            path[1] = wNative;
            uint[] memory amounts = router.swapExactTokensForETH(
                amountIn,
                minAmountOut,
                path,
                recipient,
                deadline
            );
            return amounts[1];
        } else {
            // ERC20 -> ERC20
            require(msg.value == 0, "XSwapAdapter: msg.value must be 0");
            IERC20Minimal(tokenIn).approve(address(router), amountIn);
            path[0] = tokenIn;
            path[1] = tokenOut;
            uint[] memory amounts = router.swapExactTokensForTokens(
                amountIn,
                minAmountOut,
                path,
                recipient,
                deadline
            );
            return amounts[1];
        }
    }

    function getQuote(
        address tokenIn,
        address tokenOut,
        uint256 amountIn
    ) external view override returns (uint256 expectedOut) {
        if (amountIn == 0) return 0;
        address[] memory path = new address[](2);
        path[0] = tokenIn == address(0) ? wNative : tokenIn;
        path[1] = tokenOut == address(0) ? wNative : tokenOut;
        
        try router.getAmountsOut(amountIn, path) returns (uint[] memory amounts) {
            return amounts[1];
        } catch {
            return 0; // Return 0 on error (e.g. no liquidity)
        }
    }

    function adapterName() external pure override returns (string memory) {
        return "XSwap Adapter";
    }
}
