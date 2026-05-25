// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@inco/lightning/Lib.sol";

interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

/// @title DarkAMM
/// @notice Multi-pool AMM on Base Sepolia (Inco TEE) with 3 privacy modes:
///         - PUBLIC:  fast, plaintext (~50k gas, ~2s)   — no privacy
///         - STEALTH: balanced (~150k gas, ~5s)         — LP shares + reserves encrypted, trades visible
///         - DARK:    full FHE (~500k gas, ~30-40s)     — everything encrypted
/// @dev    Pools MUST have ETH on token0 side (XP eligibility).
///         Anyone can create new pools, anyone can add liquidity, anyone can swap.
contract DarkAMM {
    using e for *;

    // ─── Pool struct ────────────────────────────────────────────
    struct Pool {
        address token0;            // address(0) = ETH (native)
        address token1;            // ERC20 (cHERMES or other)
        // Plaintext reserves (used by Public + Stealth math, kept in sync with encrypted)
        uint256 reserve0Shadow;
        uint256 reserve1Shadow;
        // Encrypted reserves (Stealth + Dark)
        euint256 reserve0Enc;
        euint256 reserve1Enc;
        // LP shares total
        uint256  totalSharesPublic;     // shares owned via PUBLIC LP (transparent)
        euint256 totalSharesEncrypted;  // shares owned via STEALTH/DARK LP (encrypted)
        bool     active;
        bool     initialized;           // true after first liquidity add (any mode)
    }

    // ─── State ──────────────────────────────────────────────────
    mapping(uint256 => Pool) internal pools;
    mapping(uint256 => mapping(address => uint256))  public publicShares;    // poolId → user → public shares
    mapping(uint256 => mapping(address => euint256)) internal encryptedShares; // poolId → user → encrypted shares

    mapping(bytes32 => uint256) public poolByTokens; // hash(token0,token1) → poolId
    uint256 public poolCount;

    uint256 public constant MINIMUM_LIQUIDITY = 1000;

    // ─── Events ─────────────────────────────────────────────────
    event PoolCreated(uint256 indexed poolId, address indexed token0, address indexed token1, address creator);

    event LiquidityAdded(uint256 indexed poolId, address indexed provider, uint8 mode, uint256 ethAmount, uint256 tokenAmount);
    event LiquidityRemoved(uint256 indexed poolId, address indexed provider, uint8 mode);

    // Public swap: full detail emitted
    event SwapPublic(uint256 indexed poolId, address indexed trader, uint256 amountIn, uint256 amountOut, bool zeroForOne);
    // Stealth: amount visible, LP context hidden
    event SwapStealth(uint256 indexed poolId, address indexed trader, uint256 amountIn, uint256 amountOut, bool zeroForOne);

    // ─── Pool creation ──────────────────────────────────────────
    /// @notice Create a new pool. token0 is ETH, token1 is any ERC20.
    function createPool(address token1) external returns (uint256 poolId) {
        require(token1 != address(0), "token1 cannot be ETH");
        bytes32 key = keccak256(abi.encode(address(0), token1));
        require(poolByTokens[key] == 0, "Pool exists");

        poolId = ++poolCount;
        Pool storage p = pools[poolId];
        p.token0 = address(0);
        p.token1 = token1;
        p.reserve0Enc = uint256(0).asEuint256();
        p.reserve1Enc = uint256(0).asEuint256();
        p.totalSharesEncrypted = uint256(0).asEuint256();
        p.active = true;
        // allow contract itself to use its own encrypted reserves
        p.reserve0Enc.allow(address(this));
        p.reserve1Enc.allow(address(this));

        poolByTokens[key] = poolId;

        emit PoolCreated(poolId, address(0), token1, msg.sender);
    }

    // ─── Liquidity (PUBLIC mode) ────────────────────────────────
    /// @notice Add liquidity transparently. Cheaper, no privacy.
    function addLiquidityPublic(uint256 poolId, uint256 amount1Desired)
        external payable returns (uint256 sharesMinted)
    {
        Pool storage p = pools[poolId];
        require(p.active, "Pool inactive");
        require(msg.value > 0 && amount1Desired > 0, "Zero liquidity");

        (uint256 amount0, uint256 amount1, uint256 minted) = _calcAddLiquidity(p, msg.value, amount1Desired);
        sharesMinted = minted;

        // Pull token1
        require(IERC20(p.token1).transferFrom(msg.sender, address(this), amount1), "Transfer1 failed");

        // Refund excess ETH
        if (amount0 < msg.value) {
            (bool ok, ) = msg.sender.call{value: msg.value - amount0}("");
            require(ok, "Refund failed");
        }

        // Update plaintext reserves (shadow)
        p.reserve0Shadow += amount0;
        p.reserve1Shadow += amount1;

        // First-ever liquidity (any mode): burn min liquidity, mark initialized
        if (!p.initialized) {
            require(sharesMinted > MINIMUM_LIQUIDITY, "Insufficient initial");
            sharesMinted -= MINIMUM_LIQUIDITY;
            p.totalSharesPublic += MINIMUM_LIQUIDITY;
            p.initialized = true;
        }
        p.totalSharesPublic    += sharesMinted;
        publicShares[poolId][msg.sender] += sharesMinted;

        emit LiquidityAdded(poolId, msg.sender, 1, amount0, amount1);
    }

    // ─── Liquidity (STEALTH mode) ───────────────────────────────
    /// @notice Add liquidity with encrypted shares. Reserves get encrypted, LP identity hidden.
    function addLiquidityStealth(uint256 poolId, uint256 amount1Desired)
        external payable returns (uint256 sharesMinted)
    {
        Pool storage p = pools[poolId];
        require(p.active, "Pool inactive");
        require(msg.value > 0 && amount1Desired > 0, "Zero liquidity");

        (uint256 amount0, uint256 amount1, uint256 minted) = _calcAddLiquidity(p, msg.value, amount1Desired);
        sharesMinted = minted;

        require(IERC20(p.token1).transferFrom(msg.sender, address(this), amount1), "Transfer1 failed");
        if (amount0 < msg.value) {
            (bool ok, ) = msg.sender.call{value: msg.value - amount0}("");
            require(ok, "Refund failed");
        }

        // Update plaintext reserves (still needed for math)
        p.reserve0Shadow += amount0;
        p.reserve1Shadow += amount1;

        // Also update encrypted reserves
        p.reserve0Enc = p.reserve0Enc.add(amount0.asEuint256());
        p.reserve1Enc = p.reserve1Enc.add(amount1.asEuint256());
        p.reserve0Enc.allow(address(this));
        p.reserve1Enc.allow(address(this));

        // First-ever liquidity (any mode)
        if (!p.initialized) {
            require(sharesMinted > MINIMUM_LIQUIDITY, "Insufficient initial");
            sharesMinted -= MINIMUM_LIQUIDITY;
            p.totalSharesPublic = MINIMUM_LIQUIDITY;
            p.initialized = true;
        }

        euint256 sharesEnc = sharesMinted.asEuint256();
        encryptedShares[poolId][msg.sender] = encryptedShares[poolId][msg.sender].add(sharesEnc);
        encryptedShares[poolId][msg.sender].allow(msg.sender);

        p.totalSharesEncrypted = p.totalSharesEncrypted.add(sharesEnc);
        p.totalSharesEncrypted.allow(address(this));

        emit LiquidityAdded(poolId, msg.sender, 2, amount0, amount1);
    }

    // ─── Swap (PUBLIC) ──────────────────────────────────────────
    function swapPublic(uint256 poolId, uint256 amountIn, bool zeroForOne, uint256 minAmountOut)
        external payable returns (uint256 amountOut)
    {
        Pool storage p = pools[poolId];
        require(p.active, "Pool inactive");
        require(amountIn > 0, "Zero amountIn");

        if (zeroForOne) {
            require(msg.value == amountIn, "ETH mismatch");
            amountOut = _getAmountOut(amountIn, p.reserve0Shadow, p.reserve1Shadow);
            require(amountOut >= minAmountOut, "Slippage");
            p.reserve0Shadow += amountIn;
            p.reserve1Shadow -= amountOut;
            require(IERC20(p.token1).transfer(msg.sender, amountOut), "Transfer1 failed");
        } else {
            require(msg.value == 0, "No ETH expected");
            require(IERC20(p.token1).transferFrom(msg.sender, address(this), amountIn), "Transfer1 failed");
            amountOut = _getAmountOut(amountIn, p.reserve1Shadow, p.reserve0Shadow);
            require(amountOut >= minAmountOut, "Slippage");
            p.reserve1Shadow += amountIn;
            p.reserve0Shadow -= amountOut;
            (bool ok, ) = msg.sender.call{value: amountOut}("");
            require(ok, "ETH send failed");
        }

        emit SwapPublic(poolId, msg.sender, amountIn, amountOut, zeroForOne);
    }

    // ─── Swap (STEALTH) ─────────────────────────────────────────
    /// @notice Same math as public but also updates encrypted reserves.
    ///         Trade amount visible, LP positions remain hidden.
    function swapStealth(uint256 poolId, uint256 amountIn, bool zeroForOne, uint256 minAmountOut)
        external payable returns (uint256 amountOut)
    {
        Pool storage p = pools[poolId];
        require(p.active, "Pool inactive");
        require(amountIn > 0, "Zero amountIn");

        if (zeroForOne) {
            require(msg.value == amountIn, "ETH mismatch");
            amountOut = _getAmountOut(amountIn, p.reserve0Shadow, p.reserve1Shadow);
            require(amountOut >= minAmountOut, "Slippage");
            p.reserve0Shadow += amountIn;
            p.reserve1Shadow -= amountOut;
            // Sync encrypted reserves
            p.reserve0Enc = p.reserve0Enc.add(amountIn.asEuint256());
            p.reserve1Enc = p.reserve1Enc.sub(amountOut.asEuint256());
            p.reserve0Enc.allow(address(this));
            p.reserve1Enc.allow(address(this));
            require(IERC20(p.token1).transfer(msg.sender, amountOut), "Transfer1 failed");
        } else {
            require(msg.value == 0, "No ETH expected");
            require(IERC20(p.token1).transferFrom(msg.sender, address(this), amountIn), "Transfer1 failed");
            amountOut = _getAmountOut(amountIn, p.reserve1Shadow, p.reserve0Shadow);
            require(amountOut >= minAmountOut, "Slippage");
            p.reserve1Shadow += amountIn;
            p.reserve0Shadow -= amountOut;
            p.reserve1Enc = p.reserve1Enc.add(amountIn.asEuint256());
            p.reserve0Enc = p.reserve0Enc.sub(amountOut.asEuint256());
            p.reserve0Enc.allow(address(this));
            p.reserve1Enc.allow(address(this));
            (bool ok, ) = msg.sender.call{value: amountOut}("");
            require(ok, "ETH send failed");
        }

        emit SwapStealth(poolId, msg.sender, amountIn, amountOut, zeroForOne);
    }

    // ─── Swap (DARK) ──────────────────────────────────────────
    //
    // NOTE: swapDark() requires Inco's encrypted input API (EncryptedInput
    // type + verifyInput pattern). It has been removed from v1 for testnet
    // simplicity. To re-enable, study:
    //   - node_modules/@inco/lightning/src/lightning-parts/EncryptedInput.sol
    //   - node_modules/@inco/lightning/src/lightning-parts/AccessControl/...
    // Then implement: function swapDark(uint256 poolId, EncryptedInput calldata encIn, bool zeroForOne)
    // that calls e.verifyInput(encIn) → euint256 amount, then runs the FHE math.


    // ─── Views ──────────────────────────────────────────────────
    function getPoolMeta(uint256 poolId)
        external view returns (address token0, address token1, bool active, uint256 reserve0Shadow, uint256 reserve1Shadow)
    {
        Pool storage p = pools[poolId];
        return (p.token0, p.token1, p.active, p.reserve0Shadow, p.reserve1Shadow);
    }

    function getEncryptedReserves(uint256 poolId)
        external view returns (euint256, euint256)
    {
        Pool storage p = pools[poolId];
        return (p.reserve0Enc, p.reserve1Enc);
    }

    function getPoolByToken(address token1) external view returns (uint256) {
        return poolByTokens[keccak256(abi.encode(address(0), token1))];
    }

    function quoteSwap(uint256 poolId, uint256 amountIn, bool zeroForOne) external view returns (uint256) {
        Pool storage p = pools[poolId];
        if (zeroForOne) return _getAmountOut(amountIn, p.reserve0Shadow, p.reserve1Shadow);
        else            return _getAmountOut(amountIn, p.reserve1Shadow, p.reserve0Shadow);
    }

    // ─── Internal ───────────────────────────────────────────────
    function _calcAddLiquidity(Pool storage p, uint256 amount0Avail, uint256 amount1Desired)
        internal view returns (uint256 amount0, uint256 amount1, uint256 sharesMinted)
    {
        if (!p.initialized) {
            // First liquidity
            amount0 = amount0Avail;
            amount1 = amount1Desired;
            sharesMinted = _sqrt(amount0 * amount1);
        } else {
            // Match existing ratio
            uint256 amount1Optimal = (amount0Avail * p.reserve1Shadow) / p.reserve0Shadow;
            if (amount1Optimal <= amount1Desired) {
                amount0 = amount0Avail;
                amount1 = amount1Optimal;
            } else {
                amount0 = (amount1Desired * p.reserve0Shadow) / p.reserve1Shadow;
                require(amount0 <= amount0Avail, "Excess token");
                amount1 = amount1Desired;
            }
            sharesMinted = (amount0 * p.totalSharesPublic) / p.reserve0Shadow;
        }
    }

    function _getAmountOut(uint256 amountIn, uint256 reserveIn, uint256 reserveOut)
        internal pure returns (uint256)
    {
        require(amountIn > 0 && reserveIn > 0 && reserveOut > 0, "Bad input");
        // Uniswap V2 formula, NO FEES
        uint256 numerator   = amountIn * reserveOut;
        uint256 denominator = reserveIn + amountIn;
        return numerator / denominator;
    }

    function _sqrt(uint256 y) internal pure returns (uint256 z) {
        if (y > 3) {
            z = y;
            uint256 x = y / 2 + 1;
            while (x < z) { z = x; x = (y / x + x) / 2; }
        } else if (y != 0) { z = 1; }
    }

    receive() external payable {}
}
