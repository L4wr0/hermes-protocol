// src/components/Step4Reputation.tsx
'use client';

import { useState } from 'react';
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt,
         useChainId, useSwitchChain } from 'wagmi';
import { StepCard } from './StepCard';
import { Latency } from './LatencyMonitor';
import { ADDRESSES, arbitrumSepolia, EXPLORERS } from '@/lib/config';
import { REPUTATION_ABI } from '@/abis';

export function Step4Reputation({ unlocked, done }: { unlocked: boolean; done: boolean }) {
  const { address } = useAccount();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();

  const [status, setStatus] = useState<{ type: 'success' | 'error' | 'info'; msg: string } | null>(null);

  const reads = {
    hasClaimed: useReadContract({
      address: ADDRESSES.arbitrum.reputation, abi: REPUTATION_ABI, functionName: 'hasClaimed',
      args: address ? [address] : undefined, chainId: arbitrumSepolia.id,
      query: { enabled: !!address, refetchInterval: 5_000 },
    }),
    publicScore: useReadContract({
      address: ADDRESSES.arbitrum.reputation, abi: REPUTATION_ABI, functionName: 'publicScore',
      args: address ? [address] : undefined, chainId: arbitrumSepolia.id,
      query: { enabled: !!address, refetchInterval: 5_000 },
    }),
    isShielded: useReadContract({
      address: ADDRESSES.arbitrum.reputation, abi: REPUTATION_ABI, functionName: 'isShielded',
      args: address ? [address] : undefined, chainId: arbitrumSepolia.id,
      query: { enabled: !!address, refetchInterval: 5_000 },
    }),
    hasPending: useReadContract({
      address: ADDRESSES.arbitrum.reputation, abi: REPUTATION_ABI, functionName: 'hasPendingUnshield',
      args: address ? [address] : undefined, chainId: arbitrumSepolia.id,
      query: { enabled: !!address, refetchInterval: 5_000 },
    }),
    canFinalize: useReadContract({
      address: ADDRESSES.arbitrum.reputation, abi: REPUTATION_ABI, functionName: 'canFinalizeUnshield',
      args: address ? [address] : undefined, chainId: arbitrumSepolia.id,
      query: { enabled: !!address, refetchInterval: 5_000 },
    }),
  };

  const hasClaimed   = reads.hasClaimed.data as boolean | undefined;
  const publicScore  = reads.publicScore.data as number | undefined;
  const isShielded   = reads.isShielded.data as boolean | undefined;
  const hasPending   = reads.hasPending.data as boolean | undefined;
  const canFinalize  = reads.canFinalize.data as boolean | undefined;

  const { writeContract, data: txHash, isPending } = useWriteContract();
  const { isLoading: isMining } = useWaitForTransactionReceipt({ hash: txHash, chainId: arbitrumSepolia.id });

  const callFunc = async (fn: 'claimScore' | 'shield' | 'requestUnshield' | 'finalizeUnshield') => {
    setStatus(null);
    const latId = `rep-${fn}-${Date.now()}`;
    if (fn === 'requestUnshield') Latency.start(latId, 'Fhenix FHE Decrypt Request', 'FHE');
    if (fn === 'finalizeUnshield') Latency.start(latId, 'Fhenix FHE Finalize', 'FHE');
    if (fn === 'shield') Latency.start(latId, 'FHE Shield (encrypt)', 'FHE');
    if (fn === 'claimScore') Latency.start(latId, 'Claim Reputation', 'SHRED');
    try {
      if (chainId !== arbitrumSepolia.id) await switchChain({ chainId: arbitrumSepolia.id });
      writeContract({
        address: ADDRESSES.arbitrum.reputation,
        abi: REPUTATION_ABI,
        functionName: fn,
        chainId: arbitrumSepolia.id,
      });
      setStatus({ type: 'info', msg: `Calling ${fn}()...` });
      // Latency.end called when tx confirmed
    } catch (e: any) {
      Latency.error(latId);
      setStatus({ type: 'error', msg: e.shortMessage || e.message });
    }
  };

  return (
    <StepCard step={4} chain="ARB" unlocked={unlocked} done={done}
              title="Reputation Token"
              subtitle="Claim score (100), then shield/unshield via Fhenix CoFHE async decrypt">

      <div className="grid grid-cols-3 gap-3 font-mono text-xs">
        <div>
          <div className="text-[var(--low)]">CLAIMED</div>
          <div className={hasClaimed ? 'text-[var(--g)]' : 'text-[var(--mid)]'}>
            {hasClaimed ? '✓ yes' : 'no'}
          </div>
        </div>
        <div>
          <div className="text-[var(--low)]">PUBLIC SCORE</div>
          <div className="text-[var(--text)] text-base">{publicScore ?? 0}</div>
        </div>
        <div>
          <div className="text-[var(--low)]">STATE</div>
          <div className={isShielded ? 'text-[var(--v)]' : 'text-[var(--c)]'}>
            {isShielded ? '🔒 SHIELDED' : '🔓 PUBLIC'}
            {hasPending ? ' (pending unshield)' : ''}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <button className="btn btn-green" onClick={() => callFunc('claimScore')}
                disabled={hasClaimed || isPending || isMining}>
          {hasClaimed ? '✓ Already claimed' : 'Claim Score (100)'}
        </button>

        <button className="btn btn-primary" onClick={() => callFunc('shield')}
                disabled={!hasClaimed || isShielded || hasPending || isPending || isMining}>
          🔒 Shield (plaintext → FHE)
        </button>

        <button className="btn btn-outline" onClick={() => callFunc('requestUnshield')}
                disabled={!isShielded || hasPending || isPending || isMining}>
          🔓 Request Unshield
        </button>

        <button className="btn btn-cyan" onClick={() => callFunc('finalizeUnshield')}
                disabled={!canFinalize || isPending || isMining}>
          {canFinalize ? '✓ Finalize (ready!)' :
           hasPending  ? '⏳ FHE decrypting (~30-60s)...' :
                         'Finalize Unshield'}
        </button>
      </div>

      {txHash && (
        <a href={`${EXPLORERS.arbitrum}${txHash}`} target="_blank" rel="noopener"
           className="font-mono text-xs text-[var(--c)] underline">
          view tx ↗
        </a>
      )}

      {status && <div className={`status status-${status.type}`}>{status.msg}</div>}
    </StepCard>
  );
}
