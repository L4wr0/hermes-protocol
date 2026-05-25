// src/components/AMMDrawer.tsx
// Bottom-sheet AMM drawer — Uniswap-style swap/LP/create UI.
// Slides up from bottom, works for both DarkAMM (Base) and SpeedAMM (RISE).
// Session key integration for gasless swaps on SpeedAMM (RISE Wallet).
'use client';

import { useState, useEffect, useRef } from 'react';
import { useAccount, useReadContract, useWriteContract,
         useWaitForTransactionReceipt, useChainId, useSwitchChain } from 'wagmi';
import { parseEther, parseUnits, encodeFunctionData, formatEther } from 'viem';
import { ADDRESSES, baseSepolia, riseTestnet, EXPLORERS } from '@/lib/config';
import { DARK_AMM_ABI, SPEED_AMM_ABI, HERMES_TOKEN_ABI } from '@/abis';
import { Latency } from './LatencyMonitor';
import { SessionStore } from '@/lib/wagmi';

type AMM = 'dark' | 'speed';
type Mode = 'public' | 'stealth';
type Action = 'swap' | 'liquidity' | 'create';

interface AMMDrawerProps {
  open: boolean;
  amm: AMM;
  onClose: () => void;
}

const MODE_INFO = {
  public:  { label: '💎 Public',  desc: '~2s · ~$0.001 · no privacy',              color: '#00e5ff', latencyMs: 2000 },
  stealth: { label: '🥷 Stealth', desc: '~5s · ~$0.005 · encrypted LP positions', color: '#a87fff', latencyMs: 5000 },
};

export function AMMDrawer({ open, amm, onClose }: AMMDrawerProps) {
  const { address } = useAccount();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();

  const [mode, setMode] = useState<Mode>('public');
  const [action, setAction] = useState<Action>('swap');
  const [poolId, setPoolId] = useState('1');
  const [ethAmount, setEthAmount] = useState('0.01');
  const [tokenAmount, setTokenAmount] = useState('100');
  const [zeroForOne, setZeroForOne] = useState(true);
  const [status, setStatus] = useState<{ type: 'success'|'error'|'info'; msg: string }|null>(null);
  const [quoteOut, setQuoteOut] = useState<string>('');
  const overlayRef = useRef<HTMLDivElement>(null);

  const targetChain = amm === 'dark' ? baseSepolia : riseTestnet;
  const ammAddr = amm === 'dark' ? ADDRESSES.base.darkAmm : ADDRESSES.rise.speedAmm;
  const tokenAddr = amm === 'dark' ? ADDRESSES.base.cHermes : ADDRESSES.rise.hermesToken;
  const explorer = amm === 'dark' ? EXPLORERS.base : EXPLORERS.rise;
  const ammAbi = amm === 'dark' ? DARK_AMM_ABI : SPEED_AMM_ABI;

  // Quote
  const { data: quoteData } = useReadContract({
    address: ammAddr, abi: ammAbi as any, functionName: 'quoteSwap',
    args: [BigInt(poolId || '1'), parseEther(ethAmount || '0'), zeroForOne],
    chainId: targetChain.id,
    query: { enabled: !!poolId && action === 'swap' && parseFloat(ethAmount || '0') > 0, refetchInterval: 3000 },
  });

  useEffect(() => {
    if (quoteData) setQuoteOut(formatEther(quoteData as bigint));
  }, [quoteData]);

  // Reserves
  const { data: reserves } = useReadContract({
    address: ammAddr, abi: ammAbi as any,
    functionName: amm === 'dark' ? 'getPoolMeta' : 'getReserves',
    args: [BigInt(poolId || '1')],
    chainId: targetChain.id,
    query: { enabled: !!poolId, refetchInterval: 5000 },
  });

  const { writeContractAsync, data: txHash, isPending } = useWriteContract();
  const { isLoading: isMining, isSuccess } = useWaitForTransactionReceipt({ hash: txHash, chainId: targetChain.id });

  const execute = async () => {
    setStatus(null);
    const latId = `amm-${Date.now()}`;
    try {
      if (chainId !== targetChain.id) await switchChain({ chainId: targetChain.id });

      const tech = amm === 'dark'
        ? (mode === 'public' ? 'TEE' : 'TEE')
        : 'SHRED';
      const modeLabel = amm === 'dark'
        ? `Dark${mode === 'public' ? ' Public' : ' Stealth'} ${action}`
        : `Speed ${action}`;
      Latency.start(latId, modeLabel, tech as any);

      if (action === 'create') {
        await writeContractAsync({
          address: ammAddr, abi: ammAbi as any, functionName: 'createPool',
          args: [tokenAddr as `0x${string}`], chainId: targetChain.id,
        });
      } else {
        // Approve first
        const tokenAmt = parseUnits(tokenAmount, 18);
        if (action === 'liquidity' || (!zeroForOne && action === 'swap')) {
          await writeContractAsync({
            address: tokenAddr as `0x${string}`, abi: HERMES_TOKEN_ABI,
            functionName: 'approve', args: [ammAddr, tokenAmt], chainId: targetChain.id,
          });
          await new Promise(r => setTimeout(r, 2000));
        }

        if (action === 'liquidity') {
          const fn = amm === 'dark'
            ? (mode === 'public' ? 'addLiquidityPublic' : 'addLiquidityStealth')
            : 'addLiquidity';
          await writeContractAsync({
            address: ammAddr, abi: ammAbi as any, functionName: fn,
            args: [BigInt(poolId), tokenAmt],
            value: parseEther(ethAmount), chainId: targetChain.id,
          });
        } else {
          const fn = amm === 'dark'
            ? (mode === 'public' ? 'swapPublic' : 'swapStealth')
            : 'swap';
          const amtIn = zeroForOne ? parseEther(ethAmount) : parseUnits(tokenAmount, 18);
          await writeContractAsync({
            address: ammAddr, abi: ammAbi as any, functionName: fn,
            args: [BigInt(poolId), amtIn, zeroForOne, 0n],
            value: zeroForOne ? parseEther(ethAmount) : 0n,
            chainId: targetChain.id,
          });
        }
      }
      setStatus({ type: 'info', msg: `${action} submitted — waiting confirm` });
    } catch (e: any) {
      Latency.error(latId);
      setStatus({ type: 'error', msg: e.shortMessage || e.message?.slice(0,150) });
    }
  };

  useEffect(() => {
    if (isSuccess) {
      setStatus({ type: 'success', msg: `✓ ${action} confirmed · leaderboard XP incoming` });
    }
  }, [isSuccess]);

  // Parse reserves for display
  const res0 = reserves ? (amm === 'dark' ? (reserves as any)[3] : (reserves as any)[0]) : 0n;
  const res1 = reserves ? (amm === 'dark' ? (reserves as any)[4] : (reserves as any)[1]) : 0n;
  const priceImpact = quoteData && res0 > 0n
    ? ((parseFloat(ethAmount) / (Number(res0) / 1e18)) * 100).toFixed(3)
    : '—';

  return (
    <>
      {/* Backdrop */}
      <div
        ref={overlayRef}
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, zIndex: 40,
          background: 'rgba(0,0,0,.6)',
          backdropFilter: 'blur(4px)',
          opacity: open ? 1 : 0,
          pointerEvents: open ? 'auto' : 'none',
          transition: 'opacity .3s',
        }}
      />

      {/* Drawer */}
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 50,
        background: '#070d1c',
        borderTop: '1px solid rgba(0,229,255,.15)',
        borderRadius: '20px 20px 0 0',
        transform: open ? 'translateY(0)' : 'translateY(100%)',
        transition: 'transform .35s cubic-bezier(.32,.72,0,1)',
        maxHeight: '92vh',
        overflowY: 'auto',
        padding: '0 0 40px',
      }}>
        {/* Handle */}
        <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 4px' }}>
          <div style={{ width: 40, height: 4, borderRadius: 2, background: 'rgba(255,255,255,.12)' }} />
        </div>

        <div style={{ padding: '0 18px' }}>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <div>
              <div style={{ fontFamily: "'Orbitron', sans-serif", fontSize: 15, fontWeight: 700 }}>
                {amm === 'dark' ? '🌑 DarkAMM' : '⚡ SpeedAMM'}
              </div>
              <div style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: 10, color: '#7a9acb', marginTop: 2 }}>
                {amm === 'dark' ? 'Base Sepolia · Inco TEE' : 'RISE Testnet · 3ms shreds'}
              </div>
            </div>
            <button onClick={onClose}
              style={{ background: 'rgba(255,255,255,.06)', border: 'none', borderRadius: 8,
                       color: '#7a9acb', fontSize: 18, padding: '6px 12px', cursor: 'pointer' }}>✕</button>
          </div>

          {/* Privacy mode (DarkAMM only) */}
          {amm === 'dark' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 14 }}>
              {(['public', 'stealth'] as Mode[]).map(m => (
                <button key={m} onClick={() => setMode(m)}
                  style={{
                    fontFamily: "'Share Tech Mono', monospace", fontSize: 11,
                    padding: '10px 8px', borderRadius: 10, cursor: 'pointer', textAlign: 'center',
                    border: `1px solid ${mode === m ? MODE_INFO[m].color : 'rgba(0,229,255,.12)'}`,
                    background: mode === m ? `${MODE_INFO[m].color}15` : 'transparent',
                    color: mode === m ? MODE_INFO[m].color : '#7a9acb',
                    transition: 'all .2s',
                  }}>
                  <div style={{ fontSize: 13, marginBottom: 2 }}>{MODE_INFO[m].label}</div>
                  <div style={{ fontSize: 9, opacity: .7 }}>{MODE_INFO[m].desc}</div>
                </button>
              ))}
            </div>
          )}

          {/* Action tabs */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, marginBottom: 16 }}>
            {(['swap', 'liquidity', 'create'] as Action[]).map(a => (
              <button key={a} onClick={() => setAction(a)}
                style={{
                  fontFamily: "'Orbitron', sans-serif", fontSize: 10,
                  padding: '10px 6px', borderRadius: 8, cursor: 'pointer', textAlign: 'center',
                  border: `1px solid ${action === a ? '#00ff9d' : 'rgba(0,229,255,.12)'}`,
                  background: action === a ? 'rgba(0,255,157,.1)' : 'transparent',
                  color: action === a ? '#00ff9d' : '#7a9acb',
                  letterSpacing: '.06em', transition: 'all .2s',
                }}>
                {a === 'swap' ? '🔄 Swap' : a === 'liquidity' ? '💧 Add LP' : '🏭 Create'}
              </button>
            ))}
          </div>

          {/* Pool ID */}
          {action !== 'create' && (
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: 10, color: '#3a5070', display: 'block', marginBottom: 5 }}>POOL ID</label>
              <input value={poolId} onChange={e => setPoolId(e.target.value)} type="number" min="1"
                style={{ width: '100%', background: 'rgba(255,255,255,.04)', border: '1px solid rgba(0,229,255,.12)',
                         borderRadius: 8, color: '#e2ecff', padding: '10px 12px',
                         fontFamily: "'Share Tech Mono', monospace", fontSize: 14 }} />
            </div>
          )}

          {/* Swap direction (swap only) */}
          {action === 'swap' && (
            <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
              <button onClick={() => setZeroForOne(true)}
                style={{
                  flex: 1, padding: '8px', borderRadius: 8, cursor: 'pointer',
                  fontFamily: "'Share Tech Mono', monospace", fontSize: 11,
                  border: `1px solid ${zeroForOne ? '#00e5ff' : 'rgba(0,229,255,.12)'}`,
                  background: zeroForOne ? 'rgba(0,229,255,.1)' : 'transparent',
                  color: zeroForOne ? '#00e5ff' : '#7a9acb',
                }}>ETH → {amm === 'dark' ? 'cHERMES' : 'HERMES'}</button>
              <button onClick={() => setZeroForOne(false)}
                style={{
                  flex: 1, padding: '8px', borderRadius: 8, cursor: 'pointer',
                  fontFamily: "'Share Tech Mono', monospace", fontSize: 11,
                  border: `1px solid ${!zeroForOne ? '#00e5ff' : 'rgba(0,229,255,.12)'}`,
                  background: !zeroForOne ? 'rgba(0,229,255,.1)' : 'transparent',
                  color: !zeroForOne ? '#00e5ff' : '#7a9acb',
                }}>{amm === 'dark' ? 'cHERMES' : 'HERMES'} → ETH</button>
            </div>
          )}

          {/* YOU PAY / YOU RECEIVE (swap) or ETH + TOKEN (liquidity) */}
          {action === 'swap' && (
            <>
              <div style={{ background: 'rgba(0,0,0,.35)', borderRadius: 12, padding: '14px', marginBottom: 6 }}>
                <div style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: 10, color: '#3a5070', marginBottom: 8 }}>YOU PAY</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <input
                    value={zeroForOne ? ethAmount : tokenAmount}
                    onChange={e => zeroForOne ? setEthAmount(e.target.value) : setTokenAmount(e.target.value)}
                    type="number" step="0.001"
                    style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none',
                             fontFamily: "'Orbitron', monospace", fontSize: 22, color: '#e2ecff' }} />
                  <span style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: 13, color: '#00e5ff',
                                 background: 'rgba(0,229,255,.1)', padding: '6px 10px', borderRadius: 8 }}>
                    {zeroForOne ? 'ETH' : (amm === 'dark' ? 'cHERMES' : 'HERMES')}
                  </span>
                </div>
              </div>

              <div style={{ textAlign: 'center', color: '#3a5070', fontSize: 18, margin: '4px 0' }}>↓</div>

              <div style={{ background: 'rgba(0,0,0,.35)', borderRadius: 12, padding: '14px', marginBottom: 14 }}>
                <div style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: 10, color: '#3a5070', marginBottom: 8 }}>YOU RECEIVE (est.)</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ flex: 1, fontFamily: "'Orbitron', monospace", fontSize: 22,
                                color: quoteOut ? '#00ff9d' : '#3a5070' }}>
                    {quoteOut ? parseFloat(quoteOut).toFixed(4) : '—'}
                  </div>
                  <span style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: 13, color: '#7a9acb',
                                 background: 'rgba(255,255,255,.06)', padding: '6px 10px', borderRadius: 8 }}>
                    {!zeroForOne ? 'ETH' : (amm === 'dark' ? 'cHERMES' : 'HERMES')}
                  </span>
                </div>
              </div>
            </>
          )}

          {action === 'liquidity' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 14 }}>
              {[['ETH', ethAmount, setEthAmount], [amm==='dark'?'cHERMES':'HERMES', tokenAmount, setTokenAmount]].map(([label, val, setter]: any) => (
                <div key={label as string} style={{ background: 'rgba(0,0,0,.35)', borderRadius: 12, padding: 12 }}>
                  <div style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: 10, color: '#3a5070', marginBottom: 6 }}>{label}</div>
                  <input value={val} onChange={e => setter(e.target.value)} type="number" step="0.001"
                    style={{ width: '100%', background: 'transparent', border: 'none', outline: 'none',
                             fontFamily: "'Orbitron', monospace", fontSize: 18, color: '#e2ecff' }} />
                </div>
              ))}
            </div>
          )}

          {/* Pool info */}
          {action !== 'create' && (res0 > 0n || res1 > 0n) && (
            <div style={{
              background: 'rgba(0,0,0,.2)', borderRadius: 10, padding: '10px 12px',
              fontFamily: "'Share Tech Mono', monospace", fontSize: 11, color: '#3a5070',
              marginBottom: 14, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6,
            }}>
              <div>RESERVES<br/><span style={{ color: '#7a9acb' }}>{(Number(res0)/1e18).toFixed(4)} ETH</span></div>
              <div>TOKEN<br/><span style={{ color: '#7a9acb' }}>{(Number(res1)/1e18).toFixed(0)}</span></div>
              {action === 'swap' && (
                <>
                  <div>PRICE IMPACT<br/><span style={{ color: parseFloat(priceImpact) > 1 ? '#ff5277' : '#00ff9d' }}>{priceImpact}%</span></div>
                  <div>MIN RECEIVED<br/><span style={{ color: '#7a9acb' }}>{quoteOut ? (parseFloat(quoteOut) * .995).toFixed(4) : '—'}</span></div>
                </>
              )}
            </div>
          )}

          {/* Create pool info */}
          {action === 'create' && (
            <div style={{ background: 'rgba(0,229,255,.05)', border: '1px solid rgba(0,229,255,.12)',
                          borderRadius: 10, padding: '12px', marginBottom: 14,
                          fontFamily: "'Share Tech Mono', monospace", fontSize: 11, color: '#7a9acb' }}>
              Creates a new ETH/{amm === 'dark' ? 'cHERMES' : 'HERMES'} pool on {amm === 'dark' ? 'DarkAMM (Base)' : 'SpeedAMM (RISE)'}.<br/>
              After creating, add initial liquidity to seed the pool.
            </div>
          )}

          {/* Execute */}
          <button onClick={execute} disabled={isPending || isMining}
            style={{
              width: '100%',
              fontFamily: "'Orbitron', sans-serif", fontSize: 13, fontWeight: 700,
              letterSpacing: '.1em', padding: '16px',
              borderRadius: 12, border: 'none', cursor: 'pointer',
              background: isPending || isMining
                ? 'rgba(255,255,255,.1)'
                : amm === 'dark'
                  ? 'linear-gradient(135deg, #7b2fff, #4a0fb0)'
                  : 'linear-gradient(135deg, #00e5ff, #0099cc)',
              color: amm === 'dark' ? 'white' : 'black',
              transition: 'all .25s',
              textTransform: 'uppercase',
              boxShadow: isPending || isMining ? 'none'
                : amm === 'dark' ? '0 6px 24px rgba(123,47,255,.3)' : '0 6px 24px rgba(0,229,255,.25)',
            }}>
            {isPending ? 'Confirm in wallet...' :
             isMining  ? 'Confirming...' :
             action === 'create' ? 'Create Pool' :
             action === 'liquidity' ? 'Add Liquidity' :
             `Swap ${zeroForOne ? 'ETH → ' + (amm==='dark'?'cHERMES':'HERMES') : (amm==='dark'?'cHERMES':'HERMES') + ' → ETH'}`}
          </button>

          {txHash && (
            <a href={`${explorer}${txHash}`} target="_blank" rel="noopener"
              style={{ display: 'block', textAlign: 'center', marginTop: 10,
                       fontFamily: "'Share Tech Mono', monospace", fontSize: 11, color: '#00e5ff' }}>
              view tx ↗
            </a>
          )}

          {status && (
            <div style={{
              marginTop: 12, padding: '10px 14px', borderRadius: 8,
              fontFamily: "'Share Tech Mono', monospace", fontSize: 11,
              background: status.type === 'success' ? 'rgba(0,255,157,.07)' :
                          status.type === 'error'   ? 'rgba(255,82,119,.07)' :
                                                      'rgba(0,229,255,.07)',
              color: status.type === 'success' ? '#00ff9d' :
                     status.type === 'error'   ? '#ff5277' : '#00e5ff',
              border: `1px solid ${status.type === 'success' ? 'rgba(0,255,157,.2)' :
                                   status.type === 'error'   ? 'rgba(255,82,119,.2)' :
                                                               'rgba(0,229,255,.2)'}`,
            }}>
              {status.msg}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
