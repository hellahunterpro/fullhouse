# Architecture — Full House (virtual-chip casino, Telegram Mini App)

A play-money casino built as a Telegram Mini App. Two families of games: **house**
(player vs RNG) and **P2P** (player vs player). Virtual chips only — chips are never
purchasable, cashable, or tradeable for anything of value. This is an entertainment
product and engineering showcase, not gambling.

## Principles

- **Server-authoritative.** The client sends *intent* (flip / bet / fold); the server
  computes the outcome. Never trust client-supplied values, outcomes, or balances.
- **Two correctness-critical components from day one:** (1) an atomic chip ledger,
  (2) a provably-fair RNG. Everything else is secondary.
- **Flexibility through clean boundaries, not pre-built integrations** (strict YAGNI).
  One concrete play-money implementation behind each interface. No frameworks for
  features that do not exist yet.
- **No real money anywhere in the codebase.** No payment, no cashout, no crypto, no
  conversion to value.

## Core platform (game-agnostic)

- **Auth boundary** — Telegram `initData` validation in one place (a Worker).
- **Wallet / ledger** — atomic debit/credit, full transaction log, no negative
  balances. Amounts are stored as **integer minor units + a currency code**
  (always `CHIP` for now). Every balance change goes through a single wallet
  function. This is the most correctness-critical component: a race condition here
  means chips minted from nothing.
- **RNG service** — provably-fair (server-seed commit → reveal + client seed +
  nonce), behind an interface. The interface must be general enough to later accept
  multiple entropy contributors (needed for P2P, where both players contribute).
- **Game registry + game-module contract.**
- **Audit / event log** — every round recorded. This is also the analytics backbone;
  instrument it from Stage 0.

## Game-module contract

- `validateBet(bet, player)` — reject illegal bets.
- `resolve(rngResult, bets) -> payouts` — **pure and deterministic** given the RNG
  result and the bets. No side effects, no wallet access, no I/O.
- A state accessor (for clients), a runtime type, and a UI component reference.
- **Money never lives in game code.** All chip movement goes through the wallet
  service. A buggy or new game therefore cannot corrupt balances; adding a game means
  implementing the contract, not touching the core. Removing a game means
  unregistering it.

## Runtime tiers

Runtime is a property of the game; one shared core sits under all of them.

- **Tier 1 — house, request/response:** Worker + D1 + RNG. **No Durable Objects.**
  (dice, blackjack-vs-house, roulette, plinko, mines, slots.) Cheapest — start here
  to prove the core.
- **Tier 2 — shared real-time:** Durable Object per table + WebSocket + alarms
  (timers). (live roulette with a shared spin + countdown, multiplayer crash.)
- **Tier 3 — P2P interactive:** Durable Object per match + WebSocket, turn logic.
  (coinflip / dice duel, poker.)
- Poker hand evaluation uses `goldfire/pokersolver` (MIT). Do not reimplement hand
  ranking.

## Seams

**Cheap, build now (needed for correctness anyway):**

- Currency-coded integer amounts (always `CHIP`).
- One wallet function for all balance changes (atomic).
- RNG behind one interface (general enough for multi-party entropy later).
- Pure game logic separated from money movement.
- A game registry that can, in principle, accept a new game type.
- Auth behind one boundary; an audit / event log.

**Do NOT build now (premature):**

- Real payment / crypto cashier — stub it as "claim free chips".
- A generic slot-aggregator adapter framework.
- Solana programs / on-chain VRF / smart contracts.
- KYC / withdrawal / multi-currency UI / FX.
- Plugin hot-loading (a simple registry + interface is enough for a solo build).

## Stack

- Cloudflare Worker + D1, with a React / Vite / TypeScript frontend.
- Deployment target later: Cloudflare Pages for the Mini App, Worker for the API.

## Build order

- **Stage 0:** core engine + one house game (dice), no Durable Objects. Prove the
  core; instrument analytics. *(This repo is currently at Stage 0 — see
  `docs/STAGE-0-PLAN.md`.)*
- **Stage 1:** P2P duels (first Durable Objects + WebSocket) + retention spine (daily
  streak, progression, leaderboard) + shared chip economy + provably-fair.
- **Stage 2:** breadth (roulette / plinko / mines / slots) + clubs / tournaments /
  cosmetics + a Balatro-style poker reframe.
- **Stage 3:** structured multiplayer poker (tournaments / ranks / buy-in /
  reputation) + seasonal live-ops.
