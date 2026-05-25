// src/components/Step5Markets.tsx
// Step 5: Market creation card with persistent AMM tabs + AMMDrawer bottom sheet.
// Tabs always visible — switching AMM updates the drawer without closing it.
'use client';

import { useState } from 'react';
import { useAccount, useReadContract } from 'wagmi';
import { StepCard } from './StepCard';
import { AMMDrawer } from './AMMDrawer';
import { ADDRESSES, baseSepolia, riseTestnet } from '@/lib/config';
import { DARK_AMM_ABI, SPEED_AMM_ABI } from '@/abis';

type AMM = 'dark' | 'speed';

export function Step5Markets({ unlocked }: { unlocked: boolean }) {
  const { address } = useAccount();
  const [selectedAmm, setSelectedAmm] = useState<AMM>('dark');
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Pool counts for display
  const { data: darkCount } = useReadContract({
    address: ADDRESSES.base.darkAmm, abi: DARK_AMM_ABI, functionName: 'poolCount',
    chainId: baseSepolia.id, query: { refetchInterval: 15_000 },
  });
  const { data: speedCount } = useReadContract({
    address: ADDRESSES.rise.speedAmm, abi: SPEED_AMM_ABI, functionName: 'poolCount',
    chainId: riseTestnet.id, query: { refetchInterval: 15_000 },
  });

  const openDrawer = (amm: AMM) => {
    setSelectedAmm(amm);
    setDrawerOpen(true);
  };

  return (
    <>
      <StepCard step={5} chain={selectedAmm === 'dark' ? 'BASE' : 'RISE'} unlocked={unlocked} done={false}
                title="Markets"
                subtitle="DarkAMM (Inco/Base) or SpeedAMM (RISE) — tap to trade">

        {/* AMM Selector — always visible, always clickable */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>

          {/* DarkAMM card */}
          <button
            onClick={() => openDrawer('dark')}
            style={{
              background: 'rgba(123,47,255,.08)',
              border: `1px solid ${selectedAmm === 'dark' && drawerOpen ? '#a87fff' : 'rgba(123,47,255,.25)'}`,
              borderRadius: 14, padding: '16px 14px',
              cursor: 'pointer', textAlign: 'left',
              transition: 'all .25s',
              transform: selectedAmm === 'dark' && drawerOpen ? 'scale(.98)' : 'scale(1)',
            }}
          >
            <div style={{ fontFamily: "'Orbitron', sans-serif", fontSize: 12, color: '#a87fff',
                          letterSpacing: '.08em', marginBottom: 6 }}>🌑 DarkAMM</div>
            <div style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: 10, color: '#7a9acb', marginBottom: 10 }}>
              Inco TEE · Base Sepolia<br/>
              Public / Stealth modes
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
              <div>
                <div style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: 9, color: '#3a5070' }}>POOLS</div>
                <div style={{ fontFamily: "'Orbitron', monospace", fontSize: 18, color: '#a87fff' }}>
                  {darkCount?.toString() ?? '—'}
                </div>
              </div>
              <div style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: 10,
                            color: '#a87fff', border: '1px solid rgba(123,47,255,.3)',
                            borderRadius: 6, padding: '4px 8px' }}>
                Open →
              </div>
            </div>
          </button>

          {/* SpeedAMM card */}
          <button
            onClick={() => openDrawer('speed')}
            style={{
              background: 'rgba(0,229,255,.06)',
              border: `1px solid ${selectedAmm === 'speed' && drawerOpen ? '#00e5ff' : 'rgba(0,229,255,.15)'}`,
              borderRadius: 14, padding: '16px 14px',
              cursor: 'pointer', textAlign: 'left',
              transition: 'all .25s',
              transform: selectedAmm === 'speed' && drawerOpen ? 'scale(.98)' : 'scale(1)',
            }}
          >
            <div style={{ fontFamily: "'Orbitron', sans-serif", fontSize: 12, color: '#00e5ff',
                          letterSpacing: '.08em', marginBottom: 6 }}>⚡ SpeedAMM</div>
            <div style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: 10, color: '#7a9acb', marginBottom: 10 }}>
              RISE Shred · 3ms confirm<br/>
              Gasless via session key
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
              <div>
                <div style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: 9, color: '#3a5070' }}>POOLS</div>
                <div style={{ fontFamily: "'Orbitron', monospace", fontSize: 18, color: '#00e5ff' }}>
                  {speedCount?.toString() ?? '—'}
                </div>
              </div>
              <div style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: 10,
                            color: '#00e5ff', border: '1px solid rgba(0,229,255,.25)',
                            borderRadius: 6, padding: '4px 8px' }}>
                Open →
              </div>
            </div>
          </button>
        </div>

        {/* Bottom tab switcher — sempre visibile anche con drawer aperto */}
        {drawerOpen && (
          <div style={{
            display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6,
            marginTop: 10,
          }}>
            <button
              onClick={() => setSelectedAmm('dark')}
              style={{
                fontFamily: "'Share Tech Mono', monospace", fontSize: 11,
                padding: '8px', borderRadius: 8, cursor: 'pointer',
                border: `1px solid ${selectedAmm === 'dark' ? '#a87fff' : 'rgba(123,47,255,.2)'}`,
                background: selectedAmm === 'dark' ? 'rgba(123,47,255,.12)' : 'transparent',
                color: selectedAmm === 'dark' ? '#a87fff' : '#3a5070',
              }}>
              🌑 Switch to Dark
            </button>
            <button
              onClick={() => setSelectedAmm('speed')}
              style={{
                fontFamily: "'Share Tech Mono', monospace", fontSize: 11,
                padding: '8px', borderRadius: 8, cursor: 'pointer',
                border: `1px solid ${selectedAmm === 'speed' ? '#00e5ff' : 'rgba(0,229,255,.12)'}`,
                background: selectedAmm === 'speed' ? 'rgba(0,229,255,.08)' : 'transparent',
                color: selectedAmm === 'speed' ? '#00e5ff' : '#3a5070',
              }}>
              ⚡ Switch to Speed
            </button>
          </div>
        )}

        <div style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: 10, color: '#3a5070', textAlign: 'center' }}>
          AMM actions earn XP on Fhenix leaderboard via oracle relay
        </div>
      </StepCard>

      {/* Bottom sheet drawer */}
      <AMMDrawer
        open={drawerOpen}
        amm={selectedAmm}
        onClose={() => setDrawerOpen(false)}
      />
    </>
  );
}
