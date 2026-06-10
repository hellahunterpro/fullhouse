import { describe, it, expect } from 'vitest';
import { diceGame, calculateMultiplier } from './dice.js';
import type { PlayerContext } from './contract.js';

const player: PlayerContext = { userId: 'u1', walletId: 'w1', balance: 10_000 };

const rng = (roll: number) => ({
  roll,
  hmacHex: roll.toString(16).padStart(2, '0').repeat(32).slice(0, 64),
});


describe('dice game', () => {
  describe('validateBet', () => {
    it('accepts a valid bet', () => {
      expect(diceGame.validateBet({ stake: 100, target: 50, direction: 'under' }, player))
        .toEqual({ valid: true });
    });

    it('rejects stake below minimum', () => {
      const r = diceGame.validateBet({ stake: 0, target: 50, direction: 'under' }, player);
      expect(r.valid).toBe(false);
    });

    it('rejects stake above maximum', () => {
      const r = diceGame.validateBet({ stake: 2_000_000, target: 50, direction: 'under' }, player);
      expect(r.valid).toBe(false);
    });

    it('rejects non-integer stake', () => {
      const r = diceGame.validateBet({ stake: 10.5, target: 50, direction: 'under' }, player);
      expect(r.valid).toBe(false);
    });

    it('rejects target below range', () => {
      const r = diceGame.validateBet({ stake: 100, target: 0, direction: 'under' }, player);
      expect(r.valid).toBe(false);
    });

    it('rejects target above range', () => {
      const r = diceGame.validateBet({ stake: 100, target: 99, direction: 'under' }, player);
      expect(r.valid).toBe(false);
    });

    it('rejects invalid direction', () => {
      const r = diceGame.validateBet({ stake: 100, target: 50, direction: 'sideways' as 'under' }, player);
      expect(r.valid).toBe(false);
    });

    it('rejects insufficient balance', () => {
      const broke = { ...player, balance: 50 };
      const r = diceGame.validateBet({ stake: 100, target: 50, direction: 'under' }, broke);
      expect(r.valid).toBe(false);
      expect(r.error).toContain('Insufficient');
    });

    it('accepts boundary targets (1 and 98)', () => {
      expect(diceGame.validateBet({ stake: 100, target: 1, direction: 'under' }, player).valid).toBe(true);
      expect(diceGame.validateBet({ stake: 100, target: 98, direction: 'over' }, player).valid).toBe(true);
    });
  });

  describe('calculateMultiplier', () => {
    it('returns higher multiplier for less likely outcomes', () => {
      const low = calculateMultiplier(10, 'under');  // 10% chance
      const mid = calculateMultiplier(50, 'under');  // 50% chance
      const high = calculateMultiplier(90, 'under'); // 90% chance

      expect(low).toBeGreaterThan(mid);
      expect(mid).toBeGreaterThan(high);
    });

    it('accounts for house edge', () => {
      // Fair multiplier for 50% chance = 2.0, with 1% edge should be < 2.0
      const m = calculateMultiplier(50, 'under');
      expect(m).toBeLessThan(2.0);
      expect(m).toBeGreaterThan(1.9);
    });

    it('is symmetric for equivalent probabilities', () => {
      // under 25 (25% chance) vs over 75 (25% chance)
      expect(calculateMultiplier(25, 'under')).toBe(calculateMultiplier(75, 'over'));
    });
  });

  describe('resolve', () => {
    it('wins on roll under target', () => {
      const result = diceGame.resolve(rng(30), [{ bet: { stake: 100, target: 50, direction: 'under' }, player }]);
      const outcome = result.outcome as { win: boolean; roll: number };
      expect(outcome.win).toBe(true);
      expect(outcome.roll).toBe(30);
      expect(result.payouts[0].amount).toBeGreaterThan(0);
    });

    it('loses on roll at or above target (under)', () => {
      const result = diceGame.resolve(rng(50), [{ bet: { stake: 100, target: 50, direction: 'under' }, player }]);
      const outcome = result.outcome as { win: boolean };
      expect(outcome.win).toBe(false);
      expect(result.payouts[0].amount).toBe(0);
    });

    it('wins on roll at or above target (over)', () => {
      const result = diceGame.resolve(rng(50), [{ bet: { stake: 100, target: 50, direction: 'over' }, player }]);
      const outcome = result.outcome as { win: boolean };
      expect(outcome.win).toBe(true);
      expect(result.payouts[0].amount).toBeGreaterThan(0);
    });

    it('loses on roll below target (over)', () => {
      const result = diceGame.resolve(rng(30), [{ bet: { stake: 100, target: 50, direction: 'over' }, player }]);
      const outcome = result.outcome as { win: boolean };
      expect(outcome.win).toBe(false);
      expect(result.payouts[0].amount).toBe(0);
    });

    it('deterministic for same inputs', () => {
      const args = [{ bet: { stake: 100, target: 50, direction: 'under' as const }, player }];
      const r1 = diceGame.resolve(rng(42), args);
      const r2 = diceGame.resolve(rng(42), args);
      expect(r1).toEqual(r2);
    });

    it('handles boundary roll values', () => {
      // Roll 0: under any valid target should win
      const r0 = diceGame.resolve(rng(0), [{ bet: { stake: 100, target: 1, direction: 'under' }, player }]);
      expect((r0.outcome as { win: boolean }).win).toBe(true);

      // Roll 99: over 98 should win (roll >= 98)
      const r99 = diceGame.resolve(rng(99), [{ bet: { stake: 100, target: 98, direction: 'over' }, player }]);
      expect((r99.outcome as { win: boolean }).win).toBe(true);
    });

    it('wraps rngRoll into valid range', () => {
      // rngRoll = 150 should be 150 % 100 = 50
      const result = diceGame.resolve(rng(150), [{ bet: { stake: 100, target: 50, direction: 'under' }, player }]);
      expect((result.outcome as { roll: number }).roll).toBe(50);
    });

    it('payout matches stake * multiplier', () => {
      const stake = 1000;
      const target = 50;
      const multiplier = calculateMultiplier(target, 'under');
      const result = diceGame.resolve(rng(25), [{ bet: { stake, target, direction: 'under' }, player }]);
      expect(result.payouts[0].amount).toBe(Math.floor(stake * multiplier));
    });
  });
});
