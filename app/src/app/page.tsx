// src/app/page.tsx — HERMES Protocol Landing Page
'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';

// ── Animated counter ──────────────────────────────────────────
function Counter({ to, suffix = '', decimals = 0 }: { to: number; suffix?: string; decimals?: number }) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    const dur = 1800;
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min((now - start) / dur, 1);
      const ease = 1 - Math.pow(1 - p, 3);
      setVal(to * ease);
      if (p < 1) requestAnimationFrame(tick);
      else setVal(to);
    };
    requestAnimationFrame(tick);
  }, [to]);
  return <>{val.toFixed(decimals)}{suffix}</>;
}

// ── Caduceus SVG logo ─────────────────────────────────────────
function CaduceusLogo({ size = 280 }: { size?: number }) {
  return (
    <div style={{ position: 'relative', width: size, height: size * 1.1, margin: '0 auto' }}>
      {/* Outer glow ring */}
      <div style={{
        position: 'absolute', inset: 0,
        borderRadius: '50%',
        background: 'radial-gradient(ellipse, rgba(74,255,110,.08) 0%, rgba(0,232,216,.04) 50%, transparent 70%)',
        animation: 'breathe 4s ease-in-out infinite',
      }} />
      {/* Logo image — user's uploaded logo */}
      <img
        src="/hermes-logo.png"
        alt="HERMES Caduceus"
        style={{ width: '100%', height: '100%', objectFit: 'contain', position: 'relative', zIndex: 1 }}
        onError={(e) => {
          // Fallback if image not found: show text logo
          (e.target as HTMLImageElement).style.display = 'none';
        }}
      />
      {/* Fallback text mark (shown if image fails) */}
      <div style={{
        position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexDirection: 'column', gap: 8,
      }}>
        <div style={{
          fontFamily: "'Orbitron', sans-serif",
          fontSize: size * 0.22, fontWeight: 900,
          background: 'linear-gradient(180deg, #4aff6e, #00e8d8)',
          WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
          letterSpacing: '.2em',
        }}>H</div>
        <div style={{ display: 'flex', gap: 10, fontFamily: "'Share Tech Mono', monospace", fontSize: 10 }}>
          <span style={{ color: '#4aff6e' }}>• RISE</span>
          <span style={{ color: '#1a8fff' }}>/// INCO</span>
          <span style={{ color: '#00e8d8' }}>* FHENIX</span>
        </div>
      </div>
      <style>{`@keyframes breathe { 0%,100%{transform:scale(1);opacity:.8} 50%{transform:scale(1.08);opacity:1} }`}</style>
    </div>
  );
}

// ── Tech badge ────────────────────────────────────────────────
function TechBadge({ symbol, name, color, desc }: { symbol: string; name: string; color: string; desc: string }) {
  return (
    <div style={{
      background: `${color}08`,
      border: `1px solid ${color}22`,
      borderRadius: 14, padding: '20px 18px',
      transition: 'all .3s',
      cursor: 'default',
    }}
    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = `${color}12`; (e.currentTarget as HTMLElement).style.borderColor = `${color}44`; }}
    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = `${color}08`; (e.currentTarget as HTMLElement).style.borderColor = `${color}22`; }}
    >
      <div style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: 13, color, marginBottom: 8 }}>{symbol}</div>
      <div style={{ fontFamily: "'Orbitron', sans-serif", fontSize: 14, color, fontWeight: 700, marginBottom: 6 }}>{name}</div>
      <div style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: 11, color: '#6a9a7a', lineHeight: 1.5 }}>{desc}</div>
    </div>
  );
}

// ── Feature card ─────────────────────────────────────────────
function FeatureCard({ icon, title, body, accent }: { icon: string; title: string; body: string; accent: string }) {
  return (
    <div style={{
      background: '#0f1c14', border: `1px solid ${accent}18`,
      borderRadius: 16, padding: '24px 20px',
      position: 'relative', overflow: 'hidden',
    }}>
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 2,
        background: `linear-gradient(90deg, transparent, ${accent}, transparent)`,
        opacity: .5,
      }} />
      <div style={{ fontSize: 28, marginBottom: 12 }}>{icon}</div>
      <div style={{ fontFamily: "'Orbitron', sans-serif", fontSize: 13, fontWeight: 700,
                    color: accent, marginBottom: 8, letterSpacing: '.06em' }}>{title}</div>
      <div style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: 11,
                    color: '#6a9a7a', lineHeight: 1.6 }}>{body}</div>
    </div>
  );
}

// ── Step indicator ────────────────────────────────────────────
function MissionStep({ n, label, sub, color }: { n: number; label: string; sub: string; color: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
      <div style={{
        width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
        background: `${color}15`, border: `1px solid ${color}40`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: "'Orbitron', sans-serif", fontSize: 13, fontWeight: 700, color,
      }}>{n}</div>
      <div>
        <div style={{ fontFamily: "'Orbitron', sans-serif", fontSize: 13, color, marginBottom: 3 }}>{label}</div>
        <div style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: 11, color: '#6a9a7a' }}>{sub}</div>
      </div>
    </div>
  );
}

// ── Main landing ──────────────────────────────────────────────
export default function Landing() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 40);
    window.addEventListener('scroll', fn);
    return () => window.removeEventListener('scroll', fn);
  }, []);

  return (
    <div style={{ position: 'relative', zIndex: 1, overflowX: 'hidden' }}>

      {/* ── NAV ── */}
      <nav style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
        padding: '14px 24px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: scrolled ? 'rgba(8,15,11,.9)' : 'transparent',
        backdropFilter: scrolled ? 'blur(12px)' : 'none',
        borderBottom: scrolled ? '1px solid rgba(74,255,110,.08)' : 'none',
        transition: 'all .4s',
      }}>
        <div style={{ fontFamily: "'Orbitron', sans-serif", fontSize: 16, fontWeight: 900,
                      background: 'linear-gradient(135deg, #4aff6e, #00e8d8)',
                      WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
          HERMES
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <a href="https://github.com/r7kjrqm9vk-debug/Hermes" target="_blank" rel="noopener"
             style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: 11,
                      color: '#6a9a7a', textDecoration: 'none', padding: '8px 14px' }}>
            GitHub
          </a>
          <Link href="/app"
            style={{
              fontFamily: "'Orbitron', sans-serif", fontSize: 11, fontWeight: 700,
              letterSpacing: '.1em', padding: '10px 20px',
              borderRadius: 10, textDecoration: 'none',
              background: 'linear-gradient(135deg, #4aff6e, #1acc44)',
              color: '#060e08',
              boxShadow: '0 0 20px rgba(74,255,110,.25)',
            }}>
            LAUNCH APP
          </Link>
        </div>
      </nav>

      {/* ── HERO ── */}
      <section style={{
        minHeight: '100vh',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        padding: '100px 24px 60px', textAlign: 'center',
        position: 'relative',
      }}>
        {/* Background circuit glow */}
        <div style={{
          position: 'absolute', inset: 0,
          background: 'radial-gradient(ellipse at 50% 60%, rgba(74,255,110,.06) 0%, transparent 65%)',
          pointerEvents: 'none',
        }} />

        <CaduceusLogo size={260} />

        <div style={{ marginTop: 32, marginBottom: 16 }}>
          <h1 style={{
            fontFamily: "'Orbitron', sans-serif",
            fontSize: 'clamp(36px, 8vw, 72px)',
            fontWeight: 900, letterSpacing: '.18em',
            background: 'linear-gradient(135deg, #4aff6e 0%, #00e8d8 50%, #1a8fff 100%)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
            lineHeight: 1.1, marginBottom: 12,
          }}>
            HERMES
          </h1>
          <p style={{
            fontFamily: "'Orbitron', sans-serif",
            fontSize: 'clamp(11px, 2vw, 14px)',
            letterSpacing: '.35em', color: '#6a9a7a',
            textTransform: 'uppercase',
          }}>
            Performant Private DeFi
          </p>
        </div>

        <p style={{
          fontFamily: "'Share Tech Mono', monospace",
          fontSize: 'clamp(13px, 2.5vw, 16px)',
          color: '#8ab89a', maxWidth: 520, lineHeight: 1.7,
          margin: '20px auto 36px',
        }}>
          The first multi-chain protocol where privacy is measurable.<br />
          TEE meets FHE — Inco, Fhenix, and RISE working as one.
        </p>

        {/* Tech pills */}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center', marginBottom: 44 }}>
          {[
            { label: '• RISE', color: '#4aff6e' },
            { label: '/// INCO', color: '#1a8fff' },
            { label: '* FHENIX', color: '#00e8d8' },
          ].map(t => (
            <span key={t.label} style={{
              fontFamily: "'Share Tech Mono', monospace", fontSize: 12,
              color: t.color, padding: '6px 14px',
              background: `${t.color}12`, borderRadius: 20,
              border: `1px solid ${t.color}30`, letterSpacing: '.08em',
            }}>{t.label}</span>
          ))}
        </div>

        {/* CTA */}
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
          <Link href="/app" style={{
            fontFamily: "'Orbitron', sans-serif", fontSize: 13, fontWeight: 700,
            letterSpacing: '.12em', padding: '16px 36px',
            borderRadius: 12, textDecoration: 'none',
            background: 'linear-gradient(135deg, #4aff6e, #00e8d8)',
            color: '#060e08',
            boxShadow: '0 8px 32px rgba(74,255,110,.3)',
            transition: 'all .3s',
          }}>
            LAUNCH APP →
          </Link>
          <a href="https://github.com/r7kjrqm9vk-debug/Hermes" target="_blank" rel="noopener"
             style={{
               fontFamily: "'Orbitron', sans-serif", fontSize: 13, fontWeight: 700,
               letterSpacing: '.12em', padding: '16px 36px',
               borderRadius: 12, textDecoration: 'none',
               background: 'transparent',
               border: '1px solid rgba(74,255,110,.3)',
               color: '#4aff6e',
               transition: 'all .3s',
             }}>
            VIEW CODE
          </a>
        </div>

        {/* Scroll hint */}
        <div style={{
          position: 'absolute', bottom: 30, left: '50%', transform: 'translateX(-50%)',
          fontFamily: "'Share Tech Mono', monospace", fontSize: 10,
          color: '#2a4a34', letterSpacing: '.2em',
          animation: 'bounce 2s ease-in-out infinite',
        }}>▼ SCROLL</div>
      </section>

      {/* ── STATS ── */}
      <section style={{
        padding: '40px 24px',
        borderTop: '1px solid rgba(74,255,110,.08)',
        borderBottom: '1px solid rgba(74,255,110,.08)',
      }}>
        <div style={{ maxWidth: 900, margin: '0 auto',
                      display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px,1fr))', gap: 24 }}>
          {[
            { val: 3, suffix: 'ms', label: 'RISE Shred confirm', color: '#4aff6e', decimals: 0 },
            { val: 5, suffix: 's',  label: 'Inco TEE decrypt',   color: '#1a8fff', decimals: 0 },
            { val: 45, suffix: 's', label: 'Fhenix FHE decrypt', color: '#00e8d8', decimals: 0 },
            { val: 3, suffix: '',   label: 'Chains unified',     color: '#e8e0c0', decimals: 0 },
          ].map(s => (
            <div key={s.label} style={{ textAlign: 'center' }}>
              <div style={{
                fontFamily: "'Orbitron', sans-serif",
                fontSize: 'clamp(28px, 5vw, 44px)', fontWeight: 900, color: s.color,
                textShadow: `0 0 20px ${s.color}50`,
              }}>
                <Counter to={s.val} suffix={s.suffix} decimals={s.decimals} />
              </div>
              <div style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: 10,
                            color: '#2a4a34', letterSpacing: '.12em', marginTop: 4 }}>
                {s.label}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── TECH STACK ── */}
      <section style={{ maxWidth: 900, margin: '0 auto', padding: '80px 24px' }}>
        <div style={{ textAlign: 'center', marginBottom: 48 }}>
          <div style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: 11,
                        color: '#4aff6e', letterSpacing: '.3em', marginBottom: 12 }}>TECHNOLOGY</div>
          <h2 style={{ fontFamily: "'Orbitron', sans-serif", fontSize: 'clamp(20px, 4vw, 32px)',
                       fontWeight: 700, color: '#d8eed8' }}>
            Three chains. One protocol.
          </h2>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px,1fr))', gap: 16 }}>
          <TechBadge
            symbol="• RISE"
            name="Speed Layer"
            color="#4aff6e"
            desc="3ms shred confirmations. Session key gasless UX. SpeedAMM for instant trading with passkey auth."
          />
          <TechBadge
            symbol="/// INCO"
            name="TEE Privacy"
            color="#1a8fff"
            desc="Hardware-attested encryption. Your vault balance stays encrypted on-chain. DarkAMM with Public & Stealth modes."
          />
          <TechBadge
            symbol="* FHENIX"
            name="FHE Reputation"
            color="#00e8d8"
            desc="Fully Homomorphic Encryption for scores and leaderboard. Shield & unshield via async co-processor — math-only trust."
          />
        </div>
      </section>

      {/* ── FEATURES ── */}
      <section style={{
        background: '#0c1610',
        borderTop: '1px solid rgba(74,255,110,.08)',
        borderBottom: '1px solid rgba(74,255,110,.08)',
        padding: '80px 24px',
      }}>
        <div style={{ maxWidth: 900, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 48 }}>
            <div style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: 11,
                          color: '#00e8d8', letterSpacing: '.3em', marginBottom: 12 }}>FEATURES</div>
            <h2 style={{ fontFamily: "'Orbitron', sans-serif", fontSize: 'clamp(20px, 4vw, 32px)',
                         fontWeight: 700, color: '#d8eed8' }}>
              Privacy you can measure
            </h2>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
            <FeatureCard icon="⏱" accent="#4aff6e" title="Live Latency Monitor"
              body="Every operation is timed. See the real cost of privacy: TEE vs FHE vs RISE shred — live, in your browser." />
            <FeatureCard icon="🌑" accent="#1a8fff" title="DarkAMM"
              body="Swap ETH ↔ cHERMES with encrypted LP positions. Choose Public (fast) or Stealth (private) per trade." />
            <FeatureCard icon="⚡" accent="#4aff6e" title="SpeedAMM"
              body="3ms RISE shred confirmations. Session keys for gasless, popup-free swaps. HERMES/ETH pool live." />
            <FeatureCard icon="🔒" accent="#00e8d8" title="Shield / Unshield"
              body="FHE reputation scores. Encrypt your rank on-chain, reveal it with a 30s async co-processor decrypt." />
            <FeatureCard icon="🌉" accent="#1a8fff" title="Dark Bridge"
              body="Move encrypted ETH from Base to RISE via oracle signature. Privacy maintained across the bridge." />
            <FeatureCard icon="🏆" accent="#00e8d8" title="FHE Leaderboard"
              body="Trade, LP, create markets → earn encrypted XP. Your rank is public, your stats stay private." />
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section style={{ maxWidth: 700, margin: '0 auto', padding: '80px 24px' }}>
        <div style={{ textAlign: 'center', marginBottom: 48 }}>
          <div style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: 11,
                        color: '#4aff6e', letterSpacing: '.3em', marginBottom: 12 }}>MISSION</div>
          <h2 style={{ fontFamily: "'Orbitron', sans-serif", fontSize: 'clamp(20px, 4vw, 32px)',
                       fontWeight: 700, color: '#d8eed8' }}>
            Five steps to full privacy
          </h2>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 28, position: 'relative' }}>
          {/* Vertical line */}
          <div style={{
            position: 'absolute', left: 17, top: 36, bottom: 36,
            width: 1,
            background: 'linear-gradient(180deg, #4aff6e44, #1a8fff44, #00e8d844, transparent)',
          }} />
          <MissionStep n={1} color="#4aff6e" label="Claim HERMES on RISE"
            sub="Passkey login. Gasless faucet drips 1,000 HERMES every 24h." />
          <MissionStep n={2} color="#1a8fff" label="Deposit to Inco Vault"
            sub="ETH encrypted by TEE on Base. Decrypt with hardware attestation." />
          <MissionStep n={3} color="#1a8fff" label="Dark Bridge to RISE"
            sub="Oracle relays encrypted proof. ETH lands in your RISE wallet." />
          <MissionStep n={4} color="#00e8d8" label="Claim Reputation (Fhenix)"
            sub="Shield score → FHE encrypted. Unshield → async co-processor decrypt." />
          <MissionStep n={5} color="#4aff6e" label="Trade on Dark & Speed AMM"
            sub="Create pools. Add liquidity. Swap. Every action earns encrypted XP." />
        </div>
      </section>

      {/* ── CTA FINALE ── */}
      <section style={{
        textAlign: 'center', padding: '80px 24px 100px',
        background: 'radial-gradient(ellipse at 50% 100%, rgba(74,255,110,.07) 0%, transparent 65%)',
        borderTop: '1px solid rgba(74,255,110,.08)',
      }}>
        <h2 style={{
          fontFamily: "'Orbitron', sans-serif",
          fontSize: 'clamp(24px, 5vw, 42px)', fontWeight: 900,
          color: '#d8eed8', marginBottom: 16, letterSpacing: '.08em',
        }}>
          Ready to trade in the dark?
        </h2>
        <p style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: 13,
                    color: '#6a9a7a', marginBottom: 40 }}>
          Connect with passkey. No seed phrase. No gas. Just privacy.
        </p>
        <Link href="/app" style={{
          fontFamily: "'Orbitron', sans-serif", fontSize: 14, fontWeight: 700,
          letterSpacing: '.14em', padding: '18px 48px',
          borderRadius: 14, textDecoration: 'none', display: 'inline-block',
          background: 'linear-gradient(135deg, #4aff6e, #00e8d8)',
          color: '#060e08',
          boxShadow: '0 12px 40px rgba(74,255,110,.3)',
          transition: 'all .3s',
        }}>
          LAUNCH APP →
        </Link>
        <div style={{ marginTop: 48, display: 'flex', gap: 6, justifyContent: 'center',
                      fontFamily: "'Share Tech Mono', monospace", fontSize: 10, color: '#2a4a34' }}>
          <span>• RISE testnet</span>
          <span>·</span>
          <span>/// INCO Base Sepolia</span>
          <span>·</span>
          <span>* FHENIX Arbitrum Sepolia</span>
        </div>
      </section>

      <style>{`
        @keyframes bounce { 0%,100%{transform:translateX(-50%) translateY(0)} 50%{transform:translateX(-50%) translateY(8px)} }
        a:hover { opacity: .85; }
      `}</style>
    </div>
  );
}
