# Full House

A play-money virtual-chip casino running as a Telegram Mini App. Players bet with virtual chips on provably-fair games — no real money, no purchases, no cashouts.

## Stack

- **Backend:** Cloudflare Worker + D1 (SQLite), TypeScript
- **Frontend:** React + Vite + TypeScript
- **Architecture:** monorepo with `worker/` and `web/` workspaces

## Features

- **Dice game** — roll under/over a target on a 0–99 range with configurable risk and 1% house edge
- **Atomic wallet** — all balance changes go through a single debit/credit function backed by D1 batch transactions; no double-spend, no negative balances
- **Provably-fair RNG** — HMAC-SHA256 commit–reveal scheme; server seed hash published before the bet, outcome verifiable by the player
- **Telegram auth** — `initData` signature validation with automatic user provisioning and 10,000 starting chips
- **Structured analytics** — every auth, bet, and balance change recorded as queryable audit events
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
├── worker/              # Cloudflare Worker (API)
│   ├── src/
│   │   ├── games/       # Game registry and modules (dice)
│   │   ├── services/    # Wallet, RNG, auth, audit, analytics
│   │   └── index.ts     # Worker entry point and routes
│   └── migrations/      # D1 SQL migrations
├── web/                 # React frontend (Telegram Mini App)
│   └── src/
│       ├── components/  # UI components (DiceGame)
│       ├── api.ts       # API client
│       └── theme.ts     # Design tokens + Telegram theme integration
└── package.json         # Root workspace config
```

## API endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/health` | Health check |
| `GET` | `/api/me` | Get authenticated user info and balance |
| `POST` | `/api/play` | Place a bet and play a round |
| `POST` | `/api/verify` | Verify a fairness proof |

Authenticated endpoints require the `X-Init-Data` header with Telegram `initData`, or dev mode enabled.

## Provably-fair verification

Every round returns a fairness proof containing the server seed, its pre-committed hash, the client seed, nonce, and the HMAC used to derive the roll. Players can independently verify:

1. The server seed hashes to the commitment published before the bet
2. The HMAC of (server seed, client seed, nonce) reproduces the same roll
3. Any tampering to any parameter causes verification to fail

## Testing

```bash
npm test
```

57 tests covering wallet atomicity (including parallel race conditions), RNG determinism and tamper detection, auth validation, game logic, and end-to-end round integration.
