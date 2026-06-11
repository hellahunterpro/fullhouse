# Architecture — Full House (virtual-chip casino, Telegram Mini App)

A play-money casino running as a Telegram Mini App. Virtual chips only — never
purchasable, cashable, or tradeable. Live: the Mini App is served from Cloudflare
Pages and opened through the Telegram bot's menu button.

## Principles

- **Server-authoritative.** The client sends intent; the server computes every
  outcome. Client-supplied values, outcomes, or balances are never trusted.
- **Two correctness-critical components:** the atomic chip ledger and the
  provably-fair RNG. Everything else is secondary.
- **Flexibility through clean boundaries, not pre-built integrations** (strict
  YAGNI). One play-money implementation behind each interface.
- **No real money anywhere in the codebase.** No payment, cashout, crypto, or
  conversion paths — in code or in UI wording.

## Core platform (game-agnostic)

- **Auth boundary** — Telegram `initData` signature + freshness validation in one
  module. Used by the API today and by the realtime worker in Phase 2.
- **Wallet / ledger** — amounts are integer minor units + currency code (`CHIP`).
  Every balance change goes through the wallet service; `settleRound` performs
  stake debit + payout credit + any extra statements (e.g. the seed-nonce bump) in
  **one atomic batch**. Idempotency via unique ledger ref keys; non-negative
  balances enforced both by conditional updates and a schema `CHECK`.
- **Provably-fair RNG** — persistent per-user server seeds: the seed hash is
  committed **before** any bet, the nonce advances atomically with each
  settlement, and the raw seed is revealed only on rotation. Outcome =
  HMAC-SHA256(serverSeed, clientSeeds + nonce). The per-round public proof
  excludes the raw seed; `/api/verify` reproduces outcomes once a seed is
  revealed. The interface accepts multiple client seeds (used by P2P duels).
- **Game registry + game-module contract** (below).
- **Audit / event log** — every auth, bet, resolution, and balance delta is
  recorded; this is also the analytics backbone.
- **Schema bootstrap** — `worker/migrations/*.sql` is the source of truth;
  `scripts/gen-bootstrap.mjs` compiles the migrations into idempotent
  `IF NOT EXISTS` statements that the worker applies on an isolate's first
  request. The remote database never needs a manual migration step.

## Game-module contract

- `validateBet(bet, player)` — reject illegal bets.
- `resolve(rng, bets) -> payouts` — **pure and deterministic**. `rng` carries
  `roll` (uniform in `[0, maxRoll)`) and `hmacHex` (the full 256-bit HMAC) for
  games that need more entropy than one roll — mines boards, card shuffles.
- Each module declares its **`maxRoll`** (outcome space): dice 100, coinflip 2,
  roulette 37. The engine derives the roll in exactly that space — no game-side
  remapping, no truncated outcome spaces.
- **Money never lives in game code.** All chip movement goes through the wallet
  service; a buggy game cannot corrupt balances. Adding a game = implementing the
  contract and registering it.

## Runtime tiers

- **Tier 1 — house, request/response** (live): dice, coinflip, roulette, mines on
  Worker + D1. Blackjack (Phase 4) adds a server-side `active_rounds` state table
  for multi-action rounds but stays request/response.
- **Tier 2/3 — real-time:** Cloudflare Pages cannot host Durable Object classes,
  so real-time lives in a separate `realtime/` Worker exposing one DO per match
  over WebSocket (initData-authenticated). Shared server logic is extracted to
  `packages/core` and used by both workers. Chips still move only through the
  wallet against the same D1 database.
- Poker hand evaluation (later phases): `pokersolver` (MIT) — do not reimplement.

## Deployment model

- **Cloudflare Pages, advanced mode.** One build produces `web/dist` (Vite
  frontend) plus `_worker.js` (esbuild bundle of `worker/src/index.ts`) — the
  worker serves `/api/*` and falls through to static assets. Bindings live in the
  Pages project: D1 as `DB`, secret `BOT_TOKEN`.
- **Releases are git-driven.** Every commit message is prefixed `[skip ci]` by
  default, which suppresses the Pages build. A release is a commit without the
  prefix pushed to `main`, made only on an explicit human command. Never deploy
  from tooling.
- `worker/wrangler.toml` mirrors the D1 database id for CLI access (local dev,
  remote queries). The Phase 2 realtime worker deploys separately via wrangler —
  also human-gated.

## Seams

**Built now (needed for correctness anyway):** currency-coded integer amounts; one
atomic wallet entry point; RNG behind one multi-party-capable interface; pure game
logic separated from money; a registry that accepts new game types; one auth
boundary; the audit log.

**Do NOT build (premature):** payment/crypto cashier (chips come from the free
claim/bonuses), slot-aggregator adapters, on-chain VRF/contracts, KYC/multi-
currency, plugin hot-loading.

## Status & plan

Stage 0 (`docs/STAGE-0-PLAN.md`) is complete and deployed. Active work follows
`docs/IMPROVEMENT-PLAN.md`: Phase 1 visual system → Phase 2 P2P duels →
Phase 3 retention → Phase 4 game breadth → Phase 5 (gated) poker reframe.
