// src/components/StepCard.tsx
'use client';

interface StepCardProps {
  step: number;
  title: string;
  subtitle?: string;
  chain: 'RISE' | 'BASE' | 'ARB';
  unlocked: boolean;
  done: boolean;
  children: React.ReactNode;
}

const CHAIN_COLOR: Record<string, string> = {
  RISE: 'var(--c)',
  BASE: 'var(--v)',
  ARB:  'var(--g)',
};

export function StepCard({ step, title, subtitle, chain, unlocked, done, children }: StepCardProps) {
  return (
    <div className="card" style={{ opacity: unlocked ? 1 : 0.4 }}>
      <div className="flex items-start justify-between mb-3 gap-3">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <span className="font-head text-xs text-[var(--low)]">STEP {step}</span>
            <span className="font-mono text-[10px] px-2 py-0.5 rounded"
                  style={{ background: 'rgba(0,229,255,0.1)', color: CHAIN_COLOR[chain] }}>
              {chain}
            </span>
            {done && (
              <span className="font-mono text-[10px] text-[var(--g)]">✓ COMPLETED</span>
            )}
            {!unlocked && (
              <span className="font-mono text-[10px] text-[var(--low)]">🔒 LOCKED</span>
            )}
          </div>
          <h2 className="font-head text-lg">{title}</h2>
          {subtitle && (
            <p className="font-mono text-xs text-[var(--mid)] mt-0.5">{subtitle}</p>
          )}
        </div>
      </div>
      {unlocked && <div className="space-y-3">{children}</div>}
    </div>
  );
}
