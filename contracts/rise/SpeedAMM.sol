// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

interface IHermesTracker {
    function record(string calldata action, uint256 marketId, uint256 amount) external;
}

/// @title SpeedAMM
/// @notice Uniswap V2 style multi-pool AMM on RISE. Plaintext, no fees.
///         Pools require ETH on at least one side to be XP-eligible.
/// @dev token0 = address(0) means ETH (native). token1 = ERC20.
///      Activity is logged to HermesTracker on RISE; leaderboard XP is granted
///      by Oracle 2 (off-chain relayer) which listens to events here and calls
///      EncryptedLeaderboard on Arbitrum.
contract SpeedAMM {

    struct Pool {
        address token0;      // address(0) = ETH (native)
        address token1;      // must be ERC20
        uint256 reserve0;
        uint256 reserve1;
        uint256 totalShares;
        bool    active;
    }

    // ─── State ──────────────────────────────────────────────────
    mapping(uint256 => Pool) public pools;
    mapping(uint256 => mapping(address => uint256)) public shares; // poolId → user → LP shares
    mapping(bytes32 => uint256) public poolByTokens;               // hash(token0,token1) → poolId+1 (0 = none)
    uint256 public poolCount;

    address public tracker;     // HermesTracker on RISE (optional, for activity log)
    address public hermesToken; // canonical HERMES token on RISE

    uint256 public constant MINIMUM_LIQUIDITY = 1000;

    // ─── Events ─────────────────────────────────────────────────
    event PoolCreated(uint256 indexed poolId, address indexed token0, address indexed token1, address creator);
    event LiquidityAdded(uint256 indexed poolId, address indexed provider, uint256 amount0, uint256 amount1, uint256 sharesMinted);
    event LiquidityRemoved(uint256 indexed poolId, address indexed provider, uint256 amount0, uint256 amount1, uint256 sharesBurned);
    event Swap(uint256 indexed poolId, address indexed trader, uint256 amountIn, uint256 amountOut, bool zeroForOne);

    // ─── Constructor ────────────────────────────────────────────
    constructor(address _tracker, address _hermesToken) {
        tracker     = _tracker;
        hermesToken = _hermesToken;
    }

    // ─── Pool creation ──────────────────────────────────────────
    /// @notice Create a new pool. Requires ETH on at least one side for XP eligibility.
    /// @param token1 ERC20 token (token0 is always ETH on this AMM).
    function createPool(address token1) external returns (uint256 poolId) {
        require(token1 != address(0), "token1 cannot be ETH");
        bytes32 key = keccak256(abi.encode(address(0), token1));
        require(poolByTokens[key] == 0, "Pool exists");

        poolId = ++poolCount;
        pools[poolId] = Pool({
            token0: address(0),     // ETH
            token1: token1,
            reserve0: 0,
            reserve1: 0,
            totalShares: 0,
            active: true
        });
        poolByTokens[key] = poolId;

        emit PoolCreated(poolId, address(0), token1, msg.sender);

        if (tracker != address(0)) {
            try IHermesTracker(tracker).record("speed_market_created", poolId, 0) {} catch {}
        }
    }

    // ─── Add liquidity ──────────────────────────────────────────
    /// @notice Add liquidity. msg.value = ETH amount, amount1 = token1 amount.
    /// @dev On first add, ratio is set by the depositor. After that, must match the pool ratio.
    function addLiquidity(uint256 poolId, uint256 amount1Desired) external payable returns (uint256 sharesMinted) {
        Pool storage p = pools[poolId];
        require(p.active, "Pool inactive");
        require(msg.value > 0 && amount1Desired > 0, "Zero liquidity");

        uint256 amount0 = msg.value;
        uint256 amount1 = amount1Desired;

        if (p.totalShares == 0) {
            // First liquidity: set the ratio
            sharesMinted = _sqrt(amount0 * amount1);
            require(sharesMinted > MINIMUM_LIQUIDITY, "Insufficient initial liquidity");
            sharesMinted -= MINIMUM_LIQUIDITY; // permanently lock min liquidity
            p.totalShares = MINIMUM_LIQUIDITY; // locked to address(0)
        } else {
            // Subsequent: must respect ratio
            uint256 amount1Optimal = (amount0 * p.reserve1) / p.reserve0;
            if (amount1Optimal <= amount1Desired) {
                amount1 = amount1Optimal;
            } else {
                uint256 amount0Optimal = (amount1Desired * p.reserve0) / p.reserve1;
                require(amount0Optimal <= amount0, "Excess ETH");
                amount0 = amount0Optimal;
            }
            sharesMinted = (amount0 * p.totalShares) / p.reserve0;
        }

        // Pull tokens
        require(IERC20(p.token1).transferFrom(msg.sender, address(this), amount1), "Transfer1 failed");
        // Refund excess ETH if any
        if (amount0 < msg.value) {
            (bool ok, ) = msg.sender.call{value: msg.value - amount0}("");
            require(ok, "Refund failed");
        }

        // Update
        p.reserve0     += amount0;
        p.reserve1     += amount1;
        p.totalShares  += sharesMinted;
        shares[poolId][msg.sender] += sharesMinted;

        emit LiquidityAdded(poolId, msg.sender, amount0, amount1, sharesMinted);

        if (tracker != address(0)) {
            try IHermesTracker(tracker).record("speed_liquidity_added", poolId, amount0) {} catch {}
        }
    }

    // ─── Remove liquidity ───────────────────────────────────────
    function removeLiquidity(uint256 poolId, uint256 sharesAmount) external returns (uint256 amount0, uint256 amount1) {
        Pool storage p = pools[poolId];
        require(p.active, "Pool inactive");
        require(shares[poolId][msg.sender] >= sharesAmount, "Insufficient shares");
        require(sharesAmount > 0, "Zero shares");

        amount0 = (sharesAmount * p.reserve0) / p.totalShares;
        amount1 = (sharesAmount * p.reserve1) / p.totalShares;
        require(amount0 > 0 && amount1 > 0, "Insufficient amounts");

        shares[poolId][msg.sender] -= sharesAmount;
        p.totalShares -= sharesAmount;
        p.reserve0    -= amount0;
        p.reserve1    -= amount1;

        // Send ETH
        (bool ok, ) = msg.sender.call{value: amount0}("");
        require(ok, "ETH send failed");
        // Send token1
        require(IERC20(p.token1).transfer(msg.sender, amount1), "Transfer1 failed");

        emit LiquidityRemoved(poolId, msg.sender, amount0, amount1, sharesAmount);
    }

    // ─── Swap ───────────────────────────────────────────────────
    /// @notice Swap on a pool. zeroForOne=true → ETH→token1. false → token1→ETH.
    /// @dev x*y=k constant product, no fees.
    function swap(uint256 poolId, uint256 amountIn, bool zeroForOne, uint256 minAmountOut)
        external
        payable
        returns (uint256 amountOut)
    {
        Pool storage p = pools[poolId];
        require(p.active, "Pool inactive");
        require(amountIn > 0, "Zero amountIn");

        if (zeroForOne) {
            // ETH → token1
            require(msg.value == amountIn, "ETH mismatch");
            amountOut = _getAmountOut(amountIn, p.reserve0, p.reserve1);
            require(amountOut >= minAmountOut, "Slippage");
            p.reserve0 += amountIn;
            p.reserve1 -= amountOut;
            require(IERC20(p.token1).transfer(msg.sender, amountOut), "Transfer1 failed");
        } else {
            // token1 → ETH
            require(msg.value == 0, "No ETH expected");
            require(IERC20(p.token1).transferFrom(msg.sender, address(this), amountIn), "Transfer1 failed");
            amountOut = _getAmountOut(amountIn, p.reserve1, p.reserve0);
            require(amountOut >= minAmountOut, "Slippage");
            p.reserve1 += amountIn;
            p.reserve0 -= amountOut;
            (bool ok, ) = msg.sender.call{value: amountOut}("");
            require(ok, "ETH send failed");
        }

        emit Swap(poolId, msg.sender, amountIn, amountOut, zeroForOne);

        if (tracker != address(0)) {
            uint256 ethVolume = zeroForOne ? amountIn : amountOut;
            try IHermesTracker(tracker).record("speed_swap", poolId, ethVolume) {} catch {}
        }
    }

    // ─── Views ──────────────────────────────────────────────────
    function getReserves(uint256 poolId) external view returns (uint256 reserve0, uint256 reserve1) {
        Pool storage p = pools[poolId];
        return (p.reserve0, p.reserve1);
    }

    function getPoolByToken(address token1) external view returns (uint256) {
        return poolByTokens[keccak256(abi.encode(address(0), token1))];
    }

    function quoteSwap(uint256 poolId, uint256 amountIn, bool zeroForOne) external view returns (uint256) {
        Pool storage p = pools[poolId];
        if (zeroForOne) return _getAmountOut(amountIn, p.reserve0, p.reserve1);
        else            return _getAmountOut(amountIn, p.reserve1, p.reserve0);
    }

    // ─── Internal ───────────────────────────────────────────────
    function _getAmountOut(uint256 amountIn, uint256 reserveIn, uint256 reserveOut)
        internal pure returns (uint256)
    {
        require(amountIn > 0, "Zero amountIn");
        require(reserveIn > 0 && reserveOut > 0, "Zero reserves");
        // Uniswap V2 formula, NO FEES
        // amountOut = (amountIn * reserveOut) / (reserveIn + amountIn)
        uint256 numerator   = amountIn * reserveOut;
        uint256 denominator = reserveIn + amountIn;
        return numerator / denominator;
    }

    function _sqrt(uint256 y) internal pure returns (uint256 z) {
        if (y > 3) {
            z = y;
            uint256 x = y / 2 + 1;
            while (x < z) {
                z = x;
                x = (y / x + x) / 2;
            }
        } else if (y != 0) {
            z = 1;
        }
    }
}
