import type { GameModule, PlayerContext, BetValidationResult, ResolveResult } from './contract.js';

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

// Derive mine positions from RNG roll deterministically
function deriveMinePositions(rngRoll: number, mineCount: number, hmacHex: string): number[] {
  const positions: number[] = [];
  const available = Array.from({ length: GRID_SIZE }, (_, i) => i);

  for (let i = 0; i < mineCount; i++) {
    // Use successive 4-char chunks of the hmac hex to pick positions
    const chunk = hmacHex.slice((i * 4) % (hmacHex.length - 4), (i * 4) % (hmacHex.length - 4) + 4);
    const idx = parseInt(chunk, 16) % available.length;
    positions.push(available[idx]);
    available.splice(idx, 1);
  }

  return positions.sort((a, b) => a - b);
}

export const minesGame: GameModule<MinesBet, null> = {
  id: 'mines',
  name: 'Mines',
  runtimeTier: 'house',
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

  resolve(rngRoll: number, bets: Array<{ bet: MinesBet; player: PlayerContext }>): ResolveResult {
    const bet = bets[0].bet;
    // Use rngRoll as a seed to generate a hex string for mine placement
    const hexSeed = rngRoll.toString(16).padStart(8, '0').repeat(8);
    const minePositions = deriveMinePositions(rngRoll, bet.mineCount, hexSeed);
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
