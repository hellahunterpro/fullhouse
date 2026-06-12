# Duels — local two-client test procedure

How to run a complete duel (and rematch) end-to-end on one machine, either with
two plain browser tabs (dev identities) or with two real Telegram accounts.

## Prerequisites

```bash
npm install
# worker env: copy and keep DEV_MODE=true, REALTIME_URL=ws://localhost:8789
cp worker/.dev.vars.example worker/.dev.vars
# realtime env: copy and keep DEV_MODE=true
cp realtime/.dev.vars.example realtime/.dev.vars
# apply migrations to the local D1 database used by both workers
cd worker && npx wrangler d1 migrations apply fullhouse-db --local && cd ..
```

Start everything (web on :5173, API worker on :8787, realtime worker on :8789):

```bash
npm run dev
```

> The API worker and the realtime worker must share one D1 database. Locally
> each `wrangler dev` keeps its own `.wrangler/state`, so for full local play
> run the realtime worker from the worker's state directory if needed:
> `cd realtime && npx wrangler dev --persist-to ../worker/.wrangler/state`.
> The `npm run dev` script is fine for UI work; for wallet-accurate duels use
> the shared `--persist-to` form in two terminals.

## Option A — two browser tabs (dev identities)

`DEV_MODE=true` lets a plain browser act as a Telegram user. The `?as=<n>`
query parameter selects a distinct dev identity for both the REST API and the
WebSocket connection.

1. Tab 1 (creator): open `http://localhost:5173/?as=1`.
   - Lobby → **Challenge a friend** → pick game + stake → **Create Challenge**.
   - The waiting room shows the challenge link; copy the duel id from it
     (the part after `startapp=duel_`).
2. Tab 2 (opponent): open `http://localhost:5173/?as=2&duel=<duelId>`.
   - The duel screen opens directly (the `?duel=` param is the local stand-in
     for the Telegram `start_param`).
   - Tap **Accept**.
3. Both tabs show the 3‑2‑1 countdown, auto-commit their client seeds, and play
   the same reveal animation; the winner takes both stakes.
4. Tap **Rematch — same stake** in both tabs: round 2 resolves against the
   next-round seed commitment published with the round‑1 result.
5. Check the lobby balances (header pill) and **History** — the duel appears
   with the stake and outcome in both tabs.

## Option B — two real Telegram accounts

1. Create a dev bot with @BotFather, set its Mini App / menu-button URL to a
   tunnel pointing at your local web build (e.g. `cloudflared tunnel` or
   `ngrok http 5173`), and put the bot token into both `.dev.vars` files
   (`BOT_TOKEN=...`, `DEV_MODE` can stay `true`; signed initData always takes
   precedence).
2. Set `BOT_USERNAME=<your_dev_bot>` in `worker/.dev.vars` so share links
   point at your bot, and expose the realtime worker through a second tunnel;
   put its `wss://…` URL into `REALTIME_URL`.
3. Account 1: open the Mini App from the bot menu, create a challenge, and
   share the link to account 2 via the share sheet.
4. Account 2: tapping the link opens the Mini App with
   `start_param=duel_<id>`; the duel screen opens automatically — accept.
5. Complete the duel and a rematch; verify both balances and History entries.
   The realtime worker validates the signed `start_param` against the duel id,
   so a tampered link is rejected.

## What to verify

- Creator sees live presence when the opponent connects.
- Countdown runs on both clients and the reveal lands on the same result.
- Winner's balance +stake, loser's −stake (check the header pill on both).
- Rematch resolves with `nonce = 1` and the seed hash published in round 1's
  proof ("Next round commitment").
- Abandoning a duel (closing the opponent tab before accepting) refunds any
  locked stake after the timeout and shows the cancellation notice.
- The duel appears under History for both players.
