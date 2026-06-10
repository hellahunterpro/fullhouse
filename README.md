# Full House

A play-money virtual-chip casino running as a Telegram Mini App. Players bet with virtual chips on provably-fair games — no real money, no purchases, no cashouts.

## Stack

- **Backend:** Cloudflare Worker + D1 (SQLite), TypeScript
- **Frontend:** React + Vite + TypeScript
- **Architecture:** monorepo with `worker/` and `web/` workspaces

## Features (Stage 0)

- **Dice game** — roll under/over a target on a 0–99 range with configurable risk
- **Atomic wallet** — all balance changes go through a single debit/credit function backed by D1 batch transactions; no double-spend, no negative balances
- **Provably-fair RNG** — HMAC-SHA256 commit–reveal scheme; server seed hash published before the bet, outcome verifiable by the player
- **Telegram auth** — `initData` signature validation with automatic user provisioning and starting chip balance
- **Structured analytics** — every auth, bet, and balance change recorded as queryable audit events

## Local development

```bash
npm install

# Start the frontend dev server (port 5173)
npm run dev

# Start the Worker dev server (port 8787)
npm run dev:worker

# Apply D1 migrations locally
cd worker && npx wrangler d1 migrations apply fullhouse-db --local
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start the Vite dev server |
| `npm run dev:worker` | Start the Cloudflare Worker dev server |
| `npm run typecheck` | Run TypeScript type checking across all workspaces |
| `npm run lint` | Run ESLint |
| `npm test` | Run the full test suite |
| `npm run build` | Build all workspaces |

## Project structure

```
├── worker/              # Cloudflare Worker (API)
│   ├── src/
│   │   ├── games/       # Game registry and modules (dice)
│   │   ├── services/    # Wallet, RNG, auth, analytics
│   │   └── index.ts     # Worker entry point and routes
│   └── migrations/      # D1 SQL migrations
├── web/                 # React frontend (Telegram Mini App)
│   └── src/
│       ├── components/  # UI components (DiceGame)
│       └── api.ts       # API client
└── package.json         # Root workspace config
```

## API endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/health` | Health check |
| `GET` | `/api/me` | Get authenticated user info and balance |
| `POST` | `/api/play` | Place a bet and play a round |

All authenticated endpoints require the `X-Init-Data` header with Telegram `initData`.

## Testing

```bash
npm test
```

57 tests covering wallet atomicity (including parallel race conditions), RNG determinism and tamper detection, auth validation, game logic, and end-to-end round integration.
