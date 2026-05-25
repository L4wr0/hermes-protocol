// src/lib/wagmi.ts
// Wagmi config with RISE Wallet native connector + injected fallback.
// RISE Wallet: passkey login, gasless (paymaster), session keys, 3ms shreds.
// MetaMask/injected: fallback for Base Sepolia and Arbitrum Sepolia.

import { createConfig, http } from 'wagmi';
import { injected } from 'wagmi/connectors';
import { riseTestnet, baseSepolia, arbitrumSepolia } from './config';

// Lazy-load rise-wallet connector to avoid SSR issues
let riseWalletConnector: any = null;
async function getRiseConnector() {
  if (riseWalletConnector) return riseWalletConnector;
  try {
    const { riseWallet, RiseWallet } = await import('rise-wallet/wagmi');
    riseWalletConnector = riseWallet(RiseWallet.defaultConfig);
    return riseWalletConnector;
  } catch {
    return null; // fallback to injected if rise-wallet not installed yet
  }
}

export { getRiseConnector };

export const wagmiConfig = createConfig({
  chains: [riseTestnet, baseSepolia, arbitrumSepolia],
  connectors: [
    injected(), // MetaMask + any EIP-6963 wallet (including RISE Wallet extension)
  ],
  transports: {
    [riseTestnet.id]:     http('https://testnet.riselabs.xyz'),
    [baseSepolia.id]:     http('https://sepolia.base.org'),
    [arbitrumSepolia.id]: http('https://sepolia-rollup.arbitrum.io/rpc'),
  },
  ssr: false,
});

// RISE Wallet connector ID (EIP-6963 RDNS)
export const RISE_WALLET_RDNS = 'com.risechain.wallet';

// Session key storage helpers
export const SessionStore = {
  save(address: string, privateKey: string, publicKey: string, expiry: number) {
    const key = `hermes:session:${address}`;
    localStorage.setItem(key, JSON.stringify({ privateKey, publicKey, expiry }));
  },
  load(address: string): { privateKey: string; publicKey: string; expiry: number } | null {
    try {
      const raw = localStorage.getItem(`hermes:session:${address}`);
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (Date.now() / 1000 > data.expiry) {
        localStorage.removeItem(`hermes:session:${address}`);
        return null;
      }
      return data;
    } catch { return null; }
  },
  clear(address: string) {
    localStorage.removeItem(`hermes:session:${address}`);
  },
};
