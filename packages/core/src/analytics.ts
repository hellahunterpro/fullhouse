import { writeAuditEvent } from './audit.js';

export async function trackAuth(
  db: D1Database,
  userId: string,
  isNewUser: boolean,
  tgId: number,
): Promise<void> {
  await writeAuditEvent(db, userId, 'auth', {
    isNewUser,
    tgId,
    timestamp: new Date().toISOString(),
  });
}

export async function trackBetPlaced(
  db: D1Database,
  userId: string,
  gameId: string,
  roundId: string,
  stake: number,
  params: Record<string, unknown>,
): Promise<void> {
  await writeAuditEvent(db, userId, 'bet_placed', {
    gameId,
    roundId,
    stake,
    ...params,
    timestamp: new Date().toISOString(),
  });
}

export async function trackBetResolved(
  db: D1Database,
  userId: string,
  gameId: string,
  roundId: string,
  stake: number,
  payout: number,
  outcome: Record<string, unknown>,
): Promise<void> {
  await writeAuditEvent(db, userId, 'bet_resolved', {
    gameId,
    roundId,
    stake,
    payout,
    netDelta: payout - stake,
    outcome,
    timestamp: new Date().toISOString(),
  });
}

export async function trackDuelCreated(
  db: D1Database,
  userId: string,
  duelId: string,
  game: string,
  stake: number,
): Promise<void> {
  await writeAuditEvent(db, userId, 'duel_created', {
    duelId,
    game,
    stake,
    timestamp: new Date().toISOString(),
  });
}

export async function trackDuelJoined(
  db: D1Database,
  userId: string,
  duelId: string,
): Promise<void> {
  await writeAuditEvent(db, userId, 'duel_joined', {
    duelId,
    timestamp: new Date().toISOString(),
  });
}

export async function trackDuelResolved(
  db: D1Database,
  winnerId: string,
  duelId: string,
  round: number,
  payout: number,
  loserId: string,
): Promise<void> {
  await writeAuditEvent(db, winnerId, 'duel_resolved', {
    duelId,
    round,
    payout,
    loserId,
    timestamp: new Date().toISOString(),
  });
}

export async function trackDuelRematch(
  db: D1Database,
  userId: string,
  duelId: string,
  round: number,
): Promise<void> {
  await writeAuditEvent(db, userId, 'duel_rematch', {
    duelId,
    round,
    timestamp: new Date().toISOString(),
  });
}

export async function trackBalanceDelta(
  db: D1Database,
  userId: string,
  walletId: string,
  balanceBefore: number,
  balanceAfter: number,
  reason: string,
  roundId: string,
): Promise<void> {
  await writeAuditEvent(db, userId, 'balance_delta', {
    walletId,
    balanceBefore,
    balanceAfter,
    delta: balanceAfter - balanceBefore,
    reason,
    roundId,
    timestamp: new Date().toISOString(),
  });
}
