// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";

/**
 * @title StrategyVault
 * @dev Stores the chosen strategy class for each iNFT agent.
 *
 * Strategy Classes:
 *   0 = SAFE_GUARDIAN    — Low risk, protect capital above all
 *   1 = YIELD_SNIPER     — Aggressive yield hunting, high frequency
 *   2 = BALANCED_MERC    — Balanced risk/reward, default
 *   3 = MOON_CHASER      — Maximum aggression, high risk/high reward
 *   4 = CUSTOM           — User-defined parameters
 *
 * Strategy Commitment Pattern (Anti-Bait-and-Switch):
 *   - Strategy is IMMUTABLE once committed via commitStrategy().
 *   - Strategy can only be changed if there is NO active pending transfer.
 *   - During a pending transfer (handover window), the strategy is LOCKED.
 *   - This prevents a seller from degrading the strategy right before selling.
 */
contract StrategyVault {

    // ── Enums ─────────────────────────────────────────────────────────────────
    enum StrategyClass {
        SAFE_GUARDIAN,   // 0
        YIELD_SNIPER,    // 1
        BALANCED_MERC,   // 2
        MOON_CHASER,     // 3
        CUSTOM           // 4
    }

    // ── Structs ───────────────────────────────────────────────────────────────
    struct StrategyConfig {
        StrategyClass strategyClass;
        // For CUSTOM class:
        uint256 customBuyThresholdBps;    // e.g. 50 = 0.5% price rise triggers BUY
        uint256 customReduceThresholdBps; // e.g. 100 = 1% price drop triggers REDUCE
        uint256 customBuySizeBps;         // e.g. 500 = 5% of portfolio per buy
        // Commitment metadata
        uint256 committedAt;              // timestamp when strategy was last set
        bool committed;                   // true once strategy has been set
    }

    // ── State ─────────────────────────────────────────────────────────────────
    IERC721 public agentNFT;
    
    /// @dev interface to check pending transfer status from PolicyVault
    address public policyVault;

    mapping(uint256 => StrategyConfig) public strategies;

    // ── Events ────────────────────────────────────────────────────────────────
    event StrategyCommitted(
        uint256 indexed tokenId,
        StrategyClass strategyClass,
        address indexed owner
    );
    event StrategyUpdated(
        uint256 indexed tokenId,
        StrategyClass strategyClass,
        address indexed owner
    );

    // ── Constructor ───────────────────────────────────────────────────────────
    constructor(address _agentNFT, address _policyVault) {
        require(_agentNFT != address(0), "Invalid NFT address");
        agentNFT = IERC721(_agentNFT);
        policyVault = _policyVault;
    }

    // ── Modifiers ─────────────────────────────────────────────────────────────
    modifier onlyTokenOwner(uint256 tokenId) {
        require(agentNFT.ownerOf(tokenId) == msg.sender, "Not token owner");
        _;
    }

    // ── Core Functions ────────────────────────────────────────────────────────

    /**
     * @notice Commit a preset strategy class for a tokenId.
     *         Can only be changed if no handover is pending.
     */
    function commitStrategy(
        uint256 tokenId,
        StrategyClass strategyClass
    ) external onlyTokenOwner(tokenId) {
        require(strategyClass != StrategyClass.CUSTOM, "Use commitCustomStrategy for custom class");
        _checkNotLocked(tokenId);

        strategies[tokenId] = StrategyConfig({
            strategyClass: strategyClass,
            customBuyThresholdBps: 0,
            customReduceThresholdBps: 0,
            customBuySizeBps: 0,
            committedAt: block.timestamp,
            committed: true
        });

        emit StrategyCommitted(tokenId, strategyClass, msg.sender);
    }

    /**
     * @notice Commit a CUSTOM strategy class with user-defined parameters.
     */
    function commitCustomStrategy(
        uint256 tokenId,
        uint256 buyThresholdBps,
        uint256 reduceThresholdBps,
        uint256 buySizeBps
    ) external onlyTokenOwner(tokenId) {
        require(buyThresholdBps > 0 && buyThresholdBps <= 5000, "buyThreshold: 1-5000 bps");
        require(reduceThresholdBps > 0 && reduceThresholdBps <= 5000, "reduceThreshold: 1-5000 bps");
        require(buySizeBps > 0 && buySizeBps <= 5000, "buySize: 1-5000 bps");
        _checkNotLocked(tokenId);

        strategies[tokenId] = StrategyConfig({
            strategyClass: StrategyClass.CUSTOM,
            customBuyThresholdBps: buyThresholdBps,
            customReduceThresholdBps: reduceThresholdBps,
            customBuySizeBps: buySizeBps,
            committedAt: block.timestamp,
            committed: true
        });

        emit StrategyCommitted(tokenId, StrategyClass.CUSTOM, msg.sender);
    }

    // ── View Functions ────────────────────────────────────────────────────────

    /**
     * @notice Returns the strategy config for a given tokenId.
     */
    function getStrategy(uint256 tokenId) external view returns (StrategyConfig memory) {
        return strategies[tokenId];
    }

    /**
     * @notice Returns the strategy class as a uint8 (for easy off-chain consumption).
     *         Returns 2 (BALANCED_MERC) as default if no strategy set.
     */
    function getStrategyClass(uint256 tokenId) external view returns (uint8) {
        StrategyConfig storage cfg = strategies[tokenId];
        if (!cfg.committed) return uint8(StrategyClass.BALANCED_MERC); // default
        return uint8(cfg.strategyClass);
    }

    /**
     * @notice Returns parameters the TEE should use for this agent.
     *         Resolves preset class defaults or custom values.
     */
    function getResolvedParams(uint256 tokenId) external view returns (
        uint256 buyThresholdBps,
        uint256 reduceThresholdBps,
        uint256 buySizeBps,
        uint8 strategyClassId
    ) {
        StrategyConfig storage cfg = strategies[tokenId];
        if (!cfg.committed) {
            // Default: BALANCED_MERC
            return (200, 300, 500, uint8(StrategyClass.BALANCED_MERC));
        }

        if (cfg.strategyClass == StrategyClass.CUSTOM) {
            return (
                cfg.customBuyThresholdBps,
                cfg.customReduceThresholdBps,
                cfg.customBuySizeBps,
                uint8(StrategyClass.CUSTOM)
            );
        }

        // Resolve preset class defaults
        (buyThresholdBps, reduceThresholdBps, buySizeBps) = _getPresetParams(cfg.strategyClass);
        return (buyThresholdBps, reduceThresholdBps, buySizeBps, uint8(cfg.strategyClass));
    }

    /**
     * @notice Returns whether the strategy is currently locked (during handover).
     */
    function isStrategyLocked(uint256 tokenId) external view returns (bool) {
        return _isHandoverPending(tokenId);
    }

    // ── Internal ──────────────────────────────────────────────────────────────

    function _checkNotLocked(uint256 tokenId) internal view {
        require(!_isHandoverPending(tokenId), "Strategy locked during handover");
    }

    function _isHandoverPending(uint256 tokenId) internal view returns (bool) {
        if (policyVault == address(0)) return false;
        // Call PolicyVault.pendingTransfers(tokenId) to check if handover is active
        (bool success, bytes memory data) = policyVault.staticcall(
            abi.encodeWithSignature("pendingTransfers(uint256)", tokenId)
        );
        if (!success || data.length < 64) return false;
        (, uint256 transferInitiatedAt) = abi.decode(data, (address, uint256));
        return transferInitiatedAt > 0;
    }

    function _getPresetParams(StrategyClass cls) internal pure returns (
        uint256 buyThresholdBps,
        uint256 reduceThresholdBps,
        uint256 buySizeBps
    ) {
        if (cls == StrategyClass.SAFE_GUARDIAN) {
            return (400, 150, 200);  // Buy on 4% rally, sell on 1.5% dip, use 2% of portfolio
        } else if (cls == StrategyClass.YIELD_SNIPER) {
            return (50, 200, 1500); // Buy on 0.5% move, sell on 2% dip, use 15% of portfolio
        } else if (cls == StrategyClass.BALANCED_MERC) {
            return (200, 300, 500); // Buy on 2%, sell on 3%, use 5%
        } else if (cls == StrategyClass.MOON_CHASER) {
            return (100, 500, 2500); // Buy on 1% rally, hold until 5% crash, use 25% of portfolio
        }
        // Fallback: BALANCED_MERC
        return (200, 300, 500);
    }
}
