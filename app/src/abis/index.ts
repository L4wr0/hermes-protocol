// src/abis/index.ts
// Hand-curated minimal ABIs for the frontend (only what we call).

export const HERMES_TOKEN_ABI = [
  { type: 'function', name: 'balanceOf', stateMutability: 'view',
    inputs: [{ type: 'address' }], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'approve', stateMutability: 'nonpayable',
    inputs: [{ type: 'address' }, { type: 'uint256' }], outputs: [{ type: 'bool' }] },
  { type: 'function', name: 'transfer', stateMutability: 'nonpayable',
    inputs: [{ type: 'address' }, { type: 'uint256' }], outputs: [{ type: 'bool' }] },
] as const;

export const HERMES_FAUCET_ABI = [
  { type: 'function', name: 'claim',          stateMutability: 'nonpayable', inputs: [], outputs: [] },
  { type: 'function', name: 'canClaim',       stateMutability: 'view',
    inputs: [{ type: 'address' }], outputs: [{ type: 'bool' }] },
  { type: 'function', name: 'nextClaimTime',  stateMutability: 'view',
    inputs: [{ type: 'address' }], outputs: [{ type: 'uint256' }] },
] as const;

export const CONFIDENTIAL_VAULT_ABI = [
  { type: 'function', name: 'deposit',           stateMutability: 'payable', inputs: [], outputs: [] },
  { type: 'function', name: 'withdraw',          stateMutability: 'nonpayable',
    inputs: [{ type: 'uint256' }], outputs: [] },
  { type: 'function', name: 'darkBridgeToRise',  stateMutability: 'nonpayable',
    inputs: [{ type: 'uint256' }], outputs: [] },
  { type: 'function', name: 'myBalance',         stateMutability: 'view',
    inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'myLockedAmount',    stateMutability: 'view',
    inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'bridgeNonce',       stateMutability: 'view',
    inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'totalDeposits',     stateMutability: 'view',
    inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'event', name: 'Deposited',
    inputs: [{ indexed: true, type: 'address' }, { type: 'uint256' }] },
  { type: 'event', name: 'DarkBridgeRequested',
    inputs: [{ indexed: true, type: 'address' }, { type: 'uint256' }, { type: 'uint256' }] },
] as const;

export const BRIDGE_ABI = [
  { type: 'function', name: 'claimFromInco', stateMutability: 'nonpayable',
    inputs: [{ type: 'uint128' }, { type: 'uint256' }, { type: 'bytes' }], outputs: [] },
  { type: 'function', name: 'fund', stateMutability: 'payable', inputs: [], outputs: [] },
  { type: 'function', name: 'collateral', stateMutability: 'view',
    inputs: [{ type: 'address' }], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'hasCollateral', stateMutability: 'view',
    inputs: [{ type: 'address' }, { type: 'uint256' }], outputs: [{ type: 'bool' }] },
  { type: 'function', name: 'getReputationPoints', stateMutability: 'view',
    inputs: [{ type: 'address' }], outputs: [{ type: 'uint32' }] },
  { type: 'event', name: 'CollateralBridged',
    inputs: [{ indexed: true, type: 'address' }, { type: 'uint256' }, { type: 'uint256' }] },
] as const;

export const REPUTATION_ABI = [
  { type: 'function', name: 'claimScore',          stateMutability: 'nonpayable', inputs: [], outputs: [] },
  { type: 'function', name: 'shield',              stateMutability: 'nonpayable', inputs: [], outputs: [] },
  { type: 'function', name: 'requestUnshield',     stateMutability: 'nonpayable', inputs: [], outputs: [] },
  { type: 'function', name: 'finalizeUnshield',    stateMutability: 'nonpayable', inputs: [], outputs: [] },
  { type: 'function', name: 'canFinalizeUnshield', stateMutability: 'view',
    inputs: [{ type: 'address' }], outputs: [{ type: 'bool' }] },
  { type: 'function', name: 'publicScore',         stateMutability: 'view',
    inputs: [{ type: 'address' }], outputs: [{ type: 'uint32' }] },
  { type: 'function', name: 'hasClaimed',          stateMutability: 'view',
    inputs: [{ type: 'address' }], outputs: [{ type: 'bool' }] },
  { type: 'function', name: 'isShielded',          stateMutability: 'view',
    inputs: [{ type: 'address' }], outputs: [{ type: 'bool' }] },
  { type: 'function', name: 'hasPendingUnshield',  stateMutability: 'view',
    inputs: [{ type: 'address' }], outputs: [{ type: 'bool' }] },
  { type: 'function', name: 'meetsThreshold',      stateMutability: 'view',
    inputs: [{ type: 'address' }], outputs: [{ type: 'bool' }] },
] as const;

export const LEADERBOARD_ABI = [
  { type: 'function', name: 'myRank', stateMutability: 'view',
    inputs: [], outputs: [{ type: 'uint32' }] },
  { type: 'function', name: 'myStats', stateMutability: 'view',
    inputs: [], outputs: [
      { type: 'bytes32' }, { type: 'bytes32' }, { type: 'bytes32' }, { type: 'bytes32' }
    ] },
  { type: 'function', name: 'totalTraders', stateMutability: 'view',
    inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'getTraderAt', stateMutability: 'view',
    inputs: [{ type: 'uint256' }], outputs: [{ type: 'address' }] },
  { type: 'function', name: 'meetsMinimum', stateMutability: 'view',
    inputs: [{ type: 'address' }], outputs: [{ type: 'bool' }] },
] as const;

export const DARK_AMM_ABI = [
  { type: 'function', name: 'createPool', stateMutability: 'nonpayable',
    inputs: [{ type: 'address' }], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'addLiquidityPublic', stateMutability: 'payable',
    inputs: [{ type: 'uint256' }, { type: 'uint256' }], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'addLiquidityStealth', stateMutability: 'payable',
    inputs: [{ type: 'uint256' }, { type: 'uint256' }], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'swapPublic', stateMutability: 'payable',
    inputs: [{ type: 'uint256' }, { type: 'uint256' }, { type: 'bool' }, { type: 'uint256' }],
    outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'swapStealth', stateMutability: 'payable',
    inputs: [{ type: 'uint256' }, { type: 'uint256' }, { type: 'bool' }, { type: 'uint256' }],
    outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'quoteSwap', stateMutability: 'view',
    inputs: [{ type: 'uint256' }, { type: 'uint256' }, { type: 'bool' }],
    outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'getPoolMeta', stateMutability: 'view',
    inputs: [{ type: 'uint256' }], outputs: [
      { type: 'address' }, { type: 'address' }, { type: 'bool' },
      { type: 'uint256' }, { type: 'uint256' }
    ] },
  { type: 'function', name: 'getPoolByToken', stateMutability: 'view',
    inputs: [{ type: 'address' }], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'poolCount', stateMutability: 'view',
    inputs: [], outputs: [{ type: 'uint256' }] },
] as const;

export const SPEED_AMM_ABI = [
  { type: 'function', name: 'createPool', stateMutability: 'nonpayable',
    inputs: [{ type: 'address' }], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'addLiquidity', stateMutability: 'payable',
    inputs: [{ type: 'uint256' }, { type: 'uint256' }], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'removeLiquidity', stateMutability: 'nonpayable',
    inputs: [{ type: 'uint256' }, { type: 'uint256' }],
    outputs: [{ type: 'uint256' }, { type: 'uint256' }] },
  { type: 'function', name: 'swap', stateMutability: 'payable',
    inputs: [{ type: 'uint256' }, { type: 'uint256' }, { type: 'bool' }, { type: 'uint256' }],
    outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'quoteSwap', stateMutability: 'view',
    inputs: [{ type: 'uint256' }, { type: 'uint256' }, { type: 'bool' }],
    outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'getReserves', stateMutability: 'view',
    inputs: [{ type: 'uint256' }],
    outputs: [{ type: 'uint256' }, { type: 'uint256' }] },
  { type: 'function', name: 'getPoolByToken', stateMutability: 'view',
    inputs: [{ type: 'address' }], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'poolCount', stateMutability: 'view',
    inputs: [], outputs: [{ type: 'uint256' }] },
] as const;
