// src/components/Step1Claim.tsx
'use client';

import { useState } from 'react';
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt, useChainId, useSwitchChain } from 'wagmi';
import { StepCard } from './StepCard';
import { Latency } from './LatencyMonitor';
import { ADDRESSES, riseTestnet, EXPLORERS } from '@/lib/config';
import { HERMES_FAUCET_ABI, HERMES_TOKEN_ABI } from '@/abis';
import { formatUnits } from 'viem';

export function Step1Claim({ unlocked, done }: { unlocked: boolean; done: boolean }) {
  const { address } = useAccount();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();
  const [status, setStatus] = useState<{ type: 'success' | 'error' | 'info'; msg: string } | null>(null);

  const { data: canClaim } = useReadContract({
    address: ADDRESSES.rise.hermesFaucet,
    abi: HERMES_FAUCET_ABI,
    functionName: 'canClaim',
    args: address ? [address] : undefined,
    chainId: riseTestnet.id,
    query: { enabled: !!address, refetchInterval: 5_000 },
  });

  const { data: balance } = useReadContract({
    address: ADDRESSES.rise.hermesToken,
    abi: HERMES_TOKEN_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    chainId: riseTestnet.id,
    query: { enabled: !!address, refetchInterval: 5_000 },
  });

  const { writeContract, data: txHash, isPending } = useWriteContract();
  const { isLoading: isMining, isSuccess } = useWaitForTransactionReceipt({ hash: txHash, chainId: riseTestnet.id });

  const handleClaim = async () => {
    setStatus(null);
    const latId = `claim-${Date.now()}`;
    Latency.start(latId, 'RISE Faucet Claim', 'SHRED');
    try {
      if (chainId !== riseTestnet.id) {
        await switchChain({ chainId: riseTestnet.id });
      }
      // Latency ends when tx confirmed (in isSuccess effect)
      writeContract({
        address: ADDRESSES.rise.hermesFaucet,
        abi: HERMES_FAUCET_ABI,
        functionName: 'claim',
        chainId: riseTestnet.id,
      });
    } catch (e: any) {
      setStatus({ type: 'error', msg: e.shortMessage || e.message });
    }
  };

  if (isSuccess && !status) {
    setStatus({ type: 'success', msg: `✓ 1000 HERMES claimed — tx: ${txHash}` });
  }

  return (
    <StepCard step={1} chain="RISE" unlocked={unlocked} done={done}
              title="Claim HERMES"
              subtitle="Drips 1,000 HERMES every 24h to your RISE wallet">
      <div className="grid grid-cols-2 gap-3 font-mono text-xs">
        <div>
          <div className="text-[var(--low)]">YOUR BALANCE</div>
          <div className="text-[var(--text)] text-base">
            {balance !== undefined ? formatUnits(balance as bigint, 18) : '—'} HERMES
          </div>
        </div>
        <div>
          <div className="text-[var(--low)]">CAN CLAIM</div>
          <div className={canClaim ? 'text-[var(--g)]' : 'text-[var(--mid)]'}>
            {canClaim ? 'YES — ready to drip' : 'wait for cooldown'}
          </div>
        </div>
      </div>

      <button
        className="btn btn-cyan"
        onClick={handleClaim}
        disabled={!canClaim || isPending || isMining}
      >
        {isPending ? 'Confirm in wallet...' :
         isMining  ? 'Mining...' :
                     'Claim 1000 HERMES'}
      </button>

      {txHash && (
        <a href={`${EXPLORERS.rise}${txHash}`} target="_blank" rel="noopener"
           className="font-mono text-xs text-[var(--c)] underline">
          view tx on explorer ↗
        </a>
      )}

      {status && <div className={`status status-${status.type}`}>{status.msg}</div>}
    </StepCard>
  );
}
