import type { GameModule, PlayerContext, BetValidationResult, ResolveResult, RngOutcome } from './contract.js';

export interface MinesBet {
  stake: number;
  mineCount: number;
  picks: number[];
}

const MIN_STAKE = 1;
const MAX_STAKE = 1_000_000;
const GRID_SIZE = 25;
const MIN_MINES = 1;
const MAX_MINES = 24;

function calculateMultiplier(picks: number, mines: number): number {
  let multiplier = 1;
  const totalTiles = GRID_SIZE;
  for (let i = 0; i < picks; i++) {
    multiplier *= (totalTiles - i) / (totalTiles - mines - i);
  }
  return Math.floor(multiplier * 0.99 * 100) / 100; // 1% house edge
}

// Draws mine positions from the round's full 256-bit HMAC: one byte per draw
// into a shrinking pool (Fisher-Yates style). 32 bytes cover MAX_MINES = 24
// draws; the byte-modulo bias over a pool of <= 25 is negligible for play money.
function deriveMinePositions(hmacHex: string, mineCount: number): number[] {
  const positions: number[] = [];
  const available = Array.from({ length: GRID_SIZE }, (_, i) => i);

  for (let i = 0; i < mineCount; i++) {
    const byte = parseInt(hmacHex.slice(i * 2, i * 2 + 2), 16);
    const idx = byte % available.length;
    positions.push(available[idx]);
    available.splice(idx, 1);
  }

  return positions.sort((a, b) => a - b);
}

export const minesGame: GameModule<MinesBet, null> = {
  id: 'mines',
  name: 'Mines',
  runtimeTier: 'house',
  maxRoll: 4294967296, // roll unused: positions derive from the full hmac stream
  uiComponent: 'MinesScreen',

  validateBet(bet: MinesBet, player: PlayerContext): BetValidationResult {
    if (!bet || typeof bet.stake !== 'number') {
      return { valid: false, error: 'Invalid bet format' };
    }
    if (bet.stake < MIN_STAKE || bet.stake > MAX_STAKE) {
      return { valid: false, error: `Stake must be between ${MIN_STAKE} and ${MAX_STAKE}` };
    }
    if (!Number.isInteger(bet.stake)) {
      return { valid: false, error: 'Stake must be an integer' };
    }
    if (!Number.isInteger(bet.mineCount) || bet.mineCount < MIN_MINES || bet.mineCount > MAX_MINES) {
      return { valid: false, error: `Mine count must be between ${MIN_MINES} and ${MAX_MINES}` };
    }
    if (!Array.isArray(bet.picks) || bet.picks.length === 0) {
      return { valid: false, error: 'Must pick at least one tile' };
    }
    if (bet.picks.length > GRID_SIZE - bet.mineCount) {
      return { valid: false, error: 'Too many picks for the mine count' };
    }
    const invalidPick = bet.picks.find((p) => !Number.isInteger(p) || p < 0 || p >= GRID_SIZE);
    if (invalidPick !== undefined) {
      return { valid: false, error: `Invalid pick: ${invalidPick}` };
    }
    const uniquePicks = new Set(bet.picks);
    if (uniquePicks.size !== bet.picks.length) {
      return { valid: false, error: 'Duplicate picks not allowed' };
    }
    if (bet.stake > player.balance) {
      return { valid: false, error: 'Insufficient balance' };
    }
    return { valid: true };
  },

  resolve(rng: RngOutcome, bets: Array<{ bet: MinesBet; player: PlayerContext }>): ResolveResult {
    const bet = bets[0].bet;
    const minePositions = deriveMinePositions(rng.hmacHex, bet.mineCount);
    const mineSet = new Set(minePositions);

    const hitMine = bet.picks.some((p) => mineSet.has(p));
    const multiplier = hitMine ? 0 : calculateMultiplier(bet.picks.length, bet.mineCount);
    const payout = hitMine ? 0 : Math.floor(bet.stake * multiplier);

    return {
      payouts: bets.map(({ player }) => ({ walletId: player.walletId, amount: payout })),
      outcome: {
        minePositions,
        picks: bet.picks,
        hitMine,
        win: !hitMine,
        payout,
        multiplier,
        revealedSafe: hitMine ? bet.picks.filter((p) => !mineSet.has(p)).length : bet.picks.length,
      },
    };
  },

  getState() {
    return null;
  },
};

export { GRID_SIZE, MIN_MINES, MAX_MINES };
