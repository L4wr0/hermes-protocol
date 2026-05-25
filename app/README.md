# HERMES Protocol — Frontend + Oracles

Next.js + Wagmi + viem app, with two Vercel functions acting as oracles.
Deploy as a single Vercel project.

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│                    HERMES dApp (this repo)               │
│                                                          │
│  Frontend (Next.js)                                      │
│   • Step 1: Claim HERMES (RISE)                          │
│   • Step 2: Deposit vault + decrypt (Base, Inco SDK)     │
│   • Step 3: Bridge → calls /api/sign-bridge              │
│   • Step 4: Reputation shield/unshield (Arb, Fhenix)     │
│   • Step 5: AMM swap / LP / create pool                  │
│   • Leaderboard (FHE stats, cofhejs)                     │
│                                                          │
│  /api/sign-bridge.ts  Oracle 1 — on-demand POST          │
│   Receives (user, amount, nonce) from frontend           │
│   Signs with ORACLE1_SK                                  │
│                                                          │
│  /api/relay-amm.ts    Oracle 2 — Vercel Cron every 2min  │
│   Polls events on DarkAMM + SpeedAMM                     │
│   Calls EncryptedLeaderboard on Arbitrum                 │
└──────────────────────────────────────────────────────────┘
```

## Setup local

```bash
cd app
npm install
cp .env.example .env.local
# Edit .env.local with your oracle private keys
npm run dev
```

Visit `http://localhost:3000`.

## Deploy on Vercel

### 1. Push to GitHub

```bash
cd app
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/<you>/hermes-app.git
git push -u origin main
```

### 2. Create project on Vercel

Go to https://vercel.com/new, import the repo, accept defaults (Next.js detected automatically).

### 3. Add environment variables in Vercel dashboard

Project → Settings → Environment Variables. Add **all** vars from `.env.example`:

| Var | Value |
|---|---|
| `ORACLE1_SK` | Private key of oracle 1 (bridge signer) |
| `ORACLE2_SK` | Private key of oracle 2 (AMM relayer) |
| `CRON_SECRET` | Click "Generate" or paste a random string |
| `BRIDGE_RISE_ADDR` | `0xa3793C95...` |
| `SPEEDAMM_ADDR` | `0xd8192FE6...` |
| `LEADERBOARD_ADDR` | `0xe8dCdf0A...` |
| `REPUTATION_ADDR` | `0x41d760c4...` |
| `VAULT_BASE_ADDR` | `0x2a94BEfa...` |
| `CHERMES_ADDR` | `0xc7E1b807...` |
| `DARKAMM_ADDR` | `0xDc356bED...` |

Apply to **Production**, **Preview**, **Development**.

### 4. Activate the cron

Cron auto-activates on production deploy. Check Vercel → Crons tab — should show
`relay-amm` running every 2 min.

### 5. Verify

Open the production URL → connect wallet → run through the 5 steps.

```bash
# Oracle 1 health check
curl -X POST https://<your-project>.vercel.app/api/sign-bridge \
  -H 'Content-Type: application/json' \
  -d '{"user":"0xYourAddress","amount":"100000000000000000","nonce":"0"}'
# Should return: { "signature": "0x...", "signer": "0x537F...", "messageHash": "0x..." }
```

## Known limitations (v1)

- **Step 2 progress tracking**: relies on `localStorage` + on-chain `collateral` check. If user clears localStorage before bridging, the UI may regress. Production should use a backend KV.
- **DarkAMM "Dark" mode**: removed from v1 (FHE math on `e.mul`/`e.div` requires Inco's `EncryptedInput.verifyInput` API integration — TODO).
- **Leaderboard FHE decrypt**: stats are encrypted handles. `cofhejs.unseal()` integration is partial — the "Decrypt my stats" button shows a placeholder until the cofhejs init flow is fully wired.
- **Oracle 2 state**: in-memory cursor, resets on cold starts. For production switch to `@vercel/kv`.
- **No DarkAMM events for liquidity/swap**: stub. Add when DarkAMM proves stable on testnet.

## Updating after a contract redeploy

1. Update addresses in `src/lib/config.ts` (`ADDRESSES.*`)
2. Update `.env.example` and Vercel env vars
3. Redeploy on Vercel (auto on `git push`)
