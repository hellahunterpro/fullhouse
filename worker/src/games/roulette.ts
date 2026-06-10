import type { GameModule, PlayerContext, BetValidationResult, ResolveResult } from './contract.js';

export type RouletteBetType =
  | 'straight'  // single number
  | 'red'
  | 'black'
  | 'odd'
  | 'even'
  | 'high'     // 19-36
  | 'low'      // 1-18
  | 'dozen1'   // 1-12
  | 'dozen2'   // 13-24
  | 'dozen3';  // 25-36

export interface RouletteBet {
  stake: number;
  betType: RouletteBetType;
  number?: number; // only for 'straight'
}

const MIN_STAKE = 1;
const MAX_STAKE = 1_000_000;
const ROULETTE_SLOTS = 37; // 0-36 (European)

const RED_NUMBERS = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);

const PAYOUTS: Record<RouletteBetType, number> = {
  straight: 36,
  red: 2,
  black: 2,
  odd: 2,
  even: 2,
  high: 2,
  low: 2,
  dozen1: 3,
  dozen2: 3,
  dozen3: 3,
};

function isWin(betType: RouletteBetType, number: number | undefined, spin: number): boolean {
  if (spin === 0) return betType === 'straight' && number === 0;

  switch (betType) {
    case 'straight': return spin === number;
    case 'red': return RED_NUMBERS.has(spin);
    case 'black': return !RED_NUMBERS.has(spin);
    case 'odd': return spin % 2 === 1;
    case 'even': return spin % 2 === 0;
    case 'high': return spin >= 19;
    case 'low': return spin <= 18;
    case 'dozen1': return spin >= 1 && spin <= 12;
    case 'dozen2': return spin >= 13 && spin <= 24;
    case 'dozen3': return spin >= 25 && spin <= 36;
  }
}

const VALID_BET_TYPES: RouletteBetType[] = [
  'straight', 'red', 'black', 'odd', 'even', 'high', 'low', 'dozen1', 'dozen2', 'dozen3',
];

export const rouletteGame: GameModule<RouletteBet, null> = {
  id: 'roulette',
  name: 'Roulette',
  runtimeTier: 'house',
  uiComponent: 'RouletteScreen',

  validateBet(bet: RouletteBet, player: PlayerContext): BetValidationResult {
    if (!bet || typeof bet.stake !== 'number') {
      return { valid: false, error: 'Invalid bet format' };
    }
    if (bet.stake < MIN_STAKE || bet.stake > MAX_STAKE) {
      return { valid: false, error: `Stake must be between ${MIN_STAKE} and ${MAX_STAKE}` };
    }
    if (!Number.isInteger(bet.stake)) {
      return { valid: false, error: 'Stake must be an integer' };
    }
    if (!VALID_BET_TYPES.includes(bet.betType)) {
      return { valid: false, error: 'Invalid bet type' };
    }
    if (bet.betType === 'straight') {
      if (bet.number === undefined || !Number.isInteger(bet.number) || bet.number < 0 || bet.number > 36) {
        return { valid: false, error: 'Straight bet requires a number 0-36' };
      }
    }
    if (bet.stake > player.balance) {
      return { valid: false, error: 'Insufficient balance' };
    }
    return { valid: true };
  },

  resolve(rngRoll: number, bets: Array<{ bet: RouletteBet; player: PlayerContext }>): ResolveResult {
    const spin = rngRoll % ROULETTE_SLOTS;
    const color = spin === 0 ? 'green' : RED_NUMBERS.has(spin) ? 'red' : 'black';

    const payouts = bets.map(({ bet, player }) => {
      const win = isWin(bet.betType, bet.number, spin);
      return { walletId: player.walletId, amount: win ? bet.stake * PAYOUTS[bet.betType] : 0 };
    });

    return {
      payouts,
      outcome: {
        spin,
        color,
        win: isWin(bets[0].bet.betType, bets[0].bet.number, spin),
        payout: payouts[0].amount,
        multiplier: PAYOUTS[bets[0].bet.betType],
      },
    };
  },

  getState() {
    return null;
  },
};
