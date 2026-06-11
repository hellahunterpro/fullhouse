import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { flipTarget, faceAt } from '../components/flipMath';
import { CoinflipGame } from '../components/CoinflipGame';

const playMock = vi.fn();

vi.mock('../api', () => ({
  play: (...args: unknown[]) => playMock(...args),
}));

afterEach(() => cleanup());

beforeEach(() => {
  playMock.mockReset();
  window.matchMedia = ((query: string) => ({
    matches: true, // reduced motion: settle synchronously
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
    onchange: null,
  })) as typeof window.matchMedia;
});

describe('flip mapping', () => {
  it('always ends on the face the server decided', () => {
    let deg = 0;
    const results: Array<'heads' | 'tails'> = [
      'heads', 'tails', 'tails', 'heads', 'tails', 'heads', 'heads', 'tails',
    ];
    for (const r of results) {
      deg = flipTarget(deg, r);
      expect(faceAt(deg)).toBe(r);
    }
  });

  it('always spins forward at least the configured number of turns', () => {
    let deg = 0;
    for (let i = 0; i < 20; i++) {
      const r = i % 3 === 0 ? 'heads' : 'tails';
      const next = flipTarget(deg, r);
      expect(next - deg).toBeGreaterThanOrEqual(4 * 360);
      deg = next;
    }
  });

  it('handles a tails starting angle correctly', () => {
    const fromTails = flipTarget(180, 'heads');
    expect(faceAt(fromTails)).toBe('heads');
    expect(fromTails).toBeGreaterThan(180);
  });
});

describe('coinflip screen', () => {
  it('coin transform settles on the server result', async () => {
    playMock.mockResolvedValue({
      roundId: 'r1',
      outcome: { result: 'tails', win: false, payout: 0, multiplier: 1.98 },
      balanceBefore: 1000,
      balanceAfter: 900,
      proof: { serverSeedHash: 'h', maxRoll: 2, clientSeeds: ['s'], nonce: 1, combinedHmac: 'm', roll: 1 },
    });
    render(<CoinflipGame balance={1000} onResult={() => {}} />);

    fireEvent.click(screen.getByRole('button', { name: /Flip Coin/ }));

    expect(await screen.findByText(/TAILS — no luck this time/)).toBeTruthy();
    const coin = screen.getByTestId('coin');
    const match = /rotateX\((\d+)deg\)/.exec(coin.style.transform);
    expect(match).toBeTruthy();
    expect(faceAt(parseInt(match![1], 10))).toBe('tails');
  });

  it('reports a win with payout', async () => {
    playMock.mockResolvedValue({
      roundId: 'r2',
      outcome: { result: 'heads', win: true, payout: 198, multiplier: 1.98 },
      balanceBefore: 1000,
      balanceAfter: 1098,
      proof: { serverSeedHash: 'h', maxRoll: 2, clientSeeds: ['s'], nonce: 2, combinedHmac: 'm', roll: 0 },
    });
    const onResult = vi.fn();
    render(<CoinflipGame balance={1000} onResult={onResult} />);

    fireEvent.click(screen.getByRole('button', { name: /Flip Coin/ }));

    expect(await screen.findByText(/HEADS — won 198 chips/)).toBeTruthy();
    expect(onResult).toHaveBeenCalledWith(expect.objectContaining({ balanceAfter: 1098 }));
  });
});
