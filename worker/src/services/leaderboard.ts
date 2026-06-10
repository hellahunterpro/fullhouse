export interface LeaderboardEntry {
  userId: string;
  username: string | null;
  balance: number;
  rank: number;
}

export async function getLeaderboard(
  db: D1Database,
  limit = 20,
): Promise<LeaderboardEntry[]> {
  const rows = await db
    .prepare(
      `SELECT u.id as userId, u.username, w.balance
       FROM wallets w JOIN users u ON u.id = w.user_id
       ORDER BY w.balance DESC LIMIT ?`,
    )
    .bind(limit)
    .all<{ userId: string; username: string | null; balance: number }>();

  return rows.results.map((row, i) => ({
    ...row,
    rank: i + 1,
  }));
}
