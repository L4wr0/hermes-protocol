// src/components/WalletConnect.tsx
'use client';

import { useAccount, useConnect, useDisconnect, useChainId, useSwitchChain } from 'wagmi';
import { riseTestnet, baseSepolia, arbitrumSepolia } from '@/lib/config';

const CHAIN_NAMES: Record<number, string> = {
  [riseTestnet.id]: 'RISE',
  [baseSepolia.id]: 'BASE',
  [arbitrumSepolia.id]: 'ARB',
};

export function WalletConnect() {
  const { address, isConnected } = useAccount();
  const { connectors, connect, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();

  if (!isConnected) {
    return (
      <div className="card flex items-center justify-between gap-4 flex-wrap">
        <div>
          <div className="font-head text-sm text-[var(--c)]">WALLET</div>
          <div className="font-mono text-xs text-[var(--mid)]">not connected</div>
        </div>
        <div className="flex gap-2 flex-wrap">
          {connectors.map((c) => (
            <button
              key={c.uid}
              className="btn btn-primary"
              style={{ width: 'auto' }}
              onClick={() => connect({ connector: c })}
              disabled={isPending}
            >
              {c.name === 'Injected' ? 'Connect Wallet' : c.name}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="card flex items-center justify-between gap-4 flex-wrap">
      <div>
        <div className="font-head text-sm text-[var(--c)]">WALLET</div>
        <div className="font-mono text-xs text-[var(--text)]">
          {address?.slice(0, 6)}...{address?.slice(-4)} on {CHAIN_NAMES[chainId] ?? 'unknown'}
        </div>
      </div>
      <div className="flex gap-2 flex-wrap">
        {[riseTestnet, baseSepolia, arbitrumSepolia].map((c) => (
          <button
            key={c.id}
            className={`btn ${chainId === c.id ? 'btn-cyan' : 'btn-outline'}`}
            style={{ width: 'auto', padding: '8px 14px' }}
            onClick={() => switchChain({ chainId: c.id })}
          >
            {CHAIN_NAMES[c.id]}
          </button>
        ))}
        <button
          className="btn btn-outline"
          style={{ width: 'auto', padding: '8px 14px' }}
          onClick={() => disconnect()}
        >
          Disconnect
        </button>
      </div>
    </div>
  );
}
