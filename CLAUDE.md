# CLAUDE.md — operating context

> Local working context. Architecture: `ARCHITECTURE.md`. Task list:
> `docs/STAGE-0-PLAN.md`. Read both before coding. Keep the repo free of any
> AI/assistant reference; strip `CLAUDE.md` and `.claude/` before the repo goes public.

## What this is
Full House — play-money virtual-chip casino, Telegram Mini App. Stage 0
(`docs/STAGE-0-PLAN.md`) is complete and live. Current work: **`docs/IMPROVEMENT-PLAN.md`**.

## Hard guard (non-negotiable)
- **No real money, ever.** Chips are never purchasable (incl. Telegram Stars / TON),
  cashable, or tradeable for value. Do not add or stub any payment / cashout / crypto /
  conversion path. If a task seems to need one, stop and ask.
- **Server-authoritative.** The server computes every outcome; never trust client values.

## Build protocol — run to completion
Work `docs/IMPROVEMENT-PLAN.md` phase by phase, in order, and complete EVERY task of the
current phase in one continuous pass.
After each task: run its verification, fix failures, commit (Conventional Commit, prefixed
`[skip ci]`), push, then immediately start the next task.

Do **not** pause between tasks. Do **not** stop to summarize, ask "continue", or wait for
review. Do **not** stop at the plan's `CHECKPOINT` markers — that wording is overridden:
just take extra care on the atomic wallet and the provably-fair RNG and cover both with
thorough tests, without pausing. Keep going until all Stage 0 tasks are done and all tests
pass — only then report.

Stop before completion only if: the hard guard would be violated; the plan marks an explicit
STOP point (end of Phase 2, anything in Phase 5); or the same verification fails three times
and you cannot fix it (report what failed, then stop).

## Conventions
- All repo-visible text in **English**. No AI fingerprint, no co-author trailers.
- Conventional Commits (`feat:`/`fix:`/`refactor:`/`chore:`/`docs:`/`test:`); every message
  prefixed `[skip ci]` by default; drop the prefix only on an explicit human deploy command.
- Comments only for non-obvious logic. Small, focused commits; clean history.

## Deploy discipline
- **Never deploy** (`wrangler deploy` / `pages deploy`); that is a human action on an
  explicit command. Pushing to GitHub is expected and, with `[skip ci]`, never deploys.
- No real cloud credentials or `.env` values; local dev uses local D1 (`--local`).

## Verify
`npm install`; `npm run dev` (web) + Worker dev server boot; `npm run typecheck`,
`npm run lint`, `npm test` pass; local D1 migrations apply with `--local`.

## Done =
See "Definition of improved" at the end of `docs/IMPROVEMENT-PLAN.md`. No deploys —
release is always a human command.
