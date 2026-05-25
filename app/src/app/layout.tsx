// src/app/layout.tsx
import './globals.css';
import { Providers } from './providers';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'HERMES Protocol — Performant Private DeFi',
  description: 'Multi-chain encrypted DeFi spanning RISE, Inco (Base), and Fhenix. TEE + FHE privacy with live latency monitoring.',
  openGraph: {
    title: 'HERMES Protocol',
    description: 'Performant Private DeFi · RISE · Inco · Fhenix',
    type: 'website',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700;900&family=Share+Tech+Mono&family=Exo+2:wght@300;400;600&display=swap" rel="stylesheet" />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
