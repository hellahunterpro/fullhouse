import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { MinesGame, minesMultiplier } from '../components/MinesGame';

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

describe('mines multiplier', () => {
  it('matches the server formula', () => {
    // 1 pick, 5 mines: 25/20 * 0.99 = 1.2375 -> 1.23
    expect(minesMultiplier(1, 5)).toBe(1.23);
    // 1 pick, 24 mines: 25/1 * 0.99 = 24.75
    expect(minesMultiplier(1, 24)).toBe(24.75);
    // 2 picks, 5 mines: (25/20)*(24/19)*0.99
    const expected = Math.floor((25 / 20) * (24 / 19) * 0.99 * 100) / 100;
    expect(minesMultiplier(2, 5)).toBe(expected);
  });
});

describe('mines screen', () => {
  it('reveals picked tiles as gems and missed mines on bust', async () => {
    playMock.mockResolvedValue({
      roundId: 'r1',
      outcome: {
        minePositions: [3, 10, 17],
        picks: [0, 3],
        hitMine: true,
        win: false,
        payout: 0,
        multiplier: 0,
        revealedSafe: 1,
      },
      balanceBefore: 1000,
      balanceAfter: 900,
      proof: { serverSeedHash: 'h', maxRoll: 4294967296, clientSeeds: ['s'], nonce: 1, combinedHmac: 'm', roll: 7 },
    });
    render(<MinesGame balance={1000} onResult={() => {}} />);

    fireEvent.click(screen.getByTestId('tile-0'));
    fireEvent.click(screen.getByTestId('tile-3'));
    fireEvent.click(screen.getByRole('button', { name: /Reveal/ }));

    expect(await screen.findByText(/Boom! Hit a mine/)).toBeTruthy();
    // Picked safe tile shows a gem, picked mine shows a mine.
    expect(screen.getByTestId('tile-0').dataset.state).toBe('gem');
    expect(screen.getByTestId('tile-3').dataset.state).toBe('mine');
    // Unpicked mines are revealed on bust.
    expect(screen.getByTestId('tile-10').dataset.state).toBe('mine-missed');
    expect(screen.getByTestId('tile-17').dataset.state).toBe('mine-missed');
    // Safe unpicked tiles stay hidden.
    expect(screen.getByTestId('tile-1').dataset.state).toBe('hidden');
  });

  it('reveals all picks as gems on a win and reports payout', async () => {
    playMock.mockResolvedValue({
      roundId: 'r2',
      outcome: {
        minePositions: [20, 21],
        picks: [0, 1, 2],
        hitMine: false,
        win: true,
        payout: 130,
        multiplier: 1.3,
        revealedSafe: 3,
      },
      balanceBefore: 1000,
      balanceAfter: 1030,
      proof: { serverSeedHash: 'h', maxRoll: 4294967296, clientSeeds: ['s'], nonce: 2, combinedHmac: 'm', roll: 9 },
    });
    const onResult = vi.fn();
    render(<MinesGame balance={1000} onResult={onResult} />);

    fireEvent.click(screen.getByTestId('tile-0'));
    fireEvent.click(screen.getByTestId('tile-1'));
    fireEvent.click(screen.getByTestId('tile-2'));
    fireEvent.click(screen.getByRole('button', { name: /Reveal/ }));

    expect(await screen.findByText(/Won 130 chips/)).toBeTruthy();
    expect(screen.getByTestId('tile-0').dataset.state).toBe('gem');
    expect(screen.getByTestId('tile-1').dataset.state).toBe('gem');
    expect(screen.getByTestId('tile-2').dataset.state).toBe('gem');
    // Mines stay hidden when the round is won.
    expect(screen.getByTestId('tile-20').dataset.state).toBe('hidden');
    expect(onResult).toHaveBeenCalledWith(expect.objectContaining({ balanceAfter: 1030 }));
    // Play Again resets the board.
    fireEvent.click(screen.getByRole('button', { name: /Play Again/ }));
    expect(screen.getByTestId('tile-0').dataset.state).toBe('hidden');
  });

  it('limits picks to the safe tile count', () => {
    render(<MinesGame balance={1000} onResult={() => {}} />);
    // With default 5 mines there are 20 safe tiles; picking all 25 stops at 20.
    for (let i = 0; i < 25; i++) {
      fireEvent.click(screen.getByTestId(`tile-${i}`));
    }
    expect(screen.getByText(/20\/20 picked/)).toBeTruthy();
  });
});
