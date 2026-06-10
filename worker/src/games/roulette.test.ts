import { describe, it, expect } from 'vitest';
import { rouletteGame } from './roulette.js';
import type { PlayerContext } from './contract.js';

const player: PlayerContext = { userId: 'u1', walletId: 'w1', balance: 10_000 };

const rng = (roll: number) => ({
  roll,
  hmacHex: roll.toString(16).padStart(2, '0').repeat(32).slice(0, 64),
});


describe('roulette game', () => {
  describe('validateBet', () => {
    it('accepts red/black/odd/even/high/low bets', () => {
      for (const betType of ['red', 'black', 'odd', 'even', 'high', 'low'] as const) {
        expect(rouletteGame.validateBet({ stake: 100, betType }, player).valid).toBe(true);
      }
    });

    it('accepts dozen bets', () => {
      for (const betType of ['dozen1', 'dozen2', 'dozen3'] as const) {
        expect(rouletteGame.validateBet({ stake: 100, betType }, player).valid).toBe(true);
      }
    });

    it('accepts straight bet with valid number', () => {
      expect(rouletteGame.validateBet({ stake: 100, betType: 'straight', number: 0 }, player).valid).toBe(true);
      expect(rouletteGame.validateBet({ stake: 100, betType: 'straight', number: 36 }, player).valid).toBe(true);
    });

    it('rejects straight bet without number', () => {
      expect(rouletteGame.validateBet({ stake: 100, betType: 'straight' }, player).valid).toBe(false);
    });

    it('rejects straight bet with invalid number', () => {
      expect(rouletteGame.validateBet({ stake: 100, betType: 'straight', number: 37 }, player).valid).toBe(false);
      expect(rouletteGame.validateBet({ stake: 100, betType: 'straight', number: -1 }, player).valid).toBe(false);
    });
  });

  describe('resolve', () => {
    it('red wins on red number', () => {
      // 1 is red
      const r = rouletteGame.resolve(rng(1), [{ bet: { stake: 100, betType: 'red' }, player }]);
      expect((r.outcome as { win: boolean }).win).toBe(true);
      expect(r.payouts[0].amount).toBe(200);
    });

    it('red loses on black number', () => {
      // 2 is black
      const r = rouletteGame.resolve(rng(2), [{ bet: { stake: 100, betType: 'red' }, player }]);
      expect((r.outcome as { win: boolean }).win).toBe(false);
    });

    it('all bets lose on 0 except straight 0', () => {
      for (const betType of ['red', 'black', 'odd', 'even', 'high', 'low'] as const) {
        const r = rouletteGame.resolve(rng(0), [{ bet: { stake: 100, betType }, player }]);
        expect((r.outcome as { win: boolean }).win).toBe(false);
      }
      const r = rouletteGame.resolve(rng(0), [{ bet: { stake: 100, betType: 'straight', number: 0 }, player }]);
      expect((r.outcome as { win: boolean }).win).toBe(true);
      expect(r.payouts[0].amount).toBe(3600); // 36x
    });

    it('straight bet pays 36x', () => {
      const r = rouletteGame.resolve(rng(17), [{ bet: { stake: 100, betType: 'straight', number: 17 }, player }]);
      expect(r.payouts[0].amount).toBe(3600);
    });

    it('dozen1 covers 1-12', () => {
      const win = rouletteGame.resolve(rng(12), [{ bet: { stake: 100, betType: 'dozen1' }, player }]);
      expect((win.outcome as { win: boolean }).win).toBe(true);
      expect(win.payouts[0].amount).toBe(300);

      const lose = rouletteGame.resolve(rng(13), [{ bet: { stake: 100, betType: 'dozen1' }, player }]);
      expect((lose.outcome as { win: boolean }).win).toBe(false);
    });

    it('returns correct color', () => {
      const green = rouletteGame.resolve(rng(0), [{ bet: { stake: 100, betType: 'red' }, player }]);
      expect((green.outcome as { color: string }).color).toBe('green');

      const red = rouletteGame.resolve(rng(1), [{ bet: { stake: 100, betType: 'red' }, player }]);
      expect((red.outcome as { color: string }).color).toBe('red');

      const black = rouletteGame.resolve(rng(2), [{ bet: { stake: 100, betType: 'red' }, player }]);
      expect((black.outcome as { color: string }).color).toBe('black');
    });

    it('pockets 26-36 land directly (no truncated outcome space)', () => {
      for (let pocket = 26; pocket <= 36; pocket++) {
        const r = rouletteGame.resolve(rng(pocket), [{ bet: { stake: 100, betType: 'straight', number: pocket }, player }]);
        expect((r.outcome as { spin: number }).spin).toBe(pocket);
        expect(r.payouts[0].amount).toBe(3600);
      }
    });

    it('deterministic for same inputs', () => {
      const args = [{ bet: { stake: 100, betType: 'red' as const }, player }];
      expect(rouletteGame.resolve(rng(7), args)).toEqual(rouletteGame.resolve(rng(7), args));
    });
  });
});
