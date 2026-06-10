# Full House

A play-money virtual-chip casino running as a Telegram Mini App. Players bet with virtual chips on provably-fair games — no real money, no purchases, no cashouts.

## Stack

- **Backend:** Cloudflare Worker + D1 (SQLite), TypeScript
- **Frontend:** React + Vite + TypeScript
- **Architecture:** monorepo with `worker/` and `web/` workspaces

## Games

- **Dice** — roll under/over a target on a 0–99 range with configurable risk and 1% house edge
- **Coin Flip** — 50/50 heads or tails at 1.98x payout
- **Roulette** — European roulette (0–36) with straight, color, parity, range, and dozen bets
- **Mines** — pick tiles on a 5x5 grid, avoid hidden mines; more picks = higher multiplier

## Features

- **Atomic wallet** — all balance changes go through a single debit/credit function backed by D1 batch transactions; no double-spend, no negative balances
- **Provably-fair RNG** — HMAC-SHA256 commit–reveal scheme; server seed hash published before the bet, outcome verifiable by the player
- **Telegram auth** — `initData` signature validation with automatic user provisioning and 10,000 starting chips
- **Daily bonus** — claim chips once per day with a streak multiplier
- **Game history** — queryable log of all bets and outcomes
- **Leaderboard** — top players by balance
- **Structured analytics** — every auth, bet, and balance change recorded as audit events
- **Dev mode** — automatic auth bypass for local browser testing without Telegram

## Local development

```bash
npm install

# Apply D1 migrations locally
cd worker && npx wrangler d1 migrations apply fullhouse-db --local && cd ..

# Start both servers (frontend on :5173, API on :8787)
npm run dev
```

Dev mode is enabled by default in `wrangler.toml` (`DEV_MODE = "true"`), which bypasses Telegram auth and provisions a test user automatically. Open http://localhost:5173 in a browser to play.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start both frontend and Worker dev servers |
| `npm run dev:web` | Start the Vite dev server only |
| `npm run dev:worker` | Start the Cloudflare Worker dev server only |
| `npm run typecheck` | Run TypeScript type checking across all workspaces |
| `npm run lint` | Run ESLint |
| `npm test` | Run the full test suite |
| `npm run build` | Build all workspaces |

## Project structure

```
├── worker/                  # Cloudflare Worker (API)
│   ├── src/
│   │   ├── games/           # Game registry and modules
│   │   │   ├── contract.ts  # Game module interface
│   │   │   ├── registry.ts  # Game registration
│   │   │   ├── dice.ts      # Dice game
│   │   │   ├── coinflip.ts  # Coin flip game
│   │   │   ├── roulette.ts  # Roulette game
│   │   │   └── mines.ts     # Mines game
│   │   ├── services/        # Core services
│   │   │   ├── wallet.ts    # Atomic balance operations
│   │   │   ├── rng.ts       # Provably-fair RNG
│   │   │   ├── auth.ts      # Telegram auth
│   │   │   ├── round.ts     # Game round orchestration
│   │   │   ├── audit.ts     # Audit event writer
│   │   │   ├── analytics.ts # Structured event tracking
│   │   │   ├── history.ts   # Game history queries
│   │   │   ├── leaderboard.ts
│   │   │   └── daily-bonus.ts
│   │   └── index.ts         # Worker entry point and routes
│   └── migrations/          # D1 SQL migrations
├── web/                     # React frontend (Telegram Mini App)
│   └── src/
│       ├── components/      # Game screens and UI
│       ├── api.ts           # API client
│       └── theme.ts         # Design tokens + Telegram theme
└── package.json             # Root workspace config
```

## API endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/health` | Health check |
| `GET` | `/api/games` | List available games |
| `GET` | `/api/me` | Get authenticated user info and balance |
| `POST` | `/api/play` | Place a bet and play a round |
| `POST` | `/api/verify` | Verify a fairness proof |
| `GET` | `/api/history` | Get bet history |
| `GET` | `/api/leaderboard` | Get top players |
| `POST` | `/api/daily-bonus` | Claim daily bonus chips |

## Provably-fair verification

Every round returns a fairness proof containing the server seed, its pre-committed hash, the client seed, nonce, and the HMAC used to derive the roll. Players can independently verify:

1. The server seed hashes to the commitment published before the bet
2. The HMAC of (server seed, client seed, nonce) reproduces the same roll
3. Any tampering to any parameter causes verification to fail

## Testing

```bash
npm test
```

84 tests covering wallet atomicity (including parallel race conditions), RNG determinism and tamper detection, auth validation, game logic for all four games, and end-to-end round integration.
