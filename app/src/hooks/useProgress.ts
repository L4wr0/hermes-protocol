// src/hooks/useProgress.ts
// Reads on-chain state to determine which steps the user has completed.
// Each step unlocks the next; this hook is the single source of truth.

import { useReadContract, useReadContracts } from 'wagmi';
import { ADDRESSES, riseTestnet, baseSepolia, arbitrumSepolia, MIN_BRIDGE_FOR_REPUTATION } from '@/lib/config';
import { HERMES_TOKEN_ABI, CONFIDENTIAL_VAULT_ABI, BRIDGE_ABI, REPUTATION_ABI } from '@/abis';

export function useProgress(address: `0x${string}` | undefined) {
  const enabled = !!address;

  const { data } = useReadContracts({
    contracts: [
      // Step 1: has HERMES tokens (claimed faucet at least once)
      {
        address: ADDRESSES.rise.hermesToken,
        abi: HERMES_TOKEN_ABI,
        functionName: 'balanceOf',
        args: [address!],
        chainId: riseTestnet.id,
      },
      // Step 2: has deposited in vault (any encrypted balance > 0)
      // We can't read the encrypted handle directly, fallback to totalDeposits + Deposited events.
      // For simplicity here we use the vault's totalDeposits as a proxy + assume any deposit counts.
      // Better UX: track locally after the user's deposit tx confirms.
      // For now we just rely on Step 3 enable being driven by the user's own action.
      // Step 3: collateral bridged
      {
        address: ADDRESSES.rise.bridge,
        abi: BRIDGE_ABI,
        functionName: 'collateral',
        args: [address!],
        chainId: riseTestnet.id,
      },
      // Step 4: has claimed reputation
      {
        address: ADDRESSES.arbitrum.reputation,
        abi: REPUTATION_ABI,
        functionName: 'hasClaimed',
        args: [address!],
        chainId: arbitrumSepolia.id,
      },
    ],
    query: { enabled, refetchInterval: 10_000 },
  });

  const hermesBalance     = data?.[0]?.result as bigint | undefined;
  const collateral        = data?.[1]?.result as bigint | undefined;
  const reputationClaimed = data?.[2]?.result as boolean | undefined;

  const step1Done = (hermesBalance ?? 0n) > 0n;
  // step2 (deposit) is best tracked client-side after the user's tx;
  // we expose a flag the components can flip after a successful deposit.
  // For now: step2 done if collateral exists on bridge OR the user
  // has at least one deposit event (relies on local state). We start with
  // a permissive default to keep flow unblocked once step 1 is done.
  const step2Done = (collateral ?? 0n) > 0n
    || (typeof window !== 'undefined' && localStorage.getItem(`hermes:depositDone:${address}`) === '1');
  const step3Done = (collateral ?? 0n) >= MIN_BRIDGE_FOR_REPUTATION;
  const step4Done = reputationClaimed ?? false;

  return { step1Done, step2Done, step3Done, step4Done, hermesBalance, collateral };
}
