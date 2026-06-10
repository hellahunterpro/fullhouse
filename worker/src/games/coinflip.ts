import type { GameModule, PlayerContext, BetValidationResult, ResolveResult } from './contract.js';

export interface CoinflipBet {
  stake: number;
  choice: 'heads' | 'tails';
}

const MIN_STAKE = 1;
const MAX_STAKE = 1_000_000;
const MULTIPLIER = 1.98; // 2x minus 1% house edge

export const coinflipGame: GameModule<CoinflipBet, null> = {
  id: 'coinflip',
  name: 'Coin Flip',
  runtimeTier: 'house',
  uiComponent: 'CoinflipScreen',

  validateBet(bet: CoinflipBet, player: PlayerContext): BetValidationResult {
    if (!bet || typeof bet.stake !== 'number') {
      return { valid: false, error: 'Invalid bet format' };
    }
    if (bet.stake < MIN_STAKE || bet.stake > MAX_STAKE) {
      return { valid: false, error: `Stake must be between ${MIN_STAKE} and ${MAX_STAKE}` };
    }
    if (!Number.isInteger(bet.stake)) {
      return { valid: false, error: 'Stake must be an integer' };
    }
    if (bet.choice !== 'heads' && bet.choice !== 'tails') {
      return { valid: false, error: 'Choice must be "heads" or "tails"' };
    }
    if (bet.stake > player.balance) {
      return { valid: false, error: 'Insufficient balance' };
    }
    return { valid: true };
  },

  resolve(rngRoll: number, bets: Array<{ bet: CoinflipBet; player: PlayerContext }>): ResolveResult {
    const result = rngRoll % 2 === 0 ? 'heads' : 'tails';
    const payouts = bets.map(({ bet, player }) => {
      const win = bet.choice === result;
      return { walletId: player.walletId, amount: win ? Math.floor(bet.stake * MULTIPLIER) : 0 };
    });

    return {
      payouts,
      outcome: {
        result,
        win: bets[0].bet.choice === result,
        payout: payouts[0].amount,
        multiplier: MULTIPLIER,
      },
    };
  },

  getState() {
    return null;
  },
};
