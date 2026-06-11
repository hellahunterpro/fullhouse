import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { DiceGame } from '../components/DiceGame';

const playMock = vi.fn();

vi.mock('../api', () => ({
  play: (...args: unknown[]) => playMock(...args),
}));

afterEach(() => cleanup());

beforeEach(() => {
  playMock.mockReset();
  // Skip the scramble animation so the settle path runs synchronously.
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

describe('dice screen', () => {
  it('settles the displayed number on the server roll', async () => {
    playMock.mockResolvedValue({
      roundId: 'r1',
      outcome: { roll: 42, target: 50, direction: 'under', win: true, payout: 198, multiplier: 1.98 },
      balanceBefore: 1000,
      balanceAfter: 1098,
      proof: { serverSeedHash: 'h', maxRoll: 100, clientSeeds: ['s'], nonce: 1, combinedHmac: 'm', roll: 42 },
    });
    const onBalance = vi.fn();
    render(<DiceGame balance={1000} onBalanceUpdate={onBalance} />);

    fireEvent.click(screen.getByRole('button', { name: /Roll Dice/ }));

    expect(await screen.findByText('42')).toBeTruthy();
    expect(screen.getByText(/Won 198 chips/)).toBeTruthy();
    expect(onBalance).toHaveBeenCalledWith(1098);
  });

  it('shows the lose state on a losing roll', async () => {
    playMock.mockResolvedValue({
      roundId: 'r2',
      outcome: { roll: 87, target: 50, direction: 'under', win: false, payout: 0, multiplier: 1.98 },
      balanceBefore: 1000,
      balanceAfter: 900,
      proof: { serverSeedHash: 'h', maxRoll: 100, clientSeeds: ['s'], nonce: 2, combinedHmac: 'm', roll: 87 },
    });
    render(<DiceGame balance={1000} onBalanceUpdate={() => {}} />);

    fireEvent.click(screen.getByRole('button', { name: /Roll Dice/ }));

    expect(await screen.findByText('87')).toBeTruthy();
    expect(screen.getByText(/No luck this time/)).toBeTruthy();
  });

  it('surfaces server errors and resets', async () => {
    playMock.mockRejectedValue(new Error('Insufficient balance'));
    render(<DiceGame balance={1000} onBalanceUpdate={() => {}} />);

    fireEvent.click(screen.getByRole('button', { name: /Roll Dice/ }));

    expect(await screen.findByText('Insufficient balance')).toBeTruthy();
  });
});
