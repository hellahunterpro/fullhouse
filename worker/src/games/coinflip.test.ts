import { describe, it, expect } from 'vitest';
import { coinflipGame } from './coinflip.js';
import type { PlayerContext } from './contract.js';

const player: PlayerContext = { userId: 'u1', walletId: 'w1', balance: 10_000 };

describe('coinflip game', () => {
  it('accepts valid bet', () => {
    expect(coinflipGame.validateBet({ stake: 100, choice: 'heads' }, player).valid).toBe(true);
    expect(coinflipGame.validateBet({ stake: 100, choice: 'tails' }, player).valid).toBe(true);
  });

  it('rejects invalid choice', () => {
    expect(coinflipGame.validateBet({ stake: 100, choice: 'edge' as 'heads' }, player).valid).toBe(false);
  });

  it('rejects insufficient balance', () => {
    const broke = { ...player, balance: 50 };
    expect(coinflipGame.validateBet({ stake: 100, choice: 'heads' }, broke).valid).toBe(false);
  });

  it('wins on correct guess (even = heads)', () => {
    const r = coinflipGame.resolve(42, [{ bet: { stake: 100, choice: 'heads' }, player }]);
    expect((r.outcome as { win: boolean }).win).toBe(true);
    expect(r.payouts[0].amount).toBe(198);
  });

  it('loses on wrong guess', () => {
    const r = coinflipGame.resolve(43, [{ bet: { stake: 100, choice: 'heads' }, player }]);
    expect((r.outcome as { win: boolean }).win).toBe(false);
    expect(r.payouts[0].amount).toBe(0);
  });

  it('deterministic for same inputs', () => {
    const args = [{ bet: { stake: 100, choice: 'tails' as const }, player }];
    expect(coinflipGame.resolve(7, args)).toEqual(coinflipGame.resolve(7, args));
  });
});
