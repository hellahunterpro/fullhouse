import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import {
  WHEEL_ORDER,
  POCKET_COUNT,
  pocketColor,
  wheelTarget,
  landedPocket,
} from '../components/rouletteWheel';
import { RouletteGame } from '../components/RouletteGame';

const playMock = vi.fn();

vi.mock('../api', () => ({
  play: (...args: unknown[]) => playMock(...args),
}));

afterEach(() => cleanup());

beforeEach(() => {
  playMock.mockReset();
  window.matchMedia = ((query: string) => ({
    matches: true,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
    onchange: null,
  })) as typeof window.matchMedia;
});

describe('wheel math', () => {
  it('uses the standard European order with 37 pockets', () => {
    expect(WHEEL_ORDER).toHaveLength(POCKET_COUNT);
    expect(new Set(WHEEL_ORDER).size).toBe(POCKET_COUNT);
    expect(WHEEL_ORDER[0]).toBe(0);
    expect(WHEEL_ORDER[1]).toBe(32);
    expect(WHEEL_ORDER[36]).toBe(26);
  });

  it('colors pockets correctly', () => {
    expect(pocketColor(0)).toBe('green');
    expect(pocketColor(1)).toBe('red');
    expect(pocketColor(2)).toBe('black');
    expect(pocketColor(32)).toBe('red');
    expect(pocketColor(26)).toBe('black');
  });

  it('lands every possible spin under the pointer', () => {
    for (let spin = 0; spin < POCKET_COUNT; spin++) {
      const target = wheelTarget(0, spin);
      expect(landedPocket(target)).toBe(spin);
    }
  });

  it('keeps landing correctly across consecutive spins with accumulated rotation', () => {
    let deg = 0;
    const spins = [17, 0, 36, 5, 5, 22, 31, 0, 13];
    for (const spin of spins) {
      deg = wheelTarget(deg, spin);
      expect(landedPocket(deg)).toBe(spin);
    }
  });

  it('always spins forward at least the configured turns', () => {
    let deg = 0;
    for (let spin = 0; spin < POCKET_COUNT; spin++) {
      const next = wheelTarget(deg, spin);
      expect(next - deg).toBeGreaterThanOrEqual(5 * 360 - 360 / POCKET_COUNT / 2);
      expect(next).toBeGreaterThan(deg);
      deg = next;
    }
  });
});

describe('roulette screen', () => {
  it('wheel rotation lands on the server spin', async () => {
    playMock.mockResolvedValue({
      roundId: 'r1',
      outcome: { spin: 17, color: 'black', win: false, payout: 0, multiplier: 2 },
      balanceBefore: 1000,
      balanceAfter: 900,
      proof: { serverSeedHash: 'h', maxRoll: 37, clientSeeds: ['s'], nonce: 1, combinedHmac: 'm', roll: 17 },
    });
    render(<RouletteGame balance={1000} onResult={() => {}} />);

    fireEvent.click(screen.getByRole('button', { name: /Spin Wheel/ }));

    expect(await screen.findByText(/No luck this time/)).toBeTruthy();
    const wheel = screen.getByTestId('wheel');
    const rotation = parseFloat(wheel.getAttribute('data-rotation') || '0');
    expect(landedPocket(rotation)).toBe(17);
  });

  it('straight bets require a number before spinning', () => {
    render(<RouletteGame balance={1000} onResult={() => {}} />);
    // Pick the straight-number 7 from the grid, then spin.
    fireEvent.click(screen.getByRole('button', { name: '7' }));
    expect(screen.getByText('Number 7')).toBeTruthy();
    expect(screen.getByText(/36×/)).toBeTruthy();
  });

  it('reports a win with payout', async () => {
    playMock.mockResolvedValue({
      roundId: 'r2',
      outcome: { spin: 32, color: 'red', win: true, payout: 200, multiplier: 2 },
      balanceBefore: 1000,
      balanceAfter: 1100,
      proof: { serverSeedHash: 'h', maxRoll: 37, clientSeeds: ['s'], nonce: 2, combinedHmac: 'm', roll: 32 },
    });
    const onResult = vi.fn();
    render(<RouletteGame balance={1000} onResult={onResult} />);

    fireEvent.click(screen.getByRole('button', { name: /Spin Wheel/ }));

    expect(await screen.findByText(/Won 200 chips/)).toBeTruthy();
    expect(onResult).toHaveBeenCalledWith(expect.objectContaining({ balanceAfter: 1100 }));
    const wheel = screen.getByTestId('wheel');
    expect(landedPocket(parseFloat(wheel.getAttribute('data-rotation') || '0'))).toBe(32);
  });
});
