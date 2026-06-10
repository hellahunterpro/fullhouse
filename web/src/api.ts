const API_BASE = '/api';

function getInitData(): string {
  if (typeof window !== 'undefined' && window.Telegram?.WebApp?.initData) {
    return window.Telegram.WebApp.initData;
  }
  return '';
}

async function request<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      'X-Init-Data': getInitData(),
      ...opts.headers,
    },
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data as T;
}

export interface UserInfo {
  user: { id: string; tgId: number; username: string; firstName: string };
  balance: number;
}

export interface PlayResult {
  roundId: string;
  outcome: {
    roll: number;
    target: number;
    direction: string;
    win: boolean;
    payout: number;
    multiplier: number;
  };
  balanceBefore: number;
  balanceAfter: number;
  proof: {
    serverSeed: string;
    serverSeedHash: string;
    clientSeeds: string[];
    nonce: number;
    combinedHmac: string;
    roll: number;
  };
}

export function fetchMe(): Promise<UserInfo> {
  return request<UserInfo>('/me');
}

export function playDice(
  stake: number,
  target: number,
  direction: 'under' | 'over',
  clientSeed: string,
): Promise<PlayResult> {
  return request<PlayResult>('/play', {
    method: 'POST',
    body: JSON.stringify({
      gameId: 'dice',
      bet: { stake, target, direction },
      clientSeed,
    }),
  });
}
