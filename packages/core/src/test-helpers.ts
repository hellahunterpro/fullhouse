// Helpers shared by workspace test suites. Not part of the runtime bundle.

/** Builds initData with a valid Telegram WebApp HMAC signature for tests. */
export async function createValidInitData(
  botToken: string,
  user: { id: number; username?: string; first_name?: string },
  authDate?: number,
): Promise<string> {
  const enc = new TextEncoder();
  const now = authDate ?? Math.floor(Date.now() / 1000);

  const params = new URLSearchParams();
  params.set('auth_date', String(now));
  params.set('user', JSON.stringify(user));
  params.set('query_id', 'test-query');

  const sorted = Array.from(params.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');

  const secretKeyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode('WebAppData'),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const secretKey = await crypto.subtle.sign('HMAC', secretKeyMaterial, enc.encode(botToken));
  const hmacKey = await crypto.subtle.importKey(
    'raw',
    secretKey,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', hmacKey, enc.encode(sorted));
  const hash = Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, '0')).join('');

  params.set('hash', hash);
  return params.toString();
}
