import { generateId } from './id.js';
import { credit } from './wallet.js';
import type { UserRow } from './db/schema.js';

const STARTING_CHIPS = 10_000;
const INIT_DATA_MAX_AGE_S = 300; // 5 minutes

export interface AuthenticatedUser {
  id: string;
  tgId: number;
  username: string | null;
  firstName: string | null;
  walletId: string;
  isNewUser: boolean;
}

export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthError';
  }
}

interface ParsedInitData {
  hash: string;
  dataCheckString: string;
  authDate: number;
  user: { id: number; username?: string; first_name?: string };
}

function parseInitData(initData: string): ParsedInitData {
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) throw new AuthError('Missing hash in initData');

  const authDateStr = params.get('auth_date');
  if (!authDateStr) throw new AuthError('Missing auth_date in initData');
  const authDate = parseInt(authDateStr, 10);
  if (isNaN(authDate)) throw new AuthError('Invalid auth_date');

  const userStr = params.get('user');
  if (!userStr) throw new AuthError('Missing user in initData');

  let user: { id: number; username?: string; first_name?: string };
  try {
    user = JSON.parse(userStr);
  } catch {
    throw new AuthError('Invalid user JSON');
  }

  if (!user.id || typeof user.id !== 'number') {
    throw new AuthError('Invalid user id');
  }

  // Build data-check-string: sorted key=value pairs excluding hash
  params.delete('hash');
  const sorted = Array.from(params.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');

  return { hash, dataCheckString: sorted, authDate, user };
}

async function verifySignature(
  dataCheckString: string,
  hash: string,
  botToken: string,
): Promise<boolean> {
  const enc = new TextEncoder();

  // secret_key = HMAC-SHA256("WebAppData", bot_token)
  const secretKeyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode('WebAppData'),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const secretKey = await crypto.subtle.sign('HMAC', secretKeyMaterial, enc.encode(botToken));

  // computed_hash = HMAC-SHA256(secret_key, data_check_string)
  const hmacKey = await crypto.subtle.importKey(
    'raw',
    secretKey,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', hmacKey, enc.encode(dataCheckString));
  const computedHash = Array.from(new Uint8Array(sig), (b) =>
    b.toString(16).padStart(2, '0'),
  ).join('');

  return computedHash === hash;
}

export async function authenticate(
  db: D1Database,
  initData: string,
  botToken: string,
): Promise<AuthenticatedUser> {
  const parsed = parseInitData(initData);

  // Freshness check
  const now = Math.floor(Date.now() / 1000);
  if (now - parsed.authDate > INIT_DATA_MAX_AGE_S) {
    throw new AuthError('initData expired');
  }

  // Signature check
  const valid = await verifySignature(parsed.dataCheckString, parsed.hash, botToken);
  if (!valid) {
    throw new AuthError('Invalid initData signature');
  }

  return provisionUser(db, parsed.user);
}

export async function provisionUser(
  db: D1Database,
  tgUser: { id: number; username?: string; first_name?: string },
): Promise<AuthenticatedUser> {
  const existing = await db
    .prepare('SELECT id, tg_id, username, first_name FROM users WHERE tg_id = ?')
    .bind(tgUser.id)
    .first<UserRow>();

  if (existing) {
    const wallet = await db
      .prepare('SELECT id FROM wallets WHERE user_id = ?')
      .bind(existing.id)
      .first<{ id: string }>();

    return {
      id: existing.id,
      tgId: existing.tg_id,
      username: existing.username,
      firstName: existing.first_name,
      walletId: wallet!.id,
      isNewUser: false,
    };
  }

  const userId = generateId();
  const walletId = generateId();

  await db.batch([
    db
      .prepare('INSERT INTO users (id, tg_id, username, first_name) VALUES (?, ?, ?, ?)')
      .bind(userId, tgUser.id, tgUser.username ?? null, tgUser.first_name ?? null),
    db
      .prepare('INSERT INTO wallets (id, user_id, currency, balance) VALUES (?, ?, ?, ?)')
      .bind(walletId, userId, 'CHIP', 0),
  ]);

  // Grant starting chips through the wallet service
  await credit(db, walletId, STARTING_CHIPS, 'signup_bonus', {
    refKey: `signup:${userId}`,
    description: 'Starting chips',
  });

  return {
    id: userId,
    tgId: tgUser.id,
    username: tgUser.username ?? null,
    firstName: tgUser.first_name ?? null,
    walletId,
    isNewUser: true,
  };
}
