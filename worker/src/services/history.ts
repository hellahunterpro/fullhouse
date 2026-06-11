import type { AuditEventRow } from '@fullhouse/core';

export interface GameHistoryEntry {
  roundId: string;
  gameId: string;
  stake: number;
  payout: number;
  netDelta: number;
  outcome: Record<string, unknown>;
  timestamp: string;
}

export async function getHistory(
  db: D1Database,
  userId: string,
  limit = 20,
): Promise<GameHistoryEntry[]> {
  const rows = await db
    .prepare(
      `SELECT payload, created_at FROM audit_events
       WHERE user_id = ? AND event_type = 'bet_resolved'
       ORDER BY created_at DESC LIMIT ?`,
    )
    .bind(userId, limit)
    .all<Pick<AuditEventRow, 'payload' | 'created_at'>>();

  return rows.results.map((row) => {
    const p = JSON.parse(row.payload);
    return {
      roundId: p.roundId,
      gameId: p.gameId,
      stake: p.stake,
      payout: p.payout,
      netDelta: p.netDelta,
      outcome: p.outcome,
      timestamp: row.created_at,
    };
  });
}
