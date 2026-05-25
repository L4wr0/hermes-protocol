// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@inco/lightning/Lib.sol";

/// @title ConfidentialVault v2
/// @notice TEE-encrypted ETH vault on Base Sepolia (Inco Lightning).
///         v2 changes vs v1:
///         - NO MORE cHERMES drip on deposit (cHERMES is now AMM-only)
///         - Cleaner bridge flow with emitted plaintext amount for oracle relay
/// @dev Bridge flow:
///   1. User calls darkBridgeToRise(amount) on Base
///   2. Vault locks encrypted amount, emits DarkBridgeRequested(user, amount, nonce)
///   3. Oracle 1 (Vercel function) signs (user, amount, nonce)
///   4. User calls IncoCollateralBridge.claimFromInco(amount, nonce, sig) on RISE
contract ConfidentialVault {
    using e for *;

    // ─── State ──────────────────────────────────────────────────
    mapping(address => euint256) private _balances;
    mapping(address => euint256) private _lockedForBridge;

    uint256 public totalDeposits;
    uint256 public bridgeNonce;
    address public bridge; // address of the bridge contract on RISE (for reference)

    // ─── Events ─────────────────────────────────────────────────
    event Deposited(address indexed user, uint256 amount);
    event Withdrawn(address indexed user, uint256 amount);

    /// @notice Emitted when user requests a bridge.
    /// @dev    The plaintext `amount` is included so Oracle 1 can sign it
    ///         without needing FHE decryption (saves co-validator round-trip).
    ///         The encrypted version is stored on-chain for the user's records.
    event DarkBridgeRequested(
        address indexed user,
        uint256 amount,        // plaintext for oracle (user already knows it)
        uint256 nonce
    );

    event BridgeClaimed(address indexed user, uint256 nonce);

    // ─── Constructor ────────────────────────────────────────────
    constructor(address _bridge) {
        bridge = _bridge;
    }

    // ─── Deposit ────────────────────────────────────────────────
    /// @notice Deposit ETH. Balance becomes TEE-encrypted on Inco.
    /// @dev    No cHERMES is minted here. cHERMES is only obtainable
    ///         via the DarkAMM (swap ETH for cHERMES on the pool).
    function deposit() external payable {
        require(msg.value > 0, "Zero deposit");

        euint256 currentBalance = _balances[msg.sender];
        euint256 depositAmount  = msg.value.asEuint256();

        _balances[msg.sender] = currentBalance.add(depositAmount);
        _balances[msg.sender].allow(msg.sender);

        totalDeposits += msg.value;

        emit Deposited(msg.sender, msg.value);
    }

    // ─── Withdraw ───────────────────────────────────────────────
    /// @notice Withdraw plaintext amount (user knows their own balance).
    function withdraw(uint256 amount) external {
        require(amount > 0, "Zero withdraw");
        require(amount <= totalDeposits, "Insufficient vault liquidity");

        euint256 withdrawAmount = amount.asEuint256();
        _balances[msg.sender] = _balances[msg.sender].sub(withdrawAmount);
        _balances[msg.sender].allow(msg.sender);

        totalDeposits -= amount;

        (bool success, ) = msg.sender.call{value: amount}("");
        require(success, "Transfer failed");

        emit Withdrawn(msg.sender, amount);
    }

    // ─── Dark bridge to RISE ────────────────────────────────────
    /// @notice Lock encrypted amount for bridging to RISE.
    /// @param amount Plaintext amount to bridge (user-declared).
    /// @dev The encrypted balance is reduced, locked counter increased.
    ///      Oracle 1 picks up the event and signs (msg.sender, amount, nonce).
    function darkBridgeToRise(uint256 amount) external {
        require(amount >= 0.01 ether, "Minimum 0.01 ETH");

        euint256 bridgeAmountEnc = amount.asEuint256();

        // Increase locked-for-bridge counter
        euint256 currentLocked = _lockedForBridge[msg.sender];
        _lockedForBridge[msg.sender] = currentLocked.add(bridgeAmountEnc);
        _lockedForBridge[msg.sender].allow(msg.sender);

        // Decrease available balance
        _balances[msg.sender] = _balances[msg.sender].sub(bridgeAmountEnc);
        _balances[msg.sender].allow(msg.sender);

        // Emit plaintext amount for oracle relay (user knows it anyway)
        emit DarkBridgeRequested(msg.sender, amount, bridgeNonce);
        bridgeNonce++;
    }

    /// @notice Called by the bridge oracle to mark a claim as confirmed.
    /// @dev Not strictly required for the protocol but useful for indexing.
    function confirmBridgeClaim(address user, uint256 nonce) external {
        require(msg.sender == bridge, "Only bridge");
        emit BridgeClaimed(user, nonce);
    }

    // ─── Admin ──────────────────────────────────────────────────
    function setBridge(address newBridge) external {
        require(bridge == address(0), "Bridge already set");
        bridge = newBridge;
    }

    // ─── Views (ciphertext handles) ─────────────────────────────
    function myBalance() external view returns (euint256) {
        return _balances[msg.sender];
    }

    function myLockedAmount() external view returns (euint256) {
        return _lockedForBridge[msg.sender];
    }

    receive() external payable {}
}
