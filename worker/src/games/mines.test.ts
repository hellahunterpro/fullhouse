import { describe, it, expect } from 'vitest';
import { minesGame } from './mines.js';
import type { PlayerContext } from './contract.js';

const player: PlayerContext = { userId: 'u1', walletId: 'w1', balance: 10_000 };

describe('mines game', () => {
  it('accepts valid bet', () => {
    const r = minesGame.validateBet({ stake: 100, mineCount: 5, picks: [0, 1, 2] }, player);
    expect(r.valid).toBe(true);
  });

  it('rejects zero picks', () => {
    const r = minesGame.validateBet({ stake: 100, mineCount: 5, picks: [] }, player);
    expect(r.valid).toBe(false);
  });

  it('rejects too many picks', () => {
    const picks = Array.from({ length: 22 }, (_, i) => i);
    const r = minesGame.validateBet({ stake: 100, mineCount: 5, picks }, player);
    expect(r.valid).toBe(false);
  });

  it('rejects invalid mine count', () => {
    expect(minesGame.validateBet({ stake: 100, mineCount: 0, picks: [0] }, player).valid).toBe(false);
    expect(minesGame.validateBet({ stake: 100, mineCount: 25, picks: [0] }, player).valid).toBe(false);
  });

  it('rejects duplicate picks', () => {
    const r = minesGame.validateBet({ stake: 100, mineCount: 3, picks: [0, 0, 1] }, player);
    expect(r.valid).toBe(false);
  });

  it('rejects out of range picks', () => {
    const r = minesGame.validateBet({ stake: 100, mineCount: 3, picks: [25] }, player);
    expect(r.valid).toBe(false);
  });

  it('resolves deterministically', () => {
    const args = [{ bet: { stake: 100, mineCount: 3, picks: [0, 5, 10] }, player }];
    expect(minesGame.resolve(42, args)).toEqual(minesGame.resolve(42, args));
  });

  it('returns mine positions in outcome', () => {
    const r = minesGame.resolve(12345, [{ bet: { stake: 100, mineCount: 5, picks: [0] }, player }]);
    const outcome = r.outcome as { minePositions: number[] };
    expect(outcome.minePositions).toHaveLength(5);
    expect(outcome.minePositions.every((p: number) => p >= 0 && p < 25)).toBe(true);
  });

  it('pays more for more picks without mines', () => {
    const r1 = minesGame.resolve(999, [{ bet: { stake: 100, mineCount: 5, picks: [0] }, player }]);
    const r2 = minesGame.resolve(999, [{ bet: { stake: 100, mineCount: 5, picks: [0, 1, 2, 3, 4] }, player }]);
    const o1 = r1.outcome as { win: boolean; multiplier: number };
    const o2 = r2.outcome as { win: boolean; multiplier: number };
    if (o1.win && o2.win) {
      expect(o2.multiplier).toBeGreaterThan(o1.multiplier);
    }
  });
});
