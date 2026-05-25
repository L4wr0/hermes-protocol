// src/components/LatencyMonitor.tsx
// Live latency monitor — measures and displays real cross-chain operation timing.
// Shows the fundamental difference between TEE (Inco), FHE (Fhenix), and RISE shreds.
'use client';

import { useEffect, useRef, useState } from 'react';

export type LatencyEntry = {
  id: string;
  label: string;
  tech: 'TEE' | 'FHE' | 'SHRED' | 'BRIDGE' | 'ORACLE';
  startedAt: number;
  endedAt?: number;
  status: 'running' | 'done' | 'error';
};

// Global event bus for recording latency from anywhere in the app
type LatencyEvent =
  | { type: 'start'; id: string; label: string; tech: LatencyEntry['tech'] }
  | { type: 'end';   id: string }
  | { type: 'error'; id: string };

const listeners = new Set<(e: LatencyEvent) => void>();

export const Latency = {
  start(id: string, label: string, tech: LatencyEntry['tech']) {
    listeners.forEach(fn => fn({ type: 'start', id, label, tech }));
  },
  end(id: string) {
    listeners.forEach(fn => fn({ type: 'end', id }));
  },
  error(id: string) {
    listeners.forEach(fn => fn({ type: 'error', id }));
  },
};

// Tech colors + descriptions
const TECH_META: Record<LatencyEntry['tech'], { color: string; bg: string; desc: string }> = {
  TEE:    { color: '#00e5ff', bg: 'rgba(0,229,255,.12)',  desc: 'Inco TEE · hardware trust' },
  FHE:    { color: '#a87fff', bg: 'rgba(123,47,255,.12)', desc: 'Fhenix CoFHE · math trust' },
  SHRED:  { color: '#00ff9d', bg: 'rgba(0,255,157,.12)',  desc: 'RISE Shred · 3ms confirm' },
  BRIDGE: { color: '#ffcc00', bg: 'rgba(255,204,0,.12)',  desc: 'Oracle relay · cross-chain' },
  ORACLE: { color: '#ff9d00', bg: 'rgba(255,157,0,.12)',  desc: 'Oracle signature · ECDSA' },
};

// Max bar width reference (slowest expected: FHE ~60s)
const MAX_MS = 62000;

function Bar({ entry }: { entry: LatencyEntry }) {
  const [now, setNow] = useState(Date.now());
  const meta = TECH_META[entry.tech];

  useEffect(() => {
    if (entry.status !== 'running') return;
    const iv = setInterval(() => setNow(Date.now()), 80);
    return () => clearInterval(iv);
  }, [entry.status]);

  const elapsed = (entry.endedAt ?? now) - entry.startedAt;
  const pct = Math.min((elapsed / MAX_MS) * 100, 100);
  const secs = (elapsed / 1000).toFixed(entry.status === 'running' ? 1 : 2);

  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {entry.status === 'running' && (
            <span style={{
              display: 'inline-block', width: 7, height: 7, borderRadius: '50%',
              background: meta.color, animation: 'pulse 1s infinite'
            }} />
          )}
          {entry.status === 'done' && <span style={{ color: '#00ff9d', fontSize: 12 }}>✓</span>}
          {entry.status === 'error' && <span style={{ color: '#ff5277', fontSize: 12 }}>✗</span>}
          <span style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: 11, color: '#e2ecff' }}>
            {entry.label}
          </span>
          <span style={{
            fontFamily: "'Share Tech Mono', monospace", fontSize: 9,
            padding: '2px 6px', borderRadius: 4,
            background: meta.bg, color: meta.color,
          }}>
            {entry.tech}
          </span>
        </div>
        <span style={{
          fontFamily: "'Orbitron', monospace", fontSize: 12, fontWeight: 700,
          color: entry.status === 'error' ? '#ff5277' : meta.color,
          minWidth: 52, textAlign: 'right',
        }}>
          {entry.status === 'error' ? 'ERR' : `${secs}s`}
        </span>
      </div>
      <div style={{ background: 'rgba(255,255,255,.06)', borderRadius: 4, height: 4, overflow: 'hidden' }}>
        <div style={{
          height: '100%', borderRadius: 4,
          width: `${pct}%`,
          background: entry.status === 'error'
            ? '#ff5277'
            : `linear-gradient(90deg, ${meta.color}88, ${meta.color})`,
          transition: entry.status === 'running' ? 'width .08s linear' : 'none',
        }} />
      </div>
    </div>
  );
}

export function LatencyMonitor() {
  const [entries, setEntries] = useState<LatencyEntry[]>([]);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const handler = (e: LatencyEvent) => {
      setEntries(prev => {
        if (e.type === 'start') {
          const existing = prev.find(x => x.id === e.id);
          if (existing) return prev;
          return [...prev.slice(-7), { // keep last 8
            id: e.id, label: e.label, tech: e.tech,
            startedAt: Date.now(), status: 'running',
          }];
        }
        return prev.map(x =>
          x.id !== e.id ? x :
          { ...x, endedAt: Date.now(), status: e.type === 'end' ? 'done' : 'error' }
        );
      });
    };
    listeners.add(handler);
    return () => { listeners.delete(handler); };
  }, []);

  const hasData = entries.length > 0;
  const running = entries.filter(e => e.status === 'running').length;

  return (
    <div style={{
      background: '#070d1c',
      border: '1px solid rgba(0,229,255,.12)',
      borderRadius: 14,
      marginBottom: 14,
      overflow: 'hidden',
      transition: 'all .3s',
    }}>
      {/* Header */}
      <div
        onClick={() => setCollapsed(c => !c)}
        style={{
          padding: '12px 16px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          cursor: 'pointer',
          borderBottom: collapsed ? 'none' : '1px solid rgba(0,229,255,.08)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontFamily: "'Orbitron', sans-serif", fontSize: 11, color: '#00e5ff', letterSpacing: '.12em' }}>
            ⏱ LATENCY MONITOR
          </span>
          {running > 0 && (
            <span style={{
              fontFamily: "'Share Tech Mono', monospace", fontSize: 10,
              padding: '2px 8px', borderRadius: 4,
              background: 'rgba(255,204,0,.1)', color: '#ffcc00',
              border: '1px solid rgba(255,204,0,.2)',
            }}>
              {running} running
            </span>
          )}
          {!hasData && (
            <span style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: 10, color: '#3a5070' }}>
              waiting for actions…
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {hasData && !collapsed && (
            <span
              onClick={e => { e.stopPropagation(); setEntries([]); }}
              style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: 10, color: '#3a5070', cursor: 'pointer' }}
            >
              clear
            </span>
          )}
          <span style={{ color: '#3a5070', fontSize: 12 }}>{collapsed ? '▼' : '▲'}</span>
        </div>
      </div>

      {/* Entries */}
      {!collapsed && (
        <div style={{ padding: '14px 16px' }}>
          {!hasData ? (
            // Legend when empty
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {(Object.entries(TECH_META) as [LatencyEntry['tech'], typeof TECH_META[keyof typeof TECH_META]][]).map(([tech, m]) => (
                <div key={tech} style={{
                  background: m.bg, borderRadius: 8, padding: '8px 10px',
                  border: `1px solid ${m.color}22`,
                }}>
                  <div style={{ fontFamily: "'Orbitron', sans-serif", fontSize: 10, color: m.color, letterSpacing: '.08em' }}>{tech}</div>
                  <div style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: 10, color: '#7a9acb', marginTop: 2 }}>{m.desc}</div>
                </div>
              ))}
            </div>
          ) : (
            entries.map(e => <Bar key={e.id} entry={e} />)
          )}
        </div>
      )}

      <style>{`
        @keyframes pulse {
          0%,100% { opacity:1; transform:scale(1); }
          50%      { opacity:.4; transform:scale(.7); }
        }
      `}</style>
    </div>
  );
}
