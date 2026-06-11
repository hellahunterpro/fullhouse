import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';
import { App } from '../App';
import { DiceGame } from '../components/DiceGame';
import { CoinflipGame } from '../components/CoinflipGame';
import { RouletteGame } from '../components/RouletteGame';
import { MinesGame } from '../components/MinesGame';
import { History } from '../components/History';
import { Leaderboard } from '../components/Leaderboard';
import { ToastProvider } from '../ui';

vi.mock('../api', () => ({
  fetchMe: vi.fn(() =>
    Promise.resolve({
      user: { id: 'u1', tgId: 1, username: 'tester', firstName: 'Test' },
      balance: 5000,
      fairness: { id: 'c1', seedHash: 'a'.repeat(64), nonce: 0 },
    }),
  ),
  claimDailyBonus: vi.fn(() =>
    Promise.resolve({ awarded: true, amount: 1000, streak: 1, nextAvailable: '' }),
  ),
  fetchHistory: vi.fn(() => Promise.resolve({ history: [] })),
  fetchLeaderboard: vi.fn(() => Promise.resolve({ leaderboard: [] })),
  play: vi.fn(),
}));

const noop = () => {};

afterEach(() => cleanup());

describe('screen smoke tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lobby renders without crashing', async () => {
    render(
      <ToastProvider>
        <App />
      </ToastProvider>,
    );
    expect(await screen.findByText(/Welcome, tester/)).toBeTruthy();
    expect(screen.getByText('Full House')).toBeTruthy();
  });

  it('dice screen renders without crashing', () => {
    render(<DiceGame balance={1000} onBalanceUpdate={noop} />);
    expect(screen.getByText(/Roll Dice/i)).toBeTruthy();
  });

  it('coinflip screen renders without crashing', () => {
    render(<CoinflipGame balance={1000} onBalanceUpdate={noop} />);
    expect(screen.getByText(/Flip Coin/i)).toBeTruthy();
  });

  it('roulette screen renders without crashing', () => {
    render(<RouletteGame balance={1000} onBalanceUpdate={noop} />);
    expect(screen.getByText(/Spin Wheel/i)).toBeTruthy();
  });

  it('mines screen renders without crashing', () => {
    render(<MinesGame balance={1000} onBalanceUpdate={noop} />);
    expect(screen.getByText(/Reveal/i)).toBeTruthy();
  });

  it('history renders empty state', async () => {
    render(<History />);
    expect(await screen.findByText(/No games played yet/i)).toBeTruthy();
  });

  it('leaderboard renders empty state', async () => {
    render(<Leaderboard />);
    expect(await screen.findByText(/No players yet/i)).toBeTruthy();
  });
});
