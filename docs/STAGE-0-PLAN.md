# Stage 0 — build plan

Status: COMPLETED and deployed. Current work lives in `IMPROVEMENT-PLAN.md`.

Goal of Stage 0: prove the core engine on the cheapest possible game (dice), with no
Durable Objects. Spine first, game last. Each task is self-contained with a Definition
of Done and a Verification step so progress is checkable. Tasks marked `CHECKPOINT` are
correctness-critical and require a human review of the approach before building on top.

Work the tasks in order. Commit after each (Conventional Commit, `[skip ci]` prefix).

---

## Task 0 — Repo scaffold & tooling

- **Goal:** monorepo skeleton with TypeScript, lint/format, scripts, `.gitignore`, and
  a CI workflow stub that does **not** auto-deploy.
- **Build:** `package.json` workspaces; `worker/` (Cloudflare Worker, TS) and `web/`
  (Vite + React + TS); `wrangler` config; shared `tsconfig`; ESLint + Prettier;
  `.github/workflows/ci.yml` running typecheck + lint + tests only; `.gitignore`
  covering `node_modules`, build output, `.wrangler`, `.env*`, `.dev.vars`,
  `CLAUDE.md`, `.claude/`.
- **Done when:** `npm install` is clean; web dev server serves; Worker dev server
  boots; `npm run typecheck` and `npm run lint` pass.
- **Verify:** run typecheck + lint; boot both dev servers.

## Task 1 — D1 schema & migrations

- **Goal:** the persistence layer for users, balances, the ledger, and the audit log.
- **Build:** migration `0001_init.sql` with tables: `users`, `wallets`
  (balance as integer minor units + `currency` text, default `CHIP`), `ledger_entries`
  (append-only transaction log with type, amount, ref/idempotency key, timestamps),
  `audit_events`. Enforce non-negative balances at the schema level where possible.
  Generate TypeScript types for the schema.
- **Done when:** migration applies to local D1; schema is documented in a short comment
  block.
- **Verify:** `wrangler d1 migrations apply <db> --local`; run a sample query.

## Task 2 — Wallet service (atomic) — `CHECKPOINT`

- **Goal:** the single, atomic entry point for every balance change. Most
  correctness-critical component in the project.
- **Build:** one `debit`/`credit` (or `transfer`) function that performs a conditional
  update (`balance >= amount`) and the matching `ledger_entries` insert in a **single
  atomic batch**; supports an idempotency key; never allows a negative balance; rejects
  on insufficient funds. No other code path may mutate balances.
- **Done when:** a concurrency test (parallel debits on the same wallet) proves no
  double-spend and no chips created from nothing; insufficient-funds path rejects
  cleanly; all balance mutations route through this function.
- **Verify:** unit tests + a parallel-debit race test.
- **CHECKPOINT:** before continuing, summarize the atomicity approach (how the batch
  guarantees no double-spend under D1's model) in a few lines for human review.

## Task 3 — RNG service (provably-fair) — `CHECKPOINT`

- **Goal:** provably-fair randomness behind an interface that also fits future P2P.
- **Build:** commit–reveal scheme — generate a server seed, publish its hash
  (commitment) before the bet; combine server seed + client seed + nonce to derive the
  outcome (HMAC-based); expose a verification routine that reproduces the outcome from
  the revealed server seed, client seed, and nonce. Design the interface so it can
  later accept **multiple entropy contributors** (both players in a duel), not just one
  client seed.
- **Done when:** the commitment is published before the bet; the verification routine
  reproduces outcomes deterministically; tampering is detectable.
- **Verify:** unit tests for determinism and for the public verification path.
- **CHECKPOINT:** summarize the fairness scheme (commit order, what the player can
  verify, why the server cannot retro-fit a seed) for human review before continuing.

## Task 4 — Auth boundary

- **Goal:** validate Telegram `initData` in one place and provision users.
- **Build:** `initData` signature + freshness validation in a single module; reject
  invalid or expired data; derive the user; on first auth, create the user and wallet
  and grant a starting chip balance **through the wallet function** (the "claim free
  chips" stub — no payment path).
- **Done when:** valid `initData` authenticates; tampered/expired is rejected; a new
  user is provisioned with starting chips via the wallet function.
- **Verify:** unit tests with synthetic valid and tampered `initData`.

## Task 5 — Game registry + module contract

- **Goal:** the plug-in seam for games.
- **Build:** a registry plus the contract — `validateBet(bet, player)`,
  `resolve(rngResult, bets) -> payouts` (pure, deterministic, no I/O, no wallet
  access), a state accessor, a runtime type, and a UI component reference. Money must
  not be reachable from game code.
- **Done when:** the registry can register and look up a game by id; the contract types
  compile; a trivial fake game registers and resolves in a test.
- **Verify:** typecheck; register-and-resolve test for the fake game.

## Task 6 — Dice module (first game)

- **Goal:** the first real game implementing the contract.
- **Build:** dice (roll-under / over a target). `validateBet` checks stake limits,
  target validity, and that the stake is affordable; `resolve` maps the RNG result to a
  win/loss and payout, purely.
- **Done when:** dice resolves deterministically from a given RNG result; payouts are
  correct across target ranges and edge bets.
- **Verify:** unit tests across the target range and boundary stakes.

## Task 7 — End-to-end round

- **Goal:** wire intent → outcome through the whole core.
- **Build:** a play endpoint that takes intent (stake, target, client seed) and runs:
  auth → `validateBet` → RNG commit/reveal → `resolve` → atomic wallet movement (debit
  stake, credit payout, as one consistent ledger story) → audit event → response with
  the result and the fairness proof.
- **Done when:** a full dice round works locally end-to-end; balances move correctly; an
  audit row is written; the fairness proof verifies.
- **Verify:** an integration test of a full round; a manual `curl` against local dev.

## Task 8 — Minimal frontend (play dice)

- **Goal:** a playable dice screen inside the Mini App.
- **Build:** a React/Vite screen that reads the Telegram theme, shows the balance, lets
  the user place a dice bet, and shows the result plus a link to the fairness proof.
  Mobile-first, light, instant-loading. Apply basic design tokens (dark base + one
  accent); keep Stage 0 lean — full visual polish comes later.
- **Done when:** the user can play dice against the local Worker; the balance updates;
  the screen loads fast.
- **Verify:** manual run in a browser against local dev. (A real in-Telegram test
  requires a deploy — that is a separate, explicit human step. Do **not** deploy here.)

## Task 9 — Analytics instrumentation

- **Goal:** make the audit/event log the analytics backbone from day one.
- **Build:** structured events for auth, bet placed, bet resolved, and balance deltas,
  written to the audit/event store. No external analytics SDK in Stage 0.
- **Done when:** each round emits structured, queryable events.
- **Verify:** play several rounds; inspect the recorded events.

## Task 10 — Tests, README, tidy

- **Goal:** leave Stage 0 clean and presentable.
- **Build:** ensure the full test suite is green; write a neutral English `README.md`
  (what the project is, the stack, how to run locally — no AI mentions); confirm every
  commit is a Conventional Commit prefixed `[skip ci]`; confirm no secrets are
  committed.
- **Done when:** `npm test` is green; `README.md` exists; `git status` is clean; the
  history is tidy.
- **Verify:** full test run; review `git log`.

---

When all tasks are done, stop and report a Stage 0 summary. Do not begin Stage 1.
