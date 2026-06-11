import {
  authenticate,
  provisionUser,
  ensureSchema,
  AuthError,
  type AuthenticatedUser,
} from '@fullhouse/core';
import { DuelObject } from './duel-object.js';

export { DuelObject };

export interface Env {
  DB: D1Database;
  BOT_TOKEN: string;
  DEV_MODE?: string;
  DUEL: DurableObjectNamespace;
  /** Test/ops overrides for the duel state machine timers (milliseconds). */
  DUEL_TIMEOUT_MS?: string;
  DUEL_CLEANUP_MS?: string;
}

const DUEL_ID_RE = /^[A-Za-z0-9_-]{4,64}$/;

function json(data: unknown, status = 200): Response {
  return Response.json(data, {
    status,
    headers: { 'Access-Control-Allow-Origin': '*' },
  });
}

// WebSocket clients cannot set headers, so initData arrives as a query param.
// DEV_MODE supports multiple local identities via dev_tg_id for two-client tests.
async function authConnect(env: Env, url: URL): Promise<AuthenticatedUser> {
  const initData = url.searchParams.get('initData') ?? '';
  if (!initData && env.DEV_MODE === 'true') {
    const devTgId = parseInt(url.searchParams.get('dev_tg_id') ?? '1', 10) || 1;
    return provisionUser(env.DB, {
      id: devTgId,
      username: `dev_player_${devTgId}`,
      first_name: `Dev${devTgId}`,
    });
  }
  if (!initData) throw new AuthError('Missing initData');
  return authenticate(env.DB, initData, env.BOT_TOKEN);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/health') {
      return json({ status: 'ok' });
    }

    if (url.pathname === '/ws') {
      if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
        return json({ error: 'Expected a WebSocket upgrade' }, 426);
      }

      const duelId = url.searchParams.get('duel');
      if (!duelId || !DUEL_ID_RE.test(duelId)) {
        return json({ error: 'Missing or invalid duel id' }, 400);
      }

      let user: AuthenticatedUser;
      try {
        await ensureSchema(env.DB);
        user = await authConnect(env, url);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Auth failed';
        return json({ error: message }, 401);
      }

      // When the Mini App is opened through a duel deep link, the duel id is
      // part of the signed initData (start_param). It must match the requested
      // duel — the unsigned query param alone is never trusted for link joins.
      const initData = url.searchParams.get('initData') ?? '';
      const startParam = new URLSearchParams(initData).get('start_param');
      if (startParam?.startsWith('duel_') && startParam.slice(5) !== duelId) {
        return json({ error: 'Duel id does not match the signed start_param' }, 403);
      }

      // Hand the authenticated identity to the DO via internal headers; the
      // client-supplied query params are never trusted past this point.
      const headers = new Headers(request.headers);
      headers.set('X-User-Id', user.id);
      headers.set('X-Wallet-Id', user.walletId);
      headers.set('X-User-Name', user.username || user.firstName || 'Player');
      const forward = new Request(request.url, { method: request.method, headers });

      const stub = env.DUEL.get(env.DUEL.idFromName(duelId));
      return stub.fetch(forward);
    }

    return json({ error: 'Not found' }, 404);
  },
} satisfies ExportedHandler<Env>;
