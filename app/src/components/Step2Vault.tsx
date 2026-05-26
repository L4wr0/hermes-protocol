// src/components/Step2Vault.tsx
'use client';

import { useState } from 'react';
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useReadContract, useChainId, useSwitchChain } from 'wagmi';
import { parseEther, formatEther } from 'viem';
import { StepCard } from './StepCard';
import { Latency } from './LatencyMonitor';
import { ADDRESSES, baseSepolia, EXPLORERS } from '@/lib/config';
import { CONFIDENTIAL_VAULT_ABI } from '@/abis';

export function Step2Vault({ unlocked, done }: { unlocked: boolean; done: boolean }) {
  const { address } = useAccount();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();

  const [amount, setAmount]   = useState('0.1');
  const [decrypted, setDecrypted] = useState<string | null>(null);
  const [status, setStatus]   = useState<{ type: 'success' | 'error' | 'info'; msg: string } | null>(null);

  const { writeContract, data: txHash, isPending } = useWriteContract();
  const { isLoading: isMining, isSuccess } = useWaitForTransactionReceipt({
    hash: txHash, chainId: baseSepolia.id
  });

  // Read encrypted handle (uint256 — Inco ciphertext handle)
  const { data: encryptedHandle, refetch: refetchHandle } = useReadContract({
    address: ADDRESSES.base.vault,
    abi: CONFIDENTIAL_VAULT_ABI,
    functionName: 'myBalance',
    chainId: baseSepolia.id,
    account: address,
    query: { enabled: !!address, refetchInterval: 8_000 },
  });

  const handleDeposit = async () => {
    setStatus(null);
    try {
      if (chainId !== baseSepolia.id) {
        await switchChain({ chainId: baseSepolia.id });
      }
      writeContract({
        address: ADDRESSES.base.vault,
        abi: CONFIDENTIAL_VAULT_ABI,
        functionName: 'deposit',
        value: parseEther(amount),
        chainId: baseSepolia.id,
      });
    } catch (e: any) {
      setStatus({ type: 'error', msg: e.shortMessage || e.message });
    }
  };

  const handleDecrypt = async () => {
    setStatus({ type: 'info', msg: 'Requesting Inco TEE decrypt...' });
    const latId = `inco-decrypt-${Date.now()}`;
    Latency.start(latId, 'Inco TEE Decrypt', 'TEE');
    setDecrypted(null);
    try {
      if (!encryptedHandle || (encryptedHandle as bigint) === 0n) {
        setStatus({ type: 'error', msg: 'Empty handle — make a deposit first' });
        return;
      }

      // Inco SDK: dynamic import (only client-side)
      const { Lightning } = await import('@inco/js/lite');
      const zap = await Lightning.latest('testnet', baseSepolia.id);

      // Convert uint256 → hex32 handle format
      const handleHex = ('0x' + (encryptedHandle as bigint).toString(16).padStart(64, '0')) as `0x${string}`;

      // Get ethereum provider for signature
      const provider = (window as any).ethereum;
      const result = await zap.attestedDecrypt(provider, [handleHex] as any);
      const plaintext = result.toString();

      Latency.end(latId);
      setDecrypted(formatEther(BigInt(plaintext)));
      setStatus({ type: 'success', msg: '✓ Decrypt via Inco TEE successful' });

      // Mark step as done locally (in case bridge is empty)
      if (address) localStorage.setItem(`hermes:depositDone:${address}`, '1');
    } catch (e: any) {
      Latency.error(latId);
      setStatus({ type: 'error', msg: `Decrypt failed: ${e.message?.slice(0, 100)}` });
    }
  };

  if (isSuccess && !status) {
    setStatus({ type: 'success', msg: `✓ Deposited ${amount} ETH — encrypted on Inco TEE` });
    if (address) localStorage.setItem(`hermes:depositDone:${address}`, '1');
    setTimeout(() => refetchHandle(), 2000);
  }

  return (
    <StepCard step={2} chain="BASE" unlocked={unlocked} done={done}
              title="Confidential Vault"
              subtitle="Deposit ETH — balance encrypted by Inco TEE on Base">
      <div className="grid grid-cols-2 gap-3 font-mono text-xs">
        <div>
          <label className="text-[var(--low)] block mb-1">DEPOSIT (ETH)</label>
          <input type="number" step="0.001" min="0.001" value={amount}
                 onChange={(e) => setAmount(e.target.value)} />
        </div>
        <div>
          <div className="text-[var(--low)]">CIPHERTEXT HANDLE</div>
          <div className="text-[var(--c)] text-[10px] break-all">
            {encryptedHandle !== undefined && (encryptedHandle as bigint) > 0n
              ? `${(encryptedHandle as bigint).toString().slice(0, 24)}...`
              : '— deposit to populate —'}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <button className="btn btn-primary" onClick={handleDeposit}
                disabled={isPending || isMining}>
          {isPending ? 'Confirm in wallet...' :
           isMining  ? 'Mining...' :
                       `Deposit ${amount} ETH`}
        </button>
        <button className="btn btn-cyan" onClick={handleDecrypt}
                disabled={!encryptedHandle || (encryptedHandle as bigint) === 0n}>
          🔓 Decrypt via Inco TEE
        </button>
      </div>

      {decrypted && (
        <div className="status status-success">
          🔓 Plaintext balance: <strong>{decrypted} ETH</strong>
        </div>
      )}

      {txHash && (
        <a href={`${EXPLORERS.base}${txHash}`} target="_blank" rel="noopener"
           className="font-mono text-xs text-[var(--c)] underline">
          view tx ↗
        </a>
      )}

      {status && <div className={`status status-${status.type}`}>{status.msg}</div>}
    </StepCard>
  );
}
