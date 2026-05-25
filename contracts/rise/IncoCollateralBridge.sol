// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IncoCollateralBridge v2
/// @notice Receives bridge proofs from Inco vault via oracle signature
///         AND transfers real ETH to the user on RISE.
/// @dev Lives on RISE testnet. Must be funded with ETH via fund().
///      Oracle is an off-chain service (Vercel function) that listens to
///      DarkBridgeRequested events on Base and signs (user, amount, nonce).
contract IncoCollateralBridge {
    // ─── State ──────────────────────────────────────────────────
    address public oracle;
    address public owner;

    mapping(address => uint256) public collateral;          // user → total bridged
    mapping(bytes32 => bool)    public usedSignatures;      // replay protection

    uint256 public totalFunded;
    uint256 public totalClaimed;

    // ─── Events ─────────────────────────────────────────────────
    event CollateralBridged(address indexed user, uint256 amount, uint256 nonce);
    event BridgeFunded(address indexed funder, uint256 amount);
    event OracleUpdated(address indexed newOracle);
    event Withdrawn(address indexed to, uint256 amount);

    // ─── Modifiers ──────────────────────────────────────────────
    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner");
        _;
    }

    // ─── Constructor ────────────────────────────────────────────
    constructor(address _oracle) {
        require(_oracle != address(0), "Invalid oracle");
        oracle = _oracle;
        owner  = msg.sender;
    }

    // ─── Funding (anyone can top up the bridge) ─────────────────
    function fund() external payable {
        require(msg.value > 0, "Zero fund");
        totalFunded += msg.value;
        emit BridgeFunded(msg.sender, msg.value);
    }

    receive() external payable {
        totalFunded += msg.value;
        emit BridgeFunded(msg.sender, msg.value);
    }

    // ─── Claim with oracle signature ────────────────────────────
    /// @notice Claim bridged ETH on RISE using oracle signature from Base event.
    /// @param amount    Amount bridged (in wei). Oracle decrypts the FHE handle
    ///                  from DarkBridgeRequested and signs the plaintext.
    /// @param nonce     Nonce from the bridge event on Base.
    /// @param signature Oracle signature over keccak256(user, amount, nonce).
    function claimFromInco(
        uint128 amount,
        uint256 nonce,
        bytes calldata signature
    ) external {
        // Build the signed message
        bytes32 messageHash = keccak256(abi.encodePacked(msg.sender, amount, nonce));
        bytes32 ethSignedHash = keccak256(
            abi.encodePacked("\x19Ethereum Signed Message:\n32", messageHash)
        );

        // Replay protection
        require(!usedSignatures[ethSignedHash], "Signature already used");

        // Oracle signature check
        require(_recoverSigner(ethSignedHash, signature) == oracle, "Invalid oracle signature");

        // Liquidity check
        require(address(this).balance >= amount, "Bridge insufficient liquidity");

        // Effects
        usedSignatures[ethSignedHash] = true;
        collateral[msg.sender] += amount;
        totalClaimed += amount;

        // ✅ Transfer real ETH to user on RISE
        (bool success, ) = msg.sender.call{value: amount}("");
        require(success, "ETH transfer failed");

        emit CollateralBridged(msg.sender, amount, nonce);
    }

    // ─── Reputation helper (used by ReputationToken on Arbitrum) ─
    /// @notice True if user has bridged enough to claim reputation.
    function hasCollateral(address user, uint256 minAmount) external view returns (bool) {
        return collateral[user] >= minAmount;
    }

    /// @notice Reputation points = collateral / 1e14 (so 0.1 ETH = 1000 points)
    function getReputationPoints(address user) external view returns (uint32) {
        uint256 points = collateral[user] / 1e14;
        return uint32(points > type(uint32).max ? type(uint32).max : points);
    }

    // ─── Admin ──────────────────────────────────────────────────
    function updateOracle(address newOracle) external onlyOwner {
        require(newOracle != address(0), "Invalid address");
        oracle = newOracle;
        emit OracleUpdated(newOracle);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Zero owner");
        owner = newOwner;
    }

    /// @notice Emergency withdraw (owner only). Used to recover funds if bridge is decommissioned.
    function emergencyWithdraw(address payable to, uint256 amount) external onlyOwner {
        require(to != address(0), "Zero to");
        require(amount <= address(this).balance, "Insufficient");
        (bool ok, ) = to.call{value: amount}("");
        require(ok, "Withdraw failed");
        emit Withdrawn(to, amount);
    }

    // ─── Internal ───────────────────────────────────────────────
    function _recoverSigner(bytes32 hash, bytes memory sig) internal pure returns (address) {
        require(sig.length == 65, "Invalid signature length");
        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {
            r := mload(add(sig, 32))
            s := mload(add(sig, 64))
            v := byte(0, mload(add(sig, 96)))
        }
        if (v < 27) v += 27;
        return ecrecover(hash, v, r, s);
    }
}
