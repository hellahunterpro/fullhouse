# Improvement plan — Full House

Status: ACTIVE. Stage 0 (`docs/STAGE-0-PLAN.md`) is complete and deployed.
Work this plan phase by phase, task by task, under the protocol in `CLAUDE.md`:
implement → verify → commit (`[skip ci]` Conventional Commit) → push → next task.
Do not reorder phases. Do not start Phase 5 without explicit human approval.

## Global constraints (apply to every task)

- **No real money, ever.** No purchase/cashout/crypto paths, no UI that implies them
  (no "deposit", "withdraw", "cash out" wording anywhere).
- **Server-authoritative.** UI animates outcomes the server already decided; the
  client never computes results.
- **Original visuals only.** Work in the dark-neon casino genre, but never copy
  assets, markup, CSS, or recognizable layouts from existing sites (Gamdom, Stake,
  etc.). All art is hand-drawn SVG/CSS in this repo.
- **Webview performance budget.** First-load JS ≤ 250 KB gzip. No animation or UI
  libraries: CSS transitions/transforms and `requestAnimationFrame` only. Animate
  only `transform` and `opacity`. Respect `prefers-reduced-motion`.
- **Mobile-first.** Touch targets ≥ 44px, Telegram safe areas respected, no
  horizontal scroll at 320px width.
- All quality gates stay green at every commit: `npm run typecheck`, `npm run lint`,
  `npm test`, `npm run build`.

---

## Phase 1 — Visual overhaul (design system + game feel)

### Design direction (binding for all Phase 1 tasks)

- **Palette (CSS custom properties in `web/src/styles/tokens.css`):**
  `--bg-0: #0B0F17` (app), `--bg-1: #121826` (panels), `--bg-2: #1A2233` (cards),
  `--line: rgba(255,255,255,0.06)` (1px borders),
  `--text: #ECF1F8`, `--text-dim: #93A0B4`,
  `--accent: #2BD96B` with gradient partner `#19B57A` (CTAs, wins),
  `--accent-glow: rgba(43,217,107,0.35)` (shadows under primary actions),
  `--gold: #F6C453` (balance, multipliers), `--danger: #FF5C5C` (losses, mines).
- **Type:** system font stack; numbers always `font-variant-numeric: tabular-nums`;
  balance and results use large bold sizes (28–40px).
- **Surfaces:** radius 14px cards / 10px controls; elevation
  `0 8px 24px rgba(0,0,0,0.35)`; primary buttons add an accent glow shadow.
- **Motion:** 150–250ms ease-out for UI; game reveals 600–1200ms with deceleration
  curves; win states pulse the accent glow once; trigger
  `Telegram.WebApp.HapticFeedback` (`impactOccurred` on action,
  `notificationOccurred('success'|'error')` on result) guarded with optional
  chaining.
- The casino identity is dark-first and does NOT follow the user's Telegram theme
  colors; keep using Telegram viewport/safe-area APIs only.

### Tasks

**1.1 — Tokens & CSS architecture.**
Create `web/src/styles/tokens.css` (custom properties above) and `base.css`
(reset, typography, focus states). Refactor `theme.ts` so TS reads the same token
names (single source: CSS variables; TS exports `var(--…)` strings). Convert
existing screens to classes in co-located `.css` files as they are touched in later
tasks — no big-bang rewrite here, just the foundation plus the lobby header as the
first consumer.
*Done:* tokens/base imported once in `main.tsx`; app builds and renders unchanged
or better. *Verify:* build + typecheck + manual dev-server smoke.

**1.2 — UI kit + render smoke tests.**
Components in `web/src/ui/`: `Button` (primary/ghost/danger, loading state),
`Panel`, `StatPill` (used for balance), `Toast` (queue, auto-dismiss),
`Skeleton`, `ScreenHeader` (back button, title, balance). Add dev-deps
`@testing-library/react` + `jsdom`; create a vitest setup for `web` and a smoke
test per screen ("renders without crashing" with mocked API).
*Done:* kit used by at least the lobby; `npm test -w web` runs the smoke suite.

**1.3 — Lobby redesign.**
Header: app name, animated balance StatPill (count-up on change). Daily bonus as a
distinct card with streak flame and claimed/unclaimed states. Game grid: one card
per game with **original SVG art** (dice cubes, coin, roulette wheel slice, mine +
gem) on `--bg-2` with hover/press states. Footer: "Provably fair · seed …" line
opening the fairness sheet (Task 1.9). History/Leaderboard as a segmented row.
*Done:* lobby matches the design direction; smoke tests updated.

**1.4 — Dice screen.**
Gradient slider track (win zone in accent, lose zone neutral), big multiplier/chance
/payout readout that updates live, bet presets. Roll animation: number scramble
(~700ms, rAF) settling on the server result; win → accent glow pulse + haptic
success; lose → brief shake + haptic error.
*Done:* full round feels animated end-to-end; numbers always match server response.

**1.5 — Coinflip screen.**
CSS 3D coin (two SVG faces, `rotateX` flip, 900ms, ends exactly on the server
result), heads/tails choice as two large cards, result panel reuse from 1.9.
*Done:* flip never desyncs from the outcome (test the mapping in a unit test).

**1.6 — Roulette screen.**
SVG wheel with 37 pockets in the **standard European order**
`0,32,15,19,4,21,2,25,17,34,6,27,13,36,11,30,8,23,10,5,24,16,33,1,20,14,31,9,22,18,29,7,28,12,35,3,26`
and correct red/black/green coloring. Spin: wheel rotates with a deceleration curve
and lands the winning pocket under the pointer (compute final angle from the server
`spin`). Bet board: red/black/odd/even/high/low/dozens buttons + a 0–36 number grid
for straight bets; selected bet and stake clearly shown.
*Done:* landing pocket always equals server `spin` (unit-test the angle math);
board is usable on a 320px screen.

**1.7 — Mines screen.**
5×5 grid of tiles; pick selection state; on resolve, flip picked tiles (staggered
~60ms) revealing gems or a mine; on bust, reveal the full board with mines marked.
Multiplier ladder showing current and next multiplier for the chosen mine count.
*Done:* reveal sequence matches `outcome.minePositions`/`picks`; haptics wired.

**1.8 — History & Leaderboard restyle.**
History: per-round cards with game icon, stake → payout coloring (accent win /
danger loss), relative time. Leaderboard: rank, name, balance with top-3 styling.
Empty states for both.
*Done:* restyled with the kit; smoke tests pass.

**1.9 — Result panel + fairness sheet.**
Unified result panel used by all games: outcome headline, payout, balance count-up,
"show proof" link. Fairness sheet (bottom drawer): current commitment hash with
copy button, **editable client seed** (persisted in `localStorage`, sent with every
bet), "rotate & reveal seed" action calling `/api/fairness/rotate`, and a
"verify" action that recomputes a finished round via `/api/verify` and shows the
result. Per-round proof shows hash/client seed/nonce/HMAC/maxRoll with copy
buttons.
*Done:* a user can set a seed, play, rotate, and verify — the full provably-fair
loop works from the UI.

**1.10 — Polish pass.**
Skeletons for lobby/history/leaderboard loads; friendly error and empty states; a
clear "open inside Telegram" screen when `initData` is absent (plain-browser case);
reduced-motion audit; touch-target audit; bundle size check against the budget;
update `README.md` with a short feature list (screenshots to be added by a human).
*Done:* all gates green; bundle within budget; this phase's commits form a clean
narrative.

---

## Phase 2 — P2P duels (first real-time feature)

### Architecture (binding)

- Cloudflare **Pages cannot host Durable Object classes**, so real-time lives in a
  new Worker workspace `realtime/` exposing `DuelObject` (one DO per match) over
  WebSocket. Clients connect **directly** to the realtime Worker URL (wss), passing
  `initData` in the connection params; the Worker validates it the same way the API
  does. The Pages app stays as-is.
- Extract shared server code (auth validation, wallet, rng, fairness, db types)
  into a workspace package `packages/core` imported by both `worker/` and
  `realtime/`. Pure refactor first — no behavior change.
- **Chips never move inside the DO.** The DO orchestrates state; every stake lock,
  payout, and refund goes through the core wallet functions against the same D1
  database, with idempotency keys derived from the duel id.
- Duel fairness is multi-party: both players submit client seeds; the outcome uses
  the server commitment + **both** seeds + nonce (the RNG interface already accepts
  multiple client seeds). Both proofs are returned to both players.
- Deep links: a duel invite is `https://t.me/<bot>?startapp=duel_<id>`; the client
  reads `start_param` and joins. The server must take the duel id only from the
  **validated** initData payload, never from unsigned client state.

### Tasks

**2.1 — Extract `packages/core`.** Move shared modules; both workers compile; all
existing tests pass unchanged. *Verify:* full suite green.

**2.2 — Realtime worker scaffold.** `realtime/` with wrangler config (DO binding +
migration, same D1 binding), WS upgrade handshake, initData auth on connect,
heartbeat/close handling. Miniflare-based tests for connect/auth-reject.

**2.3 — Duel state machine.** In `DuelObject`: `created → joined → committed →
resolved → (rematch → committed …)`, with DO alarms for timeouts (auto-cancel
unjoined duels after 10 min; refund on abandonment). Unit-test transitions and
timeout paths.

**2.4 — Escrow & settlement.** Ledger entry types `duel_stake`, `duel_payout`,
`duel_refund`; both stakes locked on commit (atomic, idempotent), winner paid in
one settlement batch, refunds on cancel/timeout. Concurrency tests: double-join,
double-commit, replayed messages.

**2.5 — Duel API surface.** Create-duel endpoint in the main API (returns id +
share link), duel summary endpoint for history; analytics events
`duel_created/joined/resolved/rematch`.

**2.6 — Duel UI.** "Challenge a friend" flow from the lobby: pick game
(coinflip/dice), stake, get a share sheet (Telegram share link). Waiting room with
live opponent presence, both-ready countdown, synchronized reveal animation,
result + **rematch** button (one tap, same stake). Duels appear in history.
*Done:* two real Telegram accounts can complete a duel and a rematch end-to-end
locally (document the local two-client test procedure).

**STOP after Phase 2:** deploying the realtime Worker is a human action. Surface a
summary and wait.

---

## Phase 3 — Retention spine

**3.1 — Streaks.** Server-side consecutive-day tracking on daily bonus claim;
multiplier table (e.g. day 1–7 scaling); streak flame + progress in the lobby.
**3.2 — XP & levels.** XP per chips wagered; level curve; level-up grants a chip
bonus **through the wallet** with idempotency; profile screen (level, rounds
played, biggest win, win rate) fed from the ledger/audit data.
**3.3 — Referrals.** `startapp=ref_<userId>` deep link; one-time mutual chip bonus
on first auth of the invitee (idempotent, validated server-side); referral count on
the profile.
**3.4 — Leaderboards v2.** Weekly leaderboard (reset cycle, stored snapshots) +
all-time tab; "friends" tab = users connected through referrals.

Each task: schema migration if needed, service + tests, UI, analytics events.

---

## Phase 4 — Game breadth

**4.1 — Blackjack vs house.** Multi-action rounds need server state: add an
`active_rounds` table (round id, user, game, state JSON, escrowed stake, created
at). Deck is derived deterministically from the round's HMAC stream (use successive
bytes for a Fisher-Yates shuffle of 52 cards — same approach as mines). Endpoints:
start (escrows stake, deals), action (`hit`/`stand`/`double`), settle (atomic
payout incl. blackjack 3:2; dealer stands on soft 17). Abandoned rounds auto-stand
and settle lazily after 10 min. Full rules unit-tested (busts, pushes, blackjack,
double); UI with card dealing animation.
**4.2 — Plinko.** Peg rows derived from HMAC bits (one bit per row → bucket),
payout table per risk level; resolve stays pure; ball-drop animation following the
actual bit path.
**4.3 — Slots.** 3 reels from HMAC chunks, small original SVG symbol set, 1–3
paylines with a published paytable; spin animation stopping reels on the server
result.

Each game: module + `maxRoll`/entropy declaration + tests (including payout-table
coverage) + screen on the design system + history support.

---

## Phase 5 — Poker reframe (GATED — do not start)

The Balatro-style single-player mode is the flagship differentiator and gets its
own design document and plan. **Stop and ask before any Phase 5 work.**

---

## Definition of "improved"

Phases 1–4 complete: the app looks and feels like a polished dark-neon casino
(original art, animated games, haptics), duels work end-to-end with shareable
challenge links and rematch, streak/XP/referral/weekly-leaderboard systems are
live, blackjack/plinko/slots are playable — with every quality gate green and a
clean, deploy-free git history awaiting human release commands.
