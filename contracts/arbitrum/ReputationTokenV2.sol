// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {FHE, euint32} from "@fhenixprotocol/cofhe-contracts/FHE.sol";
import {ITaskManager} from "@fhenixprotocol/cofhe-contracts/ICofhe.sol";

/// @title ReputationTokenV2
/// @notice FHE reputation score with shield/unshield mechanics.
/// @dev Lives on Arbitrum Sepolia (Fhenix CoFHE).
///      Unshield flow (CoFHE polling pattern):
///      1. shield()           — plaintext → encrypted
///      2. requestUnshield()  — schedules off-chain decrypt via TaskManager
///      3. ...wait ~30-60s while frontend polls canFinalizeUnshield()
///      4. finalizeUnshield() — reads back plaintext via getDecryptResultSafe
interface IIncoCollateralBridge {
    function collateral(address user) external view returns (uint256);
}

contract ReputationTokenV2 {
    // CoFHE TaskManager on Arbitrum Sepolia (re-declared here to avoid
    // name collision with the constant in FHE.sol when both are imported elsewhere)
    address internal constant TASK_MGR = 0xeA30c4B8b44078Bbf8a6ef5b9f1eC1626C7848D9;

    mapping(address => euint32) private _shieldedScore;
    mapping(address => uint32)  public  publicScore;
    mapping(address => bool)    public  hasClaimed;
    mapping(address => bool)    public  isShielded;
    mapping(address => bool)    public  hasPendingUnshield;

    address public immutable bridge;
    uint256 public constant  MIN_BRIDGED = 0.1 ether;
    uint32  public constant  INITIAL_SCORE = 100;

    event Claimed(address indexed user, uint32 score);
    event Shielded(address indexed user);
    event UnshieldRequested(address indexed user);
    event Unshielded(address indexed user, uint32 score);

    constructor(address _bridge) {
        require(_bridge != address(0), "Invalid bridge");
        bridge = _bridge;
    }

    function claimScore() external {
        require(!hasClaimed[msg.sender], "Already claimed");
        require(
            IIncoCollateralBridge(bridge).collateral(msg.sender) >= MIN_BRIDGED,
            "Need >=0.1 ETH bridged"
        );
        publicScore[msg.sender] = INITIAL_SCORE;
        hasClaimed[msg.sender]  = true;
        isShielded[msg.sender]  = false;
        emit Claimed(msg.sender, INITIAL_SCORE);
    }

    function shield() external {
        require(hasClaimed[msg.sender], "Not claimed");
        require(!isShielded[msg.sender], "Already shielded");
        require(!hasPendingUnshield[msg.sender], "Pending unshield");

        _shieldedScore[msg.sender] = FHE.asEuint32(publicScore[msg.sender]);
        FHE.allow(_shieldedScore[msg.sender], msg.sender);
        FHE.allowThis(_shieldedScore[msg.sender]);

        publicScore[msg.sender] = 0;
        isShielded[msg.sender]  = true;

        emit Shielded(msg.sender);
    }

    /// @notice Schedule async decryption via CoFHE TaskManager.
    function requestUnshield() external {
        require(isShielded[msg.sender], "Not shielded");
        require(!hasPendingUnshield[msg.sender], "Already pending");

        uint256 ctHash = uint256(euint32.unwrap(_shieldedScore[msg.sender]));
        ITaskManager(TASK_MGR).createDecryptTask(ctHash, msg.sender);

        hasPendingUnshield[msg.sender] = true;
        emit UnshieldRequested(msg.sender);
    }

    function finalizeUnshield() external {
        require(hasPendingUnshield[msg.sender], "No pending unshield");

        (uint32 result, bool decrypted) = FHE.getDecryptResultSafe(_shieldedScore[msg.sender]);
        require(decrypted, "Not yet decrypted, retry later");

        publicScore[msg.sender] = result;
        isShielded[msg.sender]  = false;
        hasPendingUnshield[msg.sender] = false;

        emit Unshielded(msg.sender, result);
    }

    function canFinalizeUnshield(address user) external view returns (bool) {
        if (!hasPendingUnshield[user]) return false;
        (, bool decrypted) = FHE.getDecryptResultSafe(_shieldedScore[user]);
        return decrypted;
    }

    function myScore() external view returns (euint32) {
        require(isShielded[msg.sender], "Not shielded");
        return _shieldedScore[msg.sender];
    }

    function meetsThreshold(address user) external view returns (bool) {
        return hasClaimed[user] && publicScore[user] >= INITIAL_SCORE && !isShielded[user];
    }

    function hasReputation(address user) external view returns (bool) {
        return hasClaimed[user];
    }
}
