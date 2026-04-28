// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title MockDEX (Legacy — Not Used in Production)
 * @dev This is the original mock DEX with a non-standard API.
 *      It is kept here for historical reference only.
 *      The active adapter is contracts/mocks/MockDEXAdapter.sol which
 *      implements IDEXAdapter and is used in all current tests and scripts.
 *      Use contracts/mocks/MockDEXAdapter.sol instead.
 */
contract MockDEX is Ownable {

    // ── Virtual Asset Balances ─────────────────────────────────────────────────
    // Maps tokenId => asset ticker => virtual balance (in wei equivalent)
    mapping(uint256 => mapping(string => uint256)) public virtualBalances;
    // Maps tokenId => native 0G balance executed through this DEX
    mapping(uint256 => uint256) public nativeSwapped;

    constructor() Ownable(msg.sender) {}

    // ── Events ─────────────────────────────────────────────────────────────────
    event TradeFinalized(
        address indexed agent,
        uint256 indexed tokenId,
        string action,
        uint256 nativeAmount,
        string asset,
        uint256 virtualReceived,
        uint256 timestamp
    );

    // ── Core Trade Function ────────────────────────────────────────────────────

    /**
     * @notice Executes a simulated trade.
     *         When BUY is called with native 0G value, credits virtual asset balance.
     *         When REDUCE_ONLY is called, returns simulated proceeds.
     */
    function executeTrade(
        string calldata action,
        uint256 amount,
        string calldata asset
    ) external payable {
        uint256 tokenId = 0; // Default; in production passed via calldata

        if (keccak256(bytes(action)) == keccak256(bytes("BUY"))) {
            // Simulate swap: 0G in -> virtual asset out
            // 1:1 rate for demo simplicity (price discovery not in scope for hackathon)
            uint256 virtualOut = msg.value > 0 ? msg.value : amount;
            virtualBalances[tokenId][asset] += virtualOut;
            nativeSwapped[tokenId] += msg.value;

            emit TradeFinalized(msg.sender, tokenId, action, msg.value, asset, virtualOut, block.timestamp);
        } else if (keccak256(bytes(action)) == keccak256(bytes("REDUCE_ONLY"))) {
            // Simulate closing position: return virtual balance
            uint256 virtualBal = virtualBalances[tokenId][asset];
            if (virtualBal > 0) {
                virtualBalances[tokenId][asset] = 0;
                emit TradeFinalized(msg.sender, tokenId, action, 0, asset, virtualBal, block.timestamp);
            }
        } else {
            // HOLD — emit event for audit trail only
            emit TradeFinalized(msg.sender, tokenId, action, 0, asset, 0, block.timestamp);
        }
    }

    /**
     * @notice Overloaded executeTrade that accepts a tokenId for multi-agent support.
     */
    function executeTradeFor(
        uint256 tokenId,
        string calldata action,
        uint256 amount,
        string calldata asset
    ) external payable {
        if (keccak256(bytes(action)) == keccak256(bytes("BUY"))) {
            uint256 virtualOut = msg.value > 0 ? msg.value : amount;
            virtualBalances[tokenId][asset] += virtualOut;
            nativeSwapped[tokenId] += msg.value;
            emit TradeFinalized(msg.sender, tokenId, action, msg.value, asset, virtualOut, block.timestamp);
        } else if (keccak256(bytes(action)) == keccak256(bytes("REDUCE_ONLY"))) {
            uint256 virtualBal = virtualBalances[tokenId][asset];
            if (virtualBal > 0) {
                virtualBalances[tokenId][asset] = 0;
                
                // --- FULL LOOP: Refund native tokens to PolicyVault ---
                // In this mock, 1 virtual = 1 native
                uint256 refundAmount = virtualBal;
                (bool ok, ) = payable(msg.sender).call{value: refundAmount}("");
                require(ok, "Refund to vault failed");

                emit TradeFinalized(msg.sender, tokenId, action, 0, asset, virtualBal, block.timestamp);
            }
        } else {
            emit TradeFinalized(msg.sender, tokenId, action, 0, asset, 0, block.timestamp);
        }
    }

    // ── View Functions ─────────────────────────────────────────────────────────

    /**
     * @notice Returns virtual balance of an asset for a tokenId.
     */
    function getVirtualBalance(uint256 tokenId, string calldata asset) external view returns (uint256) {
        return virtualBalances[tokenId][asset];
    }

    /**
     * @notice Returns total native 0G swapped for a tokenId.
     */
    function getNativeSwapped(uint256 tokenId) external view returns (uint256) {
        return nativeSwapped[tokenId];
    }

    /**
     * @notice Emergency withdraw — restricted to contract owner.
     */
    function emergencyWithdraw() external onlyOwner {
        uint256 bal = address(this).balance;
        require(bal > 0, "Nothing to withdraw");
        (bool ok, ) = payable(msg.sender).call{value: bal}("");
        require(ok, "Withdraw failed");
    }

    // Fallback to accept native 0G tokens
    receive() external payable {}
}
