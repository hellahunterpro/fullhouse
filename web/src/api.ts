const API_BASE = '/api';

function getInitData(): string {
  if (typeof window !== 'undefined' && window.Telegram?.WebApp?.initData) {
    return window.Telegram.WebApp.initData;
  }
  return '';
}

async function request<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const initData = getInitData();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...opts.headers as Record<string, string>,
  };
  if (initData) headers['X-Init-Data'] = initData;

  const res = await fetch(`${API_BASE}${path}`, { ...opts, headers });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data as T;
}

export interface Commitment {
  id: string;
  seedHash: string;
  nonce: number;
}

export interface UserInfo {
  user: { id: string; tgId: number; username: string; firstName: string };
  balance: number;
  fairness: Commitment;
}

export interface PublicProof {
  serverSeedHash: string;
  maxRoll: number;
  clientSeeds: string[];
  nonce: number;
  combinedHmac: string;
  roll: number;
}

export interface PlayResult {
  roundId: string;
  outcome: Record<string, unknown>;
  balanceBefore: number;
  balanceAfter: number;
  proof: PublicProof;
}

export interface GameInfo {
  id: string;
  name: string;
  runtimeTier: string;
  uiComponent: string;
}

export interface HistoryEntry {
  roundId: string;
  gameId: string;
  stake: number;
  payout: number;
  netDelta: number;
  outcome: Record<string, unknown>;
  timestamp: string;
}

export interface LeaderboardEntry {
  userId: string;
  username: string | null;
  balance: number;
  rank: number;
}

export interface DailyBonusResult {
  awarded: boolean;
  amount: number;
  streak: number;
  nextAvailable: string;
}

export const fetchMe = () => request<UserInfo>('/me');
export const fetchGames = () => request<{ games: GameInfo[] }>('/games');
export const fetchHistory = () => request<{ history: HistoryEntry[] }>('/history');
export const fetchLeaderboard = () => request<{ leaderboard: LeaderboardEntry[] }>('/leaderboard');
export const claimDailyBonus = () => request<DailyBonusResult>('/daily-bonus', { method: 'POST' });
export const fetchFairness = () => request<{ commitment: Commitment }>('/fairness');

export interface RevealedSeed {
  seed: string;
  seedHash: string;
  nonce: number;
}

export const rotateFairness = () =>
  request<{ revealed: RevealedSeed }>('/fairness/rotate', { method: 'POST' });

export function play(
  gameId: string,
  bet: Record<string, unknown>,
  clientSeed: string,
): Promise<PlayResult> {
  return request<PlayResult>('/play', {
    method: 'POST',
    body: JSON.stringify({ gameId, bet, clientSeed }),
  });
}
