import { describe, it, expect, beforeEach } from 'vitest';
import { registerGame, getGame, listGames, clearRegistry } from './registry.js';
import type { GameModule, PlayerContext, BetValidationResult, ResolveResult, RngOutcome } from './contract.js';

interface FakeBet {
  amount: number;
}

function createFakeGame(id: string): GameModule<FakeBet, null> {
  return {
    id,
    name: `Fake ${id}`,
    runtimeTier: 'house',
    maxRoll: 100,
    uiComponent: `Fake${id}Screen`,

    validateBet(bet: FakeBet, player: PlayerContext): BetValidationResult {
      if (bet.amount <= 0) return { valid: false, error: 'Amount must be positive' };
      if (bet.amount > player.balance) return { valid: false, error: 'Insufficient balance' };
      return { valid: true };
    },

    resolve(rng: RngOutcome, bets: Array<{ bet: FakeBet; player: PlayerContext }>): ResolveResult {
      const payouts = bets.map(({ bet, player }) => ({
        walletId: player.walletId,
        amount: rng.roll > 50 ? bet.amount * 2 : 0,
      }));
      return {
        payouts,
        outcome: { roll: rng.roll, win: rng.roll > 50 },
      };
    },

    getState() {
      return null;
    },
  };
}

beforeEach(() => {
  clearRegistry();
});

describe('game registry', () => {
  it('registers and retrieves a game', () => {
    const game = createFakeGame('fake-1');
    registerGame(game);

    const found = getGame('fake-1');
    expect(found).toBe(game);
    expect(found?.name).toBe('Fake fake-1');
  });

  it('returns undefined for unknown game', () => {
    expect(getGame('nonexistent')).toBeUndefined();
  });

  it('rejects duplicate registration', () => {
    registerGame(createFakeGame('dup'));
    expect(() => registerGame(createFakeGame('dup'))).toThrow('already registered');
  });

  it('lists all registered games', () => {
    registerGame(createFakeGame('a'));
    registerGame(createFakeGame('b'));
    expect(listGames()).toHaveLength(2);
  });

  it('fake game validates and resolves correctly', () => {
    const game = createFakeGame('test');
    registerGame(game);

    const player: PlayerContext = { userId: 'u1', walletId: 'w1', balance: 1000 };

    expect(game.validateBet({ amount: 500 }, player)).toEqual({ valid: true });
    expect(game.validateBet({ amount: 2000 }, player)).toEqual({
      valid: false,
      error: 'Insufficient balance',
    });

    const winResult = game.resolve({ roll: 75, hmacHex: 'ab'.repeat(32) }, [{ bet: { amount: 500 }, player }]);
    expect(winResult.payouts[0].amount).toBe(1000);
    expect(winResult.outcome).toEqual({ roll: 75, win: true });

    const loseResult = game.resolve({ roll: 30, hmacHex: 'ab'.repeat(32) }, [{ bet: { amount: 500 }, player }]);
    expect(loseResult.payouts[0].amount).toBe(0);
    expect(loseResult.outcome).toEqual({ roll: 30, win: false });
  });
});
