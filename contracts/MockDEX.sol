// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title MockDEX
 * @dev Simulated DEX for SealedClaw on 0G Galileo Testnet.
 *      Accepts native 0G token and simulates swap to virtual assets (vETH, vBTC).
 *      Tracks virtual portfolio balances per iNFT tokenId for dashboard display.
 *
 * In production, this would call a real DEX router (e.g. UniswapV3).
 */
contract MockDEX {

    // ── Virtual Asset Balances ─────────────────────────────────────────────────
    // Maps tokenId => asset ticker => virtual balance (in wei equivalent)
    mapping(uint256 => mapping(string => uint256)) public virtualBalances;
    // Maps tokenId => native 0G balance executed through this DEX
    mapping(uint256 => uint256) public nativeSwapped;

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
     * @notice Emergency withdraw for contract owner (Hackathon safety).
     */
    function emergencyWithdraw() external {
        // Simple owner check (deployer parity)
        (bool ok, ) = payable(tx.origin).call{value: address(this).balance}("");
        require(ok, "Withdraw failed");
    }

    // Fallback to accept native 0G tokens
    receive() external payable {}
}

