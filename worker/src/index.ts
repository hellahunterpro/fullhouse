import { registerGame } from './games/registry.js';
import { diceGame } from './games/dice.js';
import { authenticate, type AuthenticatedUser } from './services/auth.js';
import { playRound } from './services/round.js';
import { getBalance } from './services/wallet.js';

export interface Env {
  DB: D1Database;
  BOT_TOKEN: string;
}

registerGame(diceGame);

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

async function authFromRequest(db: D1Database, request: Request, botToken: string): Promise<AuthenticatedUser> {
  const initData = request.headers.get('X-Init-Data');
  if (!initData) throw new Error('Missing X-Init-Data header');
  return authenticate(db, initData, botToken);
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
      if (url.pathname === '/api/me' && request.method === 'GET') {
        const user = await authFromRequest(env.DB, request, env.BOT_TOKEN);
        const balance = await getBalance(env.DB, user.walletId);
        return json({ user: { id: user.id, tgId: user.tgId, username: user.username, firstName: user.firstName }, balance });
      }

      if (url.pathname === '/api/play' && request.method === 'POST') {
        const user = await authFromRequest(env.DB, request, env.BOT_TOKEN);
        const body = await request.json<{ gameId: string; bet: unknown; clientSeed: string }>();

        const result = await playRound(env.DB, {
          gameId: body.gameId,
          bet: body.bet as import('./games/dice.js').DiceBet,
          clientSeed: body.clientSeed,
          userId: user.id,
          walletId: user.walletId,
        });

        return json(result);
      }

      return json({ error: 'Not found' }, 404);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Internal error';
      const status = message.includes('Invalid') || message.includes('Missing') || message.includes('expired')
        ? 400
        : message.includes('Insufficient') ? 422 : 500;
      return json({ error: message }, status);
    }
  },
} satisfies ExportedHandler<Env>;
