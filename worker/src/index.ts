import { registerGame, getGame, listGames } from './games/registry.js';
import { diceGame } from './games/dice.js';
import { coinflipGame } from './games/coinflip.js';
import { minesGame } from './games/mines.js';
import { rouletteGame } from './games/roulette.js';
import { authenticate, provisionUser, type AuthenticatedUser } from './services/auth.js';
import { playRound } from './services/round.js';
import { getBalance } from './services/wallet.js';
import { trackAuth } from './services/analytics.js';
import { verify } from './services/rng.js';
import { getHistory } from './services/history.js';
import { getLeaderboard } from './services/leaderboard.js';
import { claimDailyBonus } from './services/daily-bonus.js';
import type { FairnessProof } from './services/rng.js';

export interface Env {
  DB: D1Database;
  BOT_TOKEN: string;
  DEV_MODE?: string;
}

registerGame(diceGame);
registerGame(coinflipGame);
registerGame(minesGame);
registerGame(rouletteGame);

function corsHeaders(): HeadersInit {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Init-Data',
  };
}

function json(data: unknown, status = 200): Response {
  return Response.json(data, { status, headers: corsHeaders() });
}

async function authFromRequest(db: D1Database, request: Request, env: Env): Promise<AuthenticatedUser> {
  const initData = request.headers.get('X-Init-Data');

  if (!initData && env.DEV_MODE === 'true') {
    return provisionUser(db, { id: 1, username: 'dev_player', first_name: 'Dev' });
  }

  if (!initData) throw new Error('Missing X-Init-Data header');
  return authenticate(db, initData, env.BOT_TOKEN);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    if (url.pathname === '/api/health') {
      return json({ status: 'ok' });
    }

    try {
      if (url.pathname === '/api/games' && request.method === 'GET') {
        const games = listGames().map((g) => ({
          id: g.id, name: g.name, runtimeTier: g.runtimeTier, uiComponent: g.uiComponent,
        }));
        return json({ games });
      }

      if (url.pathname === '/api/me' && request.method === 'GET') {
        const user = await authFromRequest(env.DB, request, env);
        await trackAuth(env.DB, user.id, user.isNewUser, user.tgId);
        const balance = await getBalance(env.DB, user.walletId);
        return json({
          user: { id: user.id, tgId: user.tgId, username: user.username, firstName: user.firstName },
          balance,
        });
      }

      if (url.pathname === '/api/play' && request.method === 'POST') {
        const user = await authFromRequest(env.DB, request, env);
        const body = await request.json<{ gameId: string; bet: unknown; clientSeed: string }>();

        const game = getGame(body.gameId);
        if (!game) return json({ error: `Unknown game: ${body.gameId}` }, 400);

        const result = await playRound(env.DB, {
          gameId: body.gameId,
          bet: body.bet as { stake: number; [key: string]: unknown },
          clientSeed: body.clientSeed,
          userId: user.id,
          walletId: user.walletId,
        });

        return json(result);
      }

      if (url.pathname === '/api/verify' && request.method === 'POST') {
        const body = await request.json<{ proof: FairnessProof; maxRoll: number }>();
        const valid = await verify(body.proof, body.maxRoll);
        return json({ valid });
      }

      if (url.pathname === '/api/history' && request.method === 'GET') {
        const user = await authFromRequest(env.DB, request, env);
        const limit = parseInt(url.searchParams.get('limit') || '20', 10);
        const history = await getHistory(env.DB, user.id, Math.min(limit, 100));
        return json({ history });
      }

      if (url.pathname === '/api/leaderboard' && request.method === 'GET') {
        const leaderboard = await getLeaderboard(env.DB);
        return json({ leaderboard });
      }

      if (url.pathname === '/api/daily-bonus' && request.method === 'POST') {
        const user = await authFromRequest(env.DB, request, env);
        const result = await claimDailyBonus(env.DB, user.id, user.walletId);
        return json(result);
      }

      return json({ error: 'Not found' }, 404);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Internal error';
      const status = message.includes('Invalid') || message.includes('Missing') || message.includes('expired')
        ? 400
        : message.includes('Insufficient') ? 422
        : message.includes('Duplicate') ? 409
        : 500;
      return json({ error: message }, status);
    }
  },
} satisfies ExportedHandler<Env>;
