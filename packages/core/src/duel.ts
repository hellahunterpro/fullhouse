export type DuelGame = 'coinflip' | 'dice';

export const DUEL_GAMES: DuelGame[] = ['coinflip', 'dice'];
export const DUEL_MIN_STAKE = 1;
export const DUEL_MAX_STAKE = 1_000_000;

export interface DuelResolution {
  winnerIdx: 0 | 1;
  outcome: { kind: 'coinflip'; result: 0 | 1 } | { kind: 'dice'; rolls: [number, number] };
}

/**
 * Pure mapping from the round's RNG output to a duel winner.
 * Index 0 is the creator, index 1 the opponent.
 *
 * - coinflip: the fair roll in [0,2) picks the winner directly.
 * - dice: successive HMAC byte pairs give both players a 0-99 roll; ties walk
 *   to the next pair so the outcome is always decisive and fully derived from
 *   the published HMAC.
 */
export function resolveDuelOutcome(
  game: DuelGame,
  roll: number,
  hmacHex: string,
): DuelResolution {
  if (game === 'coinflip') {
    const r = (roll % 2) as 0 | 1;
    return { winnerIdx: r, outcome: { kind: 'coinflip', result: r } };
  }

  for (let i = 0; i + 4 <= hmacHex.length; i += 4) {
    const a = parseInt(hmacHex.slice(i, i + 2), 16) % 100;
    const b = parseInt(hmacHex.slice(i + 2, i + 4), 16) % 100;
    if (a !== b) {
      return { winnerIdx: a > b ? 0 : 1, outcome: { kind: 'dice', rolls: [a, b] } };
    }
  }

  // 32 tied byte pairs is practically impossible; fall back to the fair roll.
  const r = (roll % 2) as 0 | 1;
  return { winnerIdx: r, outcome: { kind: 'dice', rolls: r === 0 ? [1, 0] : [0, 1] } };
}
