// src/components/Step3Bridge.tsx
'use client';

import { useState } from 'react';
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useReadContract,
         useChainId, useSwitchChain, usePublicClient } from 'wagmi';
import { parseEther, parseUnits, decodeEventLog } from 'viem';
import { StepCard } from './StepCard';
import { Latency } from './LatencyMonitor';
import { ADDRESSES, baseSepolia, riseTestnet, EXPLORERS, MIN_BRIDGE_FOR_REPUTATION } from '@/lib/config';
import { CONFIDENTIAL_VAULT_ABI, BRIDGE_ABI } from '@/abis';

type BridgeStep = 'idle' | 'request' | 'signing' | 'claim' | 'done';

export function Step3Bridge({ unlocked, done }: { unlocked: boolean; done: boolean }) {
  const { address } = useAccount();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();
  const basePublicClient = usePublicClient({ chainId: baseSepolia.id });

  const [amount, setAmount] = useState('0.1');
  const [step, setStep]     = useState<BridgeStep>('idle');
  const [status, setStatus] = useState<{ type: 'success' | 'error' | 'info'; msg: string } | null>(null);
  const [savedNonce, setSavedNonce] = useState<bigint | null>(null);
  const [savedSig, setSavedSig]     = useState<`0x${string}` | null>(null);

  const { writeContractAsync } = useWriteContract();

  // Read current collateral on bridge
  const { data: collateral, refetch: refetchCollateral } = useReadContract({
    address: ADDRESSES.rise.bridge,
    abi: BRIDGE_ABI,
    functionName: 'collateral',
    args: address ? [address] : undefined,
    chainId: riseTestnet.id,
    query: { enabled: !!address, refetchInterval: 5_000 },
  });

  const handleBridge = async () => {
    if (!address || !basePublicClient) return;
    setStatus(null);

    try {
      // ── STEP A: switch to Base ──
      if (chainId !== baseSepolia.id) await switchChain({ chainId: baseSepolia.id });

      const latBridge = `bridge-${Date.now()}`;
      Latency.start(latBridge, 'Bridge Base → RISE', 'BRIDGE');
      // ── STEP B: call darkBridgeToRise on Base ──
      setStep('request');
      setStatus({ type: 'info', msg: 'Requesting bridge on Base...' });
      const amountWei = parseEther(amount);

      const requestHash = await writeContractAsync({
        address: ADDRESSES.base.vault,
        abi: CONFIDENTIAL_VAULT_ABI,
        functionName: 'darkBridgeToRise',
        args: [amountWei],
        chainId: baseSepolia.id,
      });

      setStatus({ type: 'info', msg: `Bridge tx submitted: ${requestHash.slice(0,16)}... waiting confirmation` });

      // ── STEP C: wait for receipt + extract nonce from event ──
      const receipt = await basePublicClient.waitForTransactionReceipt({ hash: requestHash });

      let extractedNonce: bigint | null = null;
      for (const log of receipt.logs) {
        try {
          const decoded = decodeEventLog({
            abi: CONFIDENTIAL_VAULT_ABI,
            data: log.data,
            topics: log.topics,
          });
          if (decoded.eventName === 'DarkBridgeRequested') {
            extractedNonce = (decoded.args as any).nonce as bigint;
            break;
          }
        } catch { /* not our event */ }
      }

      if (extractedNonce === null) {
        throw new Error('Could not extract nonce from DarkBridgeRequested event');
      }
      setSavedNonce(extractedNonce);

      const latOracle = `oracle1-${Date.now()}`;
      Latency.start(latOracle, 'Oracle 1 Signature', 'ORACLE');
      // ── STEP D: request signature from oracle1 ──
      setStep('signing');
      setStatus({ type: 'info', msg: 'Requesting oracle signature...' });

      const signRes = await fetch('/api/sign-bridge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user:   address,
          amount: amountWei.toString(),
          nonce:  extractedNonce.toString(),
        }),
      });
      if (!signRes.ok) {
        const errText = await signRes.text();
        throw new Error(`Oracle failed: ${errText}`);
      }
      const { signature } = await signRes.json();
      Latency.end(latOracle);
      setSavedSig(signature);

      // ── STEP E: switch to RISE and call claimFromInco ──
      setStep('claim');
      setStatus({ type: 'info', msg: 'Switching to RISE and claiming...' });
      await switchChain({ chainId: riseTestnet.id });

      const claimHash = await writeContractAsync({
        address: ADDRESSES.rise.bridge,
        abi: BRIDGE_ABI,
        functionName: 'claimFromInco',
        args: [amountWei, extractedNonce, signature as `0x${string}`],
        chainId: riseTestnet.id,
      });

      Latency.end(latBridge);
      setStep('done');
      setStatus({ type: 'success', msg: `✓ Bridged ${amount} ETH to RISE wallet — claim tx: ${claimHash}` });
      setTimeout(() => refetchCollateral(), 3000);
    } catch (e: any) {
      setStep('idle');
      setStatus({ type: 'error', msg: e.shortMessage || e.message?.slice(0,200) });
    }
  };

  return (
    <StepCard step={3} chain="RISE" unlocked={unlocked} done={done}
              title="Bridge Base → RISE"
              subtitle="Move encrypted ETH to RISE wallet via oracle relay. ≥0.1 ETH unlocks reputation">

      <div className="grid grid-cols-2 gap-3 font-mono text-xs">
        <div>
          <label className="text-[var(--low)] block mb-1">BRIDGE AMOUNT (ETH)</label>
          <input type="number" step="0.001" min="0.01" value={amount}
                 onChange={(e) => setAmount(e.target.value)} />
        </div>
        <div>
          <div className="text-[var(--low)]">YOUR COLLATERAL ON RISE</div>
          <div className="text-[var(--text)] text-base">
            {collateral !== undefined ? (Number(collateral) / 1e18).toFixed(4) : '—'} ETH
          </div>
          <div className="text-[10px] text-[var(--mid)]">
            need {(Number(MIN_BRIDGE_FOR_REPUTATION) / 1e18)} ETH for step 4
          </div>
        </div>
      </div>

      <button className="btn btn-primary" onClick={handleBridge}
              disabled={step !== 'idle' && step !== 'done'}>
        {step === 'idle'    ? `Bridge ${amount} ETH` :
         step === 'request' ? 'Submitting on Base...' :
         step === 'signing' ? 'Getting oracle sig...' :
         step === 'claim'   ? 'Claiming on RISE...' :
                              'Bridge complete'}
      </button>

      {status && <div className={`status status-${status.type}`}>{status.msg}</div>}
    </StepCard>
  );
}
