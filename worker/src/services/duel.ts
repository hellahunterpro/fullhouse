import {
  generateId,
  getBalance,
  trackDuelCreated,
  DUEL_GAMES,
  DUEL_MIN_STAKE,
  DUEL_MAX_STAKE,
  type DuelGame,
} from '@fullhouse/core';

export interface CreateDuelInput {
  game: DuelGame;
  stake: number;
}

export interface CreatedDuel {
  duelId: string;
  game: DuelGame;
  stake: number;
  shareLink: string;
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

export async function createDuel(
  db: D1Database,
  user: { id: string; walletId: string },
  input: CreateDuelInput,
  botUsername: string,
): Promise<CreatedDuel> {
  if (!DUEL_GAMES.includes(input.game)) {
    throw new Error('Invalid duel game');
  }
  if (
    !Number.isInteger(input.stake) ||
    input.stake < DUEL_MIN_STAKE ||
    input.stake > DUEL_MAX_STAKE
  ) {
    throw new Error(`Invalid stake: must be an integer between ${DUEL_MIN_STAKE} and ${DUEL_MAX_STAKE}`);
  }
  const balance = await getBalance(db, user.walletId);
  if (balance < input.stake) {
    throw new Error('Insufficient balance for this stake');
  }

  const duelId = generateId();
  await db
    .prepare(
      `INSERT INTO duels (id, creator_id, game, stake, state, round) VALUES (?, ?, ?, ?, 'created', 0)`,
    )
    .bind(duelId, user.id, input.game, input.stake)
    .run();

  await trackDuelCreated(db, user.id, duelId, input.game, input.stake);

  return {
    duelId,
    game: input.game,
    stake: input.stake,
    shareLink: botUsername ? `https://t.me/${botUsername}?startapp=duel_${duelId}` : '',
  };
}

export async function listDuels(
  db: D1Database,
  userId: string,
  limit = 20,
): Promise<DuelSummary[]> {
  const { results } = await db
    .prepare(
      `SELECT d.id, d.game, d.stake, d.state, d.round, d.winner_id, d.created_at, d.resolved_at,
              cu.username AS creator_username, cu.first_name AS creator_first_name,
              ou.username AS opponent_username, ou.first_name AS opponent_first_name
       FROM duels d
       JOIN users cu ON cu.id = d.creator_id
       LEFT JOIN users ou ON ou.id = d.opponent_id
       WHERE d.creator_id = ?1 OR d.opponent_id = ?1
       ORDER BY d.created_at DESC
       LIMIT ?2`,
    )
    .bind(userId, limit)
    .all<{
      id: string;
      game: string;
      stake: number;
      state: string;
      round: number;
      winner_id: string | null;
      created_at: string;
      resolved_at: string | null;
      creator_username: string | null;
      creator_first_name: string | null;
      opponent_username: string | null;
      opponent_first_name: string | null;
    }>();

  return results.map((r) => ({
    duelId: r.id,
    game: r.game,
    stake: r.stake,
    state: r.state,
    round: r.round,
    creatorName: r.creator_username ?? r.creator_first_name,
    opponentName: r.opponent_username ?? r.opponent_first_name,
    winnerId: r.winner_id,
    won: r.winner_id === null ? null : r.winner_id === userId,
    createdAt: r.created_at,
    resolvedAt: r.resolved_at,
  }));
}
