// src/components/Leaderboard.tsx
'use client';

import { useState } from 'react';
import { useAccount, useReadContract, useChainId, useSwitchChain } from 'wagmi';
import { ADDRESSES, arbitrumSepolia } from '@/lib/config';
import { LEADERBOARD_ABI } from '@/abis';

export function Leaderboard() {
  const { address } = useAccount();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();

  const [decryptedStats, setDecryptedStats] = useState<{ volume: number; wins: number; losses: number; rep: number } | null>(null);
  const [status, setStatus] = useState<string>('');

  const { data: rank } = useReadContract({
    address: ADDRESSES.arbitrum.leaderboard,
    abi: LEADERBOARD_ABI,
    functionName: 'myRank',
    chainId: arbitrumSepolia.id,
    account: address,
    query: { enabled: !!address, refetchInterval: 10_000 },
  });

  const { data: total } = useReadContract({
    address: ADDRESSES.arbitrum.leaderboard,
    abi: LEADERBOARD_ABI,
    functionName: 'totalTraders',
    chainId: arbitrumSepolia.id,
    query: { refetchInterval: 10_000 },
  });

  const { data: meets } = useReadContract({
    address: ADDRESSES.arbitrum.leaderboard,
    abi: LEADERBOARD_ABI,
    functionName: 'meetsMinimum',
    args: address ? [address] : undefined,
    chainId: arbitrumSepolia.id,
    query: { enabled: !!address, refetchInterval: 10_000 },
  });

  const decryptStats = async () => {
    setStatus('Reading encrypted stats via cofhejs...');
    setDecryptedStats(null);
    try {
      if (chainId !== arbitrumSepolia.id) await switchChain({ chainId: arbitrumSepolia.id });
      if (!address) throw new Error('Connect wallet first');

      // Dynamic import cofhejs (client only)
      // cofhejs removed — v2 feature

      // Init cofhejs with provider
setStatus('FHE decrypt via cofhejs — coming in v2.');

    } catch (e: any) {
      setStatus('Decrypt failed: ' + e.message?.slice(0, 100));
    }
  };

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="font-head text-lg">🏆 LEADERBOARD</h2>
          <p className="font-mono text-xs text-[var(--mid)]">
            FHE encrypted on Fhenix · populated by AMM activity via oracle relay
          </p>
        </div>
        <div className="font-mono text-xs text-right">
          <div className="text-[var(--low)]">TOTAL TRADERS</div>
          <div className="text-[var(--text)] text-base">{total !== undefined ? total.toString() : '—'}</div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 font-mono text-xs mb-3">
        <div>
          <div className="text-[var(--low)]">YOUR RANK</div>
          <div className="text-[var(--text)] text-2xl">
            {meets ? `#${rank}` : '—'}
          </div>
        </div>
        <div>
          <div className="text-[var(--low)]">STATUS</div>
          <div className={meets ? 'text-[var(--g)]' : 'text-[var(--mid)]'}>
            {meets ? '✓ on board' : 'no activity yet'}
          </div>
        </div>
      </div>

      {meets && (
        <button className="btn btn-cyan" onClick={decryptStats}>
          🔓 Decrypt my stats (FHE)
        </button>
      )}

      {decryptedStats && (
        <div className="grid grid-cols-4 gap-3 font-mono text-xs mt-3">
          <div><div className="text-[var(--low)]">VOLUME</div><div className="text-[var(--text)]">{decryptedStats.volume}</div></div>
          <div><div className="text-[var(--low)]">WINS</div><div className="text-[var(--g)]">{decryptedStats.wins}</div></div>
          <div><div className="text-[var(--low)]">LOSSES</div><div className="text-[var(--r)]">{decryptedStats.losses}</div></div>
          <div><div className="text-[var(--low)]">REPUTATION</div><div className="text-[var(--v)]">{decryptedStats.rep}</div></div>
        </div>
      )}

      {status && <div className="status status-info mt-3">{status}</div>}
    </div>
  );
}
