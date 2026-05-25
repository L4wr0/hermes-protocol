// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "@fhenixprotocol/cofhe-contracts/FHE.sol";

/// @title EncryptedLeaderboardV2
/// @notice FHE leaderboard populated by AMM activity via oracle relayer.
/// @dev Lives on Arbitrum Sepolia (Fhenix CoFHE).
///      Authorized callers: bridge (initial init), oracle2 (AMM relay).
///      Volume + reputation stored encrypted (euint32).
///      publicRank stored plaintext for display.
contract EncryptedLeaderboardV2 {

    struct TraderStats {
        euint32 totalVolume;
        euint32 winCount;
        euint32 lossCount;
        euint32 reputation;
        uint32  publicRank;
        bool    hasStats;
    }

    // ─── State ──────────────────────────────────────────────────
    mapping(address => TraderStats) private _stats;
    address[] public traders;

    address public owner;
    mapping(address => bool) public authorized; // bridge + oracle relayers

    // ─── Events ─────────────────────────────────────────────────
    event TraderInitialized(address indexed trader, uint32 bridgedAmount);
    event TradeRecorded(address indexed trader, bool isWin);
    event LiquidityRecorded(address indexed trader, uint32 amount);
    event MarketCreated(address indexed creator, uint256 marketId);
    event RanksUpdated(uint256 traderCount);
    event AuthorizedSet(address indexed who, bool status);

    // ─── Auth ───────────────────────────────────────────────────
    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner");
        _;
    }

    modifier onlyAuth() {
        require(authorized[msg.sender] || msg.sender == owner, "Not authorized");
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    function setAuthorized(address who, bool status) external onlyOwner {
        authorized[who] = status;
        emit AuthorizedSet(who, status);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Zero owner");
        owner = newOwner;
    }

    // ─── Initialization (called by bridge after collateral claim) ─
    function initializeTrader(address trader, uint32 bridgedWei14) external onlyAuth {
        if (_stats[trader].hasStats) return; // idempotent

        // bridgedWei14 = collateral / 1e14 (so 0.1 ETH = 1e17 wei = 1000)
        // reputation initial = bridgedWei14 / 1e4 (so 1000 / 10000 = 0, fallback to 1)
        // Per simplicity: 1 reputation per 0.01 ETH bridged
        uint32 initRep = bridgedWei14 / 100;
        if (initRep == 0) initRep = 1;

        _stats[trader].totalVolume = FHE.asEuint32(0);
        _stats[trader].winCount    = FHE.asEuint32(0);
        _stats[trader].lossCount   = FHE.asEuint32(0);
        _stats[trader].reputation  = FHE.asEuint32(initRep);
        _stats[trader].publicRank  = uint32(traders.length + 1);
        _stats[trader].hasStats    = true;

        FHE.allow(_stats[trader].totalVolume, trader);
        FHE.allow(_stats[trader].winCount,    trader);
        FHE.allow(_stats[trader].lossCount,   trader);
        FHE.allow(_stats[trader].reputation,  trader);

        traders.push(trader);
        emit TraderInitialized(trader, bridgedWei14);
    }

    // ─── AMM activity recording (called by oracle2) ─────────────
    function recordTrade(address trader, uint32 volume, bool isWin) external onlyAuth {
        _ensureInit(trader);

        TraderStats storage s = _stats[trader];
        euint32 vEnc = FHE.asEuint32(volume);
        s.totalVolume = s.totalVolume.add(vEnc);

        euint32 one = FHE.asEuint32(1);
        if (isWin) {
            s.winCount = s.winCount.add(one);
            // +1 reputation per 1000 volume
            uint32 repGain = volume / 1000;
            if (repGain > 0) {
                s.reputation = s.reputation.add(FHE.asEuint32(repGain));
            }
        } else {
            s.lossCount = s.lossCount.add(one);
        }

        FHE.allow(s.totalVolume, trader);
        FHE.allow(s.winCount,    trader);
        FHE.allow(s.lossCount,   trader);
        FHE.allow(s.reputation,  trader);

        emit TradeRecorded(trader, isWin);
    }

    function recordLiquidity(address trader, uint32 amount) external onlyAuth {
        _ensureInit(trader);

        TraderStats storage s = _stats[trader];
        s.totalVolume = s.totalVolume.add(FHE.asEuint32(amount));
        // +1 reputation per 5000 liquidity (more weight than trades)
        uint32 repGain = amount / 5000;
        if (repGain > 0) {
            s.reputation = s.reputation.add(FHE.asEuint32(repGain));
        }
        FHE.allow(s.totalVolume, trader);
        FHE.allow(s.reputation,  trader);

        emit LiquidityRecorded(trader, amount);
    }

    function recordMarketCreation(address trader, uint256 marketId) external onlyAuth {
        _ensureInit(trader);

        TraderStats storage s = _stats[trader];
        // +10 reputation per market created
        s.reputation = s.reputation.add(FHE.asEuint32(10));
        FHE.allow(s.reputation, trader);

        emit MarketCreated(trader, marketId);
    }

    // ─── Manual rank refresh (anyone can call, gas-bounded by traders.length) ─
    function updateRanks() external {
        uint256 n = traders.length;
        require(n <= 500, "Too many traders, paginate"); // safety
        for (uint256 i = 0; i < n; i++) {
            _stats[traders[i]].publicRank = uint32(i + 1);
        }
        emit RanksUpdated(n);
    }

    // ─── Views ──────────────────────────────────────────────────
    function myRank() external view returns (uint32) {
        return _stats[msg.sender].publicRank;
    }

    function myStats()
        external
        view
        returns (euint32 volume, euint32 wins, euint32 losses, euint32 reputation)
    {
        require(_stats[msg.sender].hasStats, "No stats");
        TraderStats storage s = _stats[msg.sender];
        return (s.totalVolume, s.winCount, s.lossCount, s.reputation);
    }

    function totalTraders() external view returns (uint256) {
        return traders.length;
    }

    function meetsMinimum(address trader) external view returns (bool) {
        return _stats[trader].hasStats;
    }

    function getTraderAt(uint256 idx) external view returns (address) {
        return traders[idx];
    }

    // ─── Internal ───────────────────────────────────────────────
    function _ensureInit(address trader) internal {
        if (!_stats[trader].hasStats) {
            _stats[trader].totalVolume = FHE.asEuint32(0);
            _stats[trader].winCount    = FHE.asEuint32(0);
            _stats[trader].lossCount   = FHE.asEuint32(0);
            _stats[trader].reputation  = FHE.asEuint32(0);
            _stats[trader].publicRank  = uint32(traders.length + 1);
            _stats[trader].hasStats    = true;
            traders.push(trader);

            FHE.allow(_stats[trader].totalVolume, trader);
            FHE.allow(_stats[trader].winCount,    trader);
            FHE.allow(_stats[trader].lossCount,   trader);
            FHE.allow(_stats[trader].reputation,  trader);
        }
    }
}
