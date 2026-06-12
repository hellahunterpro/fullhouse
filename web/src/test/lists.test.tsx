import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { relativeTime } from '../components/relativeTime';
import { History } from '../components/History';
import { Leaderboard } from '../components/Leaderboard';

const historyMock = vi.fn();
const leaderboardMock = vi.fn();

vi.mock('../api', () => ({
  fetchHistory: () => historyMock(),
  fetchLeaderboard: () => leaderboardMock(),
  fetchDuels: () => Promise.resolve({ duels: [] }),
}));

afterEach(() => cleanup());

describe('relativeTime', () => {
  const now = new Date('2026-06-11T12:00:00Z');

  it('formats recent and older times', () => {
    expect(relativeTime('2026-06-11T11:59:40Z', now)).toBe('just now');
    expect(relativeTime('2026-06-11T11:55:00Z', now)).toBe('5m ago');
    expect(relativeTime('2026-06-11T09:00:00Z', now)).toBe('3h ago');
    expect(relativeTime('2026-06-09T12:00:00Z', now)).toBe('2d ago');
  });

  it('parses SQLite space-separated timestamps', () => {
    expect(relativeTime('2026-06-11 11:55:00', now)).toBe('5m ago');
  });
});

describe('history list', () => {
  it('renders win and loss cards with flow and delta', async () => {
    historyMock.mockResolvedValue({
      history: [
        {
          roundId: 'r1',
          gameId: 'dice',
          stake: 100,
          payout: 198,
          netDelta: 98,
          outcome: {},
          timestamp: new Date().toISOString(),
        },
        {
          roundId: 'r2',
          gameId: 'mines',
          stake: 250,
          payout: 0,
          netDelta: -250,
          outcome: {},
          timestamp: new Date().toISOString(),
        },
      ],
    });
    render(<History />);

    expect(await screen.findByText('Dice')).toBeTruthy();
    expect(screen.getByText('Mines')).toBeTruthy();
    expect(screen.getByText('100 → 198')).toBeTruthy();
    expect(screen.getByText('+98')).toBeTruthy();
    expect(screen.getByText('-250')).toBeTruthy();
  });
});

describe('leaderboard list', () => {
  it('renders ranks with top-3 styling', async () => {
    leaderboardMock.mockResolvedValue({
      leaderboard: [
        { userId: 'u1', username: 'ace', balance: 90000, rank: 1 },
        { userId: 'u2', username: null, balance: 50000, rank: 2 },
        { userId: 'u3', username: 'trey', balance: 30000, rank: 3 },
        { userId: 'u4', username: 'four', balance: 10000, rank: 4 },
      ],
    });
    render(<Leaderboard />);

    expect(await screen.findByText('ace')).toBeTruthy();
    expect(screen.getByText('Anonymous')).toBeTruthy();
    expect(screen.getByText('1').className).toContain('leaderboard-rank--top1');
    expect(screen.getByText('4').className).not.toContain('leaderboard-rank--top');
    expect(screen.getByText((90000).toLocaleString())).toBeTruthy();
  });
});
