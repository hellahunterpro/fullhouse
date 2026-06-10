import type { GameModule, PlayerContext, BetValidationResult, ResolveResult, RngOutcome } from './contract.js';

export interface DiceBet {
  stake: number;
  target: number;
  direction: 'under' | 'over';
}

export interface DiceOutcome {
  roll: number;
  target: number;
  direction: 'under' | 'over';
  win: boolean;
  payout: number;
  multiplier: number;
}

const MIN_STAKE = 1;
const MAX_STAKE = 1_000_000;
const ROLL_RANGE = 100; // [0, 99]
// Target range: 1–98 for under, 1–98 for over
const MIN_TARGET = 1;
const MAX_TARGET = 98;
const HOUSE_EDGE = 0.01;

export function calculateMultiplier(target: number, direction: 'under' | 'over'): number {
  // Win probability: how many of 100 outcomes win
  const winCount = direction === 'under' ? target : ROLL_RANGE - target;
  if (winCount <= 0) return 0;
  const fairMultiplier = ROLL_RANGE / winCount;
  return Math.floor(fairMultiplier * (1 - HOUSE_EDGE) * 100) / 100;
}

export const diceGame: GameModule<DiceBet, null> = {
  id: 'dice',
  name: 'Dice',
  runtimeTier: 'house',
  maxRoll: 100,
  uiComponent: 'DiceScreen',

  validateBet(bet: DiceBet, player: PlayerContext): BetValidationResult {
    if (!bet || typeof bet.stake !== 'number') {
      return { valid: false, error: 'Invalid bet format' };
    }
    if (bet.stake < MIN_STAKE || bet.stake > MAX_STAKE) {
      return { valid: false, error: `Stake must be between ${MIN_STAKE} and ${MAX_STAKE}` };
    }
    if (!Number.isInteger(bet.stake)) {
      return { valid: false, error: 'Stake must be an integer' };
    }
    if (bet.direction !== 'under' && bet.direction !== 'over') {
      return { valid: false, error: 'Direction must be "under" or "over"' };
    }
    if (!Number.isInteger(bet.target) || bet.target < MIN_TARGET || bet.target > MAX_TARGET) {
      return { valid: false, error: `Target must be an integer between ${MIN_TARGET} and ${MAX_TARGET}` };
    }
    if (bet.stake > player.balance) {
      return { valid: false, error: 'Insufficient balance' };
    }
    return { valid: true };
  },

  resolve(rng: RngOutcome, bets: Array<{ bet: DiceBet; player: PlayerContext }>): ResolveResult {
    const roll = rng.roll % ROLL_RANGE;
    const payouts = bets.map(({ bet, player }) => {
      const win =
        bet.direction === 'under' ? roll < bet.target : roll >= bet.target;
      const multiplier = calculateMultiplier(bet.target, bet.direction);
      const payout = win ? Math.floor(bet.stake * multiplier) : 0;

      return { walletId: player.walletId, amount: payout };
    });

    const firstBet = bets[0].bet;
    const win = firstBet.direction === 'under' ? roll < firstBet.target : roll >= firstBet.target;
    const multiplier = calculateMultiplier(firstBet.target, firstBet.direction);

    return {
      payouts,
      outcome: {
        roll,
        target: firstBet.target,
        direction: firstBet.direction,
        win,
        payout: payouts[0].amount,
        multiplier,
      } satisfies DiceOutcome,
    };
  },

  getState() {
    return null;
  },
};
