// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "./interfaces/IDEXAdapter.sol";

/**
 * @title PolicyVault
 * @dev Custody vault enforcing risk policies + TEE ECDSA verification.
 *
 * FIXES vs v1:
 *  [1] nonce SEPARATED from Policy struct → updatePolicy no longer resets it
 *  [2] deposit/withdraw are per-user (not onlyOwner)
 *  [3] updateTeeEnclavePubKey has 24h cooldown
 *  [4] dailyLimit is actually enforced on-chain
 *  [5] allowedDEXs minimal enforcement added
 *  [6] emergencyWithdraw for owner safety
 */
contract PolicyVault is Ownable, ReentrancyGuard, Pausable {
    using ECDSA for bytes32;

    // ── Structs ───────────────────────────────────────────────────────────────
    struct PendingTransfer {
        address newOwner;
        uint256 transferInitiatedAt;
    }

    struct Policy {
        uint256 maxDrawdown;       // basis points (e.g. 1000 = 10%)
        uint256 riskMaxPercent;    // basis points, max single-trade size
        address[] allowedTokens;   // whitelist of tradeable tokens
        address[] allowedDEXs;     // whitelist of target DEX contracts
        uint256 dailyLimit;        // max daily spend in wei
    }

    // ── State ─────────────────────────────────────────────────────────────────

    // iNFT contract
    IERC721 public agentNFT;

    // TEE enclave public keys per tokenId
    mapping(uint256 => address) public agentTeeKeys;

    // Attestation Registry for quote verification
    address public attestationRegistry;

    // Default TEE key for initial mints (if not specified)
    address public defaultTeeKey;

    // Transfer protocol tracking
    mapping(uint256 => PendingTransfer) public pendingTransfers;
    uint256 public constant TRANSFER_COOLDOWN = 48 hours;

    // [FIX 1] Nonces stored separately — never reset by updatePolicy
    mapping(uint256 => uint256) public nonces;

    // Policies per tokenId
    mapping(uint256 => Policy) public policies;

    // [FIX 2] Per-user balances (legacy: credited via deposit())
    mapping(address => uint256) public balances;

    // Per-tokenId vault balances (credited via deposit(tokenId))
    mapping(uint256 => uint256) public vaultBalances;

    // [FIX 4] Daily spend tracking per tokenId
    mapping(uint256 => uint256) public dailySpent;
    mapping(uint256 => uint256) public lastResetDay;  // unix day number

    // Key rotation cooldown per tokenId
    uint256 public constant KEY_ROTATION_COOLDOWN = 24 hours;
    mapping(uint256 => uint256) public lastKeyRotations;

    // --- Adapter Pattern ---
    mapping(address => bool) public approvedAdapters;

    // ── Events ────────────────────────────────────────────────────────────────
    event PolicyUpdated(uint256 indexed tokenId);
    event AdapterUsed(address indexed adapter, string name);
    event TransferInitiated(uint256 indexed tokenId, address newOwner, uint256 timestamp);
    event TransferFinalized(uint256 indexed tokenId, address newOwner, uint256 timestamp);
    event StrategyExecuted(
        uint256 indexed tokenId,
        bytes   strategyData,
        uint256 nonce
    );
    event Deposited(address indexed user, uint256 amount);
    event Withdrawn(address indexed user, uint256 amount);
    event DepositedToVault(uint256 indexed tokenId, address indexed depositor, uint256 amount);
    event WithdrawnVault(uint256 indexed tokenId, address indexed owner, uint256 amount);
    event TeeKeyRotated(address indexed newKey, uint256 timestamp);
    event EmergencyWithdraw(address indexed owner, uint256 amount);

    constructor(address _agentNFT, address _defaultTeeKey, address _attestationRegistry)
        Ownable(msg.sender)
    {
        require(_agentNFT    != address(0), "Invalid NFT address");
        require(_defaultTeeKey != address(0), "Invalid TEE key");
        agentNFT      = IERC721(_agentNFT);
        defaultTeeKey = _defaultTeeKey;
        attestationRegistry = _attestationRegistry;
    }

    // ── Modifier ──────────────────────────────────────────────────────────────
    modifier onlyTokenOwner(uint256 tokenId) {
        require(
            agentNFT.ownerOf(tokenId) == msg.sender,
            "Not token owner"
        );
        _;
    }

    // ── Deposit / Withdraw ────────────────────────────────────────────────────
    /**
     * @notice [FIX 2] Any user can deposit native token into the vault.
     *         Funds are tracked per-address (legacy path).
     */
    function deposit() external payable whenNotPaused {
        require(msg.value > 0, "Amount must be > 0");
        balances[msg.sender] += msg.value;
        emit Deposited(msg.sender, msg.value);
    }

    /**
     * @notice Deposit native token attributed to a specific tokenId.
     *         Caller must own the tokenId.
     *         Funds tracked in vaultBalances[tokenId].
     */
    function deposit(uint256 tokenId) external payable onlyTokenOwner(tokenId) whenNotPaused {
        require(msg.value > 0, "Amount must be > 0");
        vaultBalances[tokenId] += msg.value;
        emit DepositedToVault(tokenId, msg.sender, msg.value);
    }

    /**
     * @notice [FIX 2] User withdraws their own funds (legacy path).
     *         ReentrancyGuard protects against re-entrancy.
     */
    function withdraw(uint256 amount) external nonReentrant {
        require(balances[msg.sender] >= amount, "Insufficient balance");
        balances[msg.sender] -= amount;
        (bool ok, ) = msg.sender.call{value: amount}("");
        require(ok, "Transfer failed");
        emit Withdrawn(msg.sender, amount);
    }

    /**
     * @notice Withdraw funds attributed to a specific tokenId.
     *
     *         Access control  : caller must be ownerOf(tokenId).
     *         Balance check   : vaultBalances[tokenId] >= amount.
     *         PendingTransfer : withdrawal IS allowed — it is treated as an
     *                           asset clean-up step before handover.
     *         Security pattern: CEI (Checks-Effects-Interactions) + nonReentrant.
     *
     * @param tokenId  The agent iNFT whose vault funds are being withdrawn.
     * @param amount   Amount in wei to withdraw.
     */
    function withdraw(uint256 tokenId, uint256 amount)
        external
        onlyTokenOwner(tokenId)
        nonReentrant
    {
        require(vaultBalances[tokenId] >= amount, "Insufficient vault balance");

        // Effects — update state before external call (CEI)
        vaultBalances[tokenId] -= amount;

        // Interactions
        (bool ok, ) = msg.sender.call{value: amount}("");
        require(ok, "Transfer failed");

        emit WithdrawnVault(tokenId, msg.sender, amount);
    }

    /**
     * @notice Emergency withdraw by contract owner only.
     *         Pauses the contract first for safety.
     */
    function emergencyWithdraw() external onlyOwner nonReentrant {
        _pause();
        uint256 bal = address(this).balance;
        require(bal > 0, "Nothing to withdraw");
        (bool ok, ) = msg.sender.call{value: bal}("");
        require(ok, "Transfer failed");
        emit EmergencyWithdraw(msg.sender, bal);
    }

    // ── Policy Management ─────────────────────────────────────────────────────
    /**
     * @notice [FIX 1] Updates trading policy WITHOUT touching the nonce.
     *         Nonce lives in a separate mapping — immune to policy updates.
     */
    function updatePolicy(
        uint256 tokenId,
        Policy calldata newPolicy
    ) external onlyTokenOwner(tokenId) whenNotPaused {
        // Validate dailyLimit is non-zero when set
        require(newPolicy.dailyLimit > 0, "dailyLimit must be > 0");
        policies[tokenId] = newPolicy;
        // nonces[tokenId] intentionally NOT touched here
        emit PolicyUpdated(tokenId);
    }

    function getPolicy(uint256 tokenId)
        external
        view
        returns (Policy memory)
    {
        return policies[tokenId];
    }

    // ── Adapter Management ────────────────────────────────────────────────────
    function setAdapter(address adapter, bool approved) external onlyOwner {
        approvedAdapters[adapter] = approved;
    }

    // ── Execute Trade (TEE Verified) ──────────────────────────────────────────
    /**
     * @notice Executes a strategy verified by TEE ECDSA signature.
     *
     * Signed payload (inside TEE):
     *   keccak256(abi.encodePacked(
     *       tokenId, strategyData, nonces[tokenId], deadline, address(this)
     *   ))
     *
     * Adding address(this) prevents cross-contract replay attacks.
     *
     * @param tokenId      The executing agent iNFT id.
     * @param strategyData Encoded trade payload.
     * @param tradeAmount  Amount in wei this trade will spend (for limit check).
     * @param targetDEX    DEX contract this trade targets (for allowlist check).
     * @param signature    ECDSA signature from TEE enclave.
     * @param deadline     Unix timestamp — reverts if expired.
     */
    function executeWithProof(
        uint256 tokenId,
        bytes   calldata strategyData,
        uint256 tradeAmount,
        address targetDEX,
        bytes   calldata signature,
        uint256 deadline
    ) external onlyTokenOwner(tokenId) nonReentrant whenNotPaused {

        // ── 1. Deadline check ────────────────────────────────────────────────
        require(block.timestamp <= deadline, "Transaction expired");

        // Decode strategy data once for all checks
        (string memory action, uint256 amountInStrategy, address tokenIn, address tokenOut) = abi.decode(strategyData, (string, uint256, address, address));

        // ── 1.5. Enforce Reduce-Only Mode during PendingTransfer ─────────────
        if (pendingTransfers[tokenId].transferInitiatedAt > 0) {
            require(keccak256(bytes(action)) == keccak256(bytes("REDUCE_ONLY")), "Must be REDUCE_ONLY during transfer");
        }

        // ── 2. Load policy ───────────────────────────────────────────────────
        Policy storage policy = policies[tokenId];
        require(policy.dailyLimit > 0, "Policy not set");

        // ── 3. [FIX 5] DEX allowlist check ───────────────────────────────────
        require(
            _isDEXAllowed(policy.allowedDEXs, targetDEX),
            "DEX not in allowlist"
        );

        // ── 4. [FIX 4] Daily limit enforcement ───────────────────────────────
        uint256 today = block.timestamp / 1 days;
        if (lastResetDay[tokenId] < today) {
            dailySpent[tokenId]  = 0;
            lastResetDay[tokenId] = today;
        }
        require(
            dailySpent[tokenId] + tradeAmount <= policy.dailyLimit,
            "Daily limit exceeded"
        );

        // ── 5. Risk max per trade check ───────────────────────────────────────
        uint256 userBalance = balances[msg.sender];
        if (userBalance > 0 && policy.riskMaxPercent > 0) {
            uint256 maxAllowed = (userBalance * policy.riskMaxPercent) / 10000;
            require(tradeAmount <= maxAllowed, "Exceeds risk max per trade");
        }

        // ── 6. [FIX 1] ECDSA verification using SEPARATED nonce ─────────────
        uint256 currentNonce = nonces[tokenId];

        bytes32 messageHash = keccak256(
            abi.encodePacked(
                tokenId,
                strategyData,
                currentNonce,
                deadline,
                address(this)
            )
        );
        bytes32 ethHash = MessageHashUtils.toEthSignedMessageHash(messageHash);
        address signer  = ethHash.recover(signature);

        address agentKey = agentTeeKeys[tokenId];
        if (agentKey == address(0)) agentKey = defaultTeeKey;
        
        require(signer == agentKey, "Invalid TEE signature");

        // ── 7. Commit: increment nonce + update daily spend ──────────────────
        nonces[tokenId]      = currentNonce + 1;
        dailySpent[tokenId] += tradeAmount;

        // ── 8. ACTUAL EXECUTION (Adapter Call) ──────────────────
        require(approvedAdapters[targetDEX], "Adapter not approved");
        IDEXAdapter adapter = IDEXAdapter(targetDEX);
        emit AdapterUsed(targetDEX, adapter.adapterName());
        
        uint256 balanceBefore = address(this).balance;
        uint256 valueToSend = 0;

        if (keccak256(bytes(action)) == keccak256(bytes("BUY"))) {
            valueToSend = tradeAmount;
            require(vaultBalances[tokenId] >= valueToSend, "Insufficient vault balance for trade");
            vaultBalances[tokenId] -= valueToSend;
            // Native -> ERC20
            require(tokenIn == address(0), "BUY action must use address(0) as tokenIn");
        } else if (keccak256(bytes(action)) == keccak256(bytes("REDUCE_ONLY"))) {
            // ERC20 -> Native
            require(tokenOut == address(0), "REDUCE_ONLY action must use address(0) as tokenOut");
            // valueToSend = 0 natively
            amountInStrategy = tradeAmount; // Wait, strategy must provide the exact amount of ERC20 to return
        }

        // Call the adapter's swap function. For REDUCE_ONLY we must transfer the ERC-20 to the adapter first?
        // Wait, for standard swaps, the adapter assumes we've approved it!
        // We will assume XSwapAdapter does transferFrom, but wait! The ERC20 is held by PolicyVault.
        // We need to approve the adapter to spend ERC-20! 
        if (tokenIn != address(0) && amountInStrategy > 0) {
            // We must approve the adapter
            (bool ok, ) = tokenIn.call(abi.encodeWithSignature("approve(address,uint256)", targetDEX, amountInStrategy));
            require(ok, "ERC20 approve failed");
        }

        // Perform the swap via adapter
        adapter.swap{value: valueToSend}(
            tokenIn,
            tokenOut,
            amountInStrategy,
            0,            // minAmountOut defaults to 0 for hackathon demo
            address(this) // recipient is always PolicyVault
        );

        // --- FULL LOOP: Detect refund from DEX and credit agent back ---
        uint256 balanceAfter = address(this).balance;
        // If it was a REDUCE_ONLY, balanceAfter will be > (balanceBefore - valueToSend)
        uint256 expectedBalance = balanceBefore - valueToSend;
        if (balanceAfter > expectedBalance) {
            uint256 refund = balanceAfter - expectedBalance;
            vaultBalances[tokenId] += refund;
        }

        emit StrategyExecuted(tokenId, strategyData, currentNonce);
    }

    /**
     * @notice Updates TEE public key for a specific agent with cooldown and attestation.
     */
    function updateAgentTeeKey(
        uint256 tokenId, 
        address _newKey, 
        bytes32 mrenclave, 
        bytes32 mrsigner
    ) external onlyTokenOwner(tokenId) {
        require(_newKey != address(0), "Invalid key");
        require(
            block.timestamp >= lastKeyRotations[tokenId] + KEY_ROTATION_COOLDOWN,
            "Key rotation cooldown active"
        );

        // Verify attestation measurement via registry
        if (attestationRegistry != address(0)) {
            (bool ok, bytes memory data) = attestationRegistry.staticcall(
                abi.encodeWithSignature("verifyMeasurements(bytes32,bytes32)", mrenclave, mrsigner)
            );
            require(ok && abi.decode(data, (bool)), "Invalid TEE attestation");
        }

        agentTeeKeys[tokenId] = _newKey;
        lastKeyRotations[tokenId] = block.timestamp;
        emit TeeKeyRotated(_newKey, block.timestamp);
    }

    function setDefaultTeeKey(address _newKey) external onlyOwner {
        defaultTeeKey = _newKey;
    }

    // ── Handover Protocol ─────────────────────────────────────────────────────
    
    function initiateTransfer(uint256 tokenId, address newOwner) external onlyTokenOwner(tokenId) whenNotPaused {
        require(newOwner != address(0), "Invalid new owner");
        pendingTransfers[tokenId] = PendingTransfer({
            newOwner: newOwner,
            transferInitiatedAt: block.timestamp
        });
        emit TransferInitiated(tokenId, newOwner, block.timestamp);
    }
    
    function finalizeTransfer(uint256 tokenId) external nonReentrant {
        PendingTransfer memory pt = pendingTransfers[tokenId];
        require(pt.transferInitiatedAt > 0, "No pending transfer");
        require(block.timestamp >= pt.transferInitiatedAt + TRANSFER_COOLDOWN, "Transfer cooldown active");
        
        // Revoke TEE Enclave PubKey for safety during ownership change
        // The new owner must set their own TEE key to resume operation
        agentTeeKeys[tokenId] = address(0);
        
        address newOwner = pt.newOwner;
        delete pendingTransfers[tokenId];
        
        // Transfer the NFT
        agentNFT.safeTransferFrom(agentNFT.ownerOf(tokenId), newOwner, tokenId);
        
        emit TransferFinalized(tokenId, newOwner, block.timestamp);
    }

    // ── View Helpers ──────────────────────────────────────────────────────────
    function getNonce(uint256 tokenId) external view returns (uint256) {
        return nonces[tokenId];
    }

    function getDailySpent(uint256 tokenId) external view returns (uint256) {
        uint256 today = block.timestamp / 1 days;
        if (lastResetDay[tokenId] < today) return 0;
        return dailySpent[tokenId];
    }

    /**
     * @notice Returns the vault balance credited to a specific tokenId.
     */
    function getVaultBalance(uint256 tokenId) external view returns (uint256) {
        return vaultBalances[tokenId];
    }

    function keyRotationUnlocksAt(uint256 tokenId) external view returns (uint256) {
        return lastKeyRotations[tokenId] + KEY_ROTATION_COOLDOWN;
    }

    // ── Admin ─────────────────────────────────────────────────────────────────
    function pause()   external onlyOwner { _pause(); }
    function unpause() external onlyOwner { _unpause(); }

    // ── Internal ──────────────────────────────────────────────────────────────
    function _isDEXAllowed(
        address[] storage allowedDEXs,
        address target
    ) internal view returns (bool) {
        // If no allowlist set, block all (safe default)
        if (allowedDEXs.length == 0) return false;
        for (uint256 i = 0; i < allowedDEXs.length; i++) {
            if (allowedDEXs[i] == target) return true;
        }
        return false;
    }

    /**
     * @notice Allows MockDEX to refund A0GI tokens to the vault.
     */
    receive() external payable {}
}