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
- **P2P Duels** — challenge a friend over a Telegram share link to a live coinflip or dice duel; winner takes both stakes, with one-tap rematch (see `docs/DUEL-LOCAL-TESTING.md`)

## Features

- **Atomic wallet** — all balance changes go through a single debit/credit function backed by D1 batch transactions; no double-spend, no negative balances
- **Provably-fair RNG** — HMAC-SHA256 commit–reveal scheme; server seed hash published before the bet, outcome verifiable by the player
- **Fairness sheet** — set your own client seed, rotate & reveal the server seed, and re-verify any finished round from inside the app
- **Dark-neon design system** — original hand-drawn SVG art, CSS-token theming, animated game reveals (dice scramble, 3D coin flip, decelerating roulette wheel, staggered mines reveal) with haptic feedback and reduced-motion support
- **Telegram auth** — `initData` signature validation with automatic user provisioning and 10,000 starting chips
- **Daily bonus** — claim chips once per day with a streak multiplier and a streak card in the lobby
- **Game history** — per-round cards with stake → payout flow and relative timestamps
- **Leaderboard** — top players by balance with top-3 styling
- **Structured analytics** — every auth, bet, and balance change recorded as audit events
- **Performance budget** — first-load JS kept under 250 KB gzip (enforced by `npm run check:bundle`); no animation libraries, only `transform`/`opacity` animations
- **Dev mode** — automatic auth bypass for local browser testing without Telegram; plain browsers without dev mode see an "open inside Telegram" screen

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
| `POST` | `/api/duel/create` | Create a duel challenge (returns share link) |
| `GET` | `/api/duels` | List your duels for history |

The realtime worker (`realtime/`) exposes `wss://…/ws?duel=<id>` — one Durable Object
per duel orchestrating join/commit/resolve/rematch over WebSocket; all chip movement
still goes through the shared wallet against the same D1 database.

## Provably-fair verification

Every round returns a fairness proof containing the server seed, its pre-committed hash, the client seed, nonce, and the HMAC used to derive the roll. Players can independently verify:

1. The server seed hashes to the commitment published before the bet
2. The HMAC of (server seed, client seed, nonce) reproduces the same roll
3. Any tampering to any parameter causes verification to fail

## Testing

```bash
npm test
```

144 tests across both workspaces: wallet atomicity (including parallel race conditions), RNG determinism and tamper detection, auth validation, game logic for all four games, end-to-end round integration, and frontend suites covering every screen, the UI kit, animation-to-outcome mapping (coin flip, roulette wheel, mines reveal), and the provably-fair UI loop.
