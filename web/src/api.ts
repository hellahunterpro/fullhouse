const API_BASE = '/api';

function getInitData(): string {
  if (typeof window !== 'undefined' && window.Telegram?.WebApp?.initData) {
    return window.Telegram.WebApp.initData;
  }
  return '';
}

/** Local two-client testing: ?as=2 in the URL acts as a second dev identity. */
export function getDevUserId(): string | null {
  if (typeof window === 'undefined' || window.Telegram?.WebApp?.initData) return null;
  try {
    return new URLSearchParams(window.location.search).get('as');
  } catch {
    return null;
  }
}

async function request<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const initData = getInitData();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...opts.headers as Record<string, string>,
  };
  if (initData) headers['X-Init-Data'] = initData;
  const devUser = getDevUserId();
  if (devUser) headers['X-Dev-User'] = devUser;

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
  dailyBonus: { available: boolean; streak: number };
  realtimeUrl: string;
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

/** Server-side re-check of a finished round once its seed has been revealed. */
export function verifyRound(proof: PublicProof, serverSeed: string): Promise<{ valid: boolean }> {
  return request<{ valid: boolean }>('/verify', {
    method: 'POST',
    body: JSON.stringify({ proof: { ...proof, serverSeed }, maxRoll: proof.maxRoll }),
  });
}

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

export type DuelGame = 'coinflip' | 'dice';

export interface CreatedDuel {
  duelId: string;
  game: DuelGame;
  stake: number;
  shareLink: string;
  realtimeUrl: string;
}

export interface DuelSummary {
  duelId: string;
  game: string;
  stake: number;
  state: string;
  round: number;
  creatorName: string | null;
  opponentName: string | null;
  winnerId: string | null;
  won: boolean | null;
  createdAt: string;
  resolvedAt: string | null;
}

export const createDuel = (game: DuelGame, stake: number) =>
  request<CreatedDuel>('/duel/create', {
    method: 'POST',
    body: JSON.stringify({ game, stake }),
  });

export const fetchDuels = () => request<{ duels: DuelSummary[] }>('/duels');
