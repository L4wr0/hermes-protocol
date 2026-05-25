// src/app/page.tsx
'use client';

import { useAccount } from 'wagmi';
import { WalletConnect } from '@/components/WalletConnect';
import { Step1Claim } from '@/components/Step1Claim';
import { Step2Vault } from '@/components/Step2Vault';
import { Step3Bridge } from '@/components/Step3Bridge';
import { Step4Reputation } from '@/components/Step4Reputation';
import { Step5Markets } from '@/components/Step5Markets';
import { Leaderboard } from '@/components/Leaderboard';
import { LatencyMonitor } from '@/components/LatencyMonitor';
import { useProgress } from '@/hooks/useProgress';

export default function Home() {
  const { isConnected, address } = useAccount();
  const progress = useProgress(address);

  return (
    <main className="relative z-10 max-w-6xl mx-auto px-4 py-8">
      {/* Header */}
      <header className="mb-10 text-center">
        <h1 className="font-head text-4xl md:text-5xl mb-2"
            style={{ background: 'linear-gradient(135deg, #00e5ff, #7b2fff, #ff5277)',
                     WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
          HERMES PROTOCOL
        </h1>
        <p className="text-[var(--mid)] font-mono text-sm tracking-wider">
          encrypted_multichain_defi · TEE + FHE privacy mission
        </p>
      </header>

      {/* Wallet bar */}
      <div className="mb-4">
        <WalletConnect />
      </div>

      {/* Latency Monitor — always visible once connected */}
      {isConnected && <LatencyMonitor />}

      {!isConnected && (
        <div className="card text-center py-12">
          <p className="text-[var(--mid)] font-mono text-sm mb-2">
            connect a wallet to begin the mission
          </p>
          <p className="text-[var(--low)] font-mono text-xs">
            RISE Wallet (passkey) · MetaMask · any EIP-6963 wallet
          </p>
        </div>
      )}

      {isConnected && (
        <div className="grid gap-5">
          <Step1Claim
            unlocked={true}
            done={progress.step1Done}
          />
          <Step2Vault
            unlocked={progress.step1Done}
            done={progress.step2Done}
          />
          <Step3Bridge
            unlocked={progress.step2Done}
            done={progress.step3Done}
          />
          <Step4Reputation
            unlocked={progress.step3Done}
            done={progress.step4Done}
          />
          <Step5Markets
            unlocked={progress.step4Done}
          />
          <Leaderboard />
        </div>
      )}

      <footer className="mt-12 text-center text-[var(--low)] font-mono text-xs">
        v1.0 · TEE (Inco/Base) + FHE (Fhenix/Arb) + RISE shred · testnet only
      </footer>
    </main>
  );
}
