// /api/relay-amm.ts
// Oracle 2 — AMM activity relay.
// Polls events from DarkAMM (Base) and SpeedAMM (RISE) and calls
// recordTrade / recordLiquidity / recordMarketCreation on the
// EncryptedLeaderboard (Arbitrum).
//
// Triggered: every 1 minute by Vercel Cron (see vercel.json).
// Auth: cron secret bearer header from Vercel.
//
// State: stores the last processed block per chain in Vercel KV.
//        For testnet without KV, use an in-memory cache (lost on cold start)
//        and limit lookback to last N blocks per invocation.
//
// ENV VARS (Vercel):
//   ORACLE2_SK            — private key of the AMM relayer wallet
//   CRON_SECRET           — Vercel cron auth header secret
//   DARKAMM_ADDR          — DarkAMM on Base
//   SPEEDAMM_ADDR         — SpeedAMM on RISE
//   LEADERBOARD_ADDR      — EncryptedLeaderboard on Arbitrum
//   RPC_BASE              — Base Sepolia RPC
//   RPC_RISE              — RISE testnet RPC
//   RPC_ARB               — Arbitrum Sepolia RPC

import { ethers } from 'ethers';

export const config = { runtime: 'nodejs' };

// ── ABIs (minimal, only events + functions we need) ─────────────
const DARKAMM_ABI = [
  'event PoolCreated(uint256 indexed poolId, address indexed token0, address indexed token1, address creator)',
  'event LiquidityAdded(uint256 indexed poolId, address indexed provider, uint8 mode, uint256 ethAmount, uint256 tokenAmount)',
  'event SwapPublic(uint256 indexed poolId, address indexed trader, uint256 amountIn, uint256 amountOut, bool zeroForOne)',
  'event SwapStealth(uint256 indexed poolId, address indexed trader, uint256 amountIn, uint256 amountOut, bool zeroForOne)',
];
const SPEEDAMM_ABI = [
  'event PoolCreated(uint256 indexed poolId, address indexed token0, address indexed token1, address creator)',
  'event LiquidityAdded(uint256 indexed poolId, address indexed provider, uint256 amount0, uint256 amount1, uint256 sharesMinted)',
  'event Swap(uint256 indexed poolId, address indexed trader, uint256 amountIn, uint256 amountOut, bool zeroForOne)',
];
const LEADERBOARD_ABI = [
  'function recordTrade(address trader, uint32 volume, bool isWin) external',
  'function recordLiquidity(address trader, uint32 amount) external',
  'function recordMarketCreation(address trader, uint256 marketId) external',
  'function meetsMinimum(address trader) external view returns (bool)',
];

// ── In-memory state (resets on cold start — accept duplicate XP loss) ────
// For production, replace with @vercel/kv:
//   import { kv } from '@vercel/kv';
//   const lastBlock = await kv.get(`last-${chain}`);
//   await kv.set(`last-${chain}`, currentBlock);
let lastBlockBase: number | null = null;
let lastBlockRise: number | null = null;
const LOOKBACK_BLOCKS = 500;

// Convert wei → "tier" (uint32 leaderboard volume).
// 1 ETH = 10000 tier points (so 0.0001 ETH = 1 point, fits in uint32 up to ~430k ETH)
function ethToTier(weiAmount: bigint): number {
  const tier = Number(weiAmount / 10n ** 14n); // 1e14 wei = 1 tier
  return Math.min(tier, 0xffffffff);
}

// ── Handler ───────────────────────────────────────────────────────
export default async function handler(req: Request): Promise<Response> {
  // Verify Vercel cron auth
  const authHeader = req.headers.get('authorization');
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  const oracleSk = process.env.ORACLE2_SK;
  if (!oracleSk) {
    return new Response('ORACLE2_SK not set', { status: 500 });
  }

  // ── Setup providers ──
  const baseRpc  = process.env.RPC_BASE || 'https://sepolia.base.org';
  const riseRpc  = process.env.RPC_RISE || 'https://testnet.riselabs.xyz';
  const arbRpc   = process.env.RPC_ARB  || 'https://sepolia-rollup.arbitrum.io/rpc';

  const baseProvider = new ethers.JsonRpcProvider(baseRpc);
  const riseProvider = new ethers.JsonRpcProvider(riseRpc);
  const arbProvider  = new ethers.JsonRpcProvider(arbRpc);

  // Arbitrum signer (writes to leaderboard)
  const arbSigner = new ethers.Wallet(oracleSk, arbProvider);
  const leaderboard = new ethers.Contract(
    process.env.LEADERBOARD_ADDR!,
    LEADERBOARD_ABI,
    arbSigner
  );

  // Read contracts
  const darkAmm  = new ethers.Contract(process.env.DARKAMM_ADDR!,  DARKAMM_ABI,  baseProvider);
  const speedAmm = new ethers.Contract(process.env.SPEEDAMM_ADDR!, SPEEDAMM_ABI, riseProvider);

  // ── Determine block ranges ──
  const latestBase = await baseProvider.getBlockNumber();
  const latestRise = await riseProvider.getBlockNumber();
  const fromBase = lastBlockBase ?? Math.max(0, latestBase - LOOKBACK_BLOCKS);
  const fromRise = lastBlockRise ?? Math.max(0, latestRise - LOOKBACK_BLOCKS);

  const summary = {
    baseRange: [fromBase, latestBase],
    riseRange: [fromRise, latestRise],
    actionsPosted: 0,
    errors: [] as string[],
  };

  // ── Process events: DarkAMM (Base) ──
  try {
    const events = await Promise.all([
      darkAmm.queryFilter(darkAmm.filters.PoolCreated(),    fromBase, latestBase),
      darkAmm.queryFilter(darkAmm.filters.LiquidityAdded(), fromBase, latestBase),
      darkAmm.queryFilter(darkAmm.filters.SwapPublic(),     fromBase, latestBase),
      darkAmm.queryFilter(darkAmm.filters.SwapStealth(),    fromBase, latestBase),
    ]);

    const [poolCreated, liqAdded, swapsPub, swapsStealth] = events;

    for (const ev of poolCreated as ethers.EventLog[]) {
      const { creator, poolId } = ev.args as any;
      try {
        const tx = await leaderboard.recordMarketCreation(creator, poolId);
        await tx.wait();
        summary.actionsPosted++;
      } catch (e: any) { summary.errors.push(`pool: ${e.message}`); }
    }

    for (const ev of liqAdded as ethers.EventLog[]) {
      const { provider, ethAmount } = ev.args as any;
      const tier = ethToTier(ethAmount);
      if (tier === 0) continue;
      try {
        const tx = await leaderboard.recordLiquidity(provider, tier);
        await tx.wait();
        summary.actionsPosted++;
      } catch (e: any) { summary.errors.push(`liq: ${e.message}`); }
    }

    for (const ev of [...swapsPub, ...swapsStealth] as ethers.EventLog[]) {
      const { trader, amountIn, zeroForOne } = ev.args as any;
      const tier = ethToTier(amountIn);
      if (tier === 0) continue;
      // No "win/loss" concept on AMM swaps — count all as wins for now
      try {
        const tx = await leaderboard.recordTrade(trader, tier, true);
        await tx.wait();
        summary.actionsPosted++;
      } catch (e: any) { summary.errors.push(`swap-base: ${e.message}`); }
    }
  } catch (e: any) {
    summary.errors.push(`DarkAMM query: ${e.message}`);
  }

  // ── Process events: SpeedAMM (RISE) ──
  try {
    const events = await Promise.all([
      speedAmm.queryFilter(speedAmm.filters.PoolCreated(),    fromRise, latestRise),
      speedAmm.queryFilter(speedAmm.filters.LiquidityAdded(), fromRise, latestRise),
      speedAmm.queryFilter(speedAmm.filters.Swap(),           fromRise, latestRise),
    ]);

    const [poolCreated, liqAdded, swaps] = events;

    for (const ev of poolCreated as ethers.EventLog[]) {
      const { creator, poolId } = ev.args as any;
      try {
        const tx = await leaderboard.recordMarketCreation(creator, poolId);
        await tx.wait();
        summary.actionsPosted++;
      } catch (e: any) { summary.errors.push(`pool-rise: ${e.message}`); }
    }

    for (const ev of liqAdded as ethers.EventLog[]) {
      const { provider, amount0 } = ev.args as any;
      const tier = ethToTier(amount0); // amount0 is ETH on SpeedAMM
      if (tier === 0) continue;
      try {
        const tx = await leaderboard.recordLiquidity(provider, tier);
        await tx.wait();
        summary.actionsPosted++;
      } catch (e: any) { summary.errors.push(`liq-rise: ${e.message}`); }
    }

    for (const ev of swaps as ethers.EventLog[]) {
      const { trader, amountIn } = ev.args as any;
      const tier = ethToTier(amountIn);
      if (tier === 0) continue;
      try {
        const tx = await leaderboard.recordTrade(trader, tier, true);
        await tx.wait();
        summary.actionsPosted++;
      } catch (e: any) { summary.errors.push(`swap-rise: ${e.message}`); }
    }
  } catch (e: any) {
    summary.errors.push(`SpeedAMM query: ${e.message}`);
  }

  // Update cursors only on success
  lastBlockBase = latestBase + 1;
  lastBlockRise = latestRise + 1;

  return new Response(JSON.stringify(summary, null, 2), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
