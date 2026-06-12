import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { App } from '../App';
import { ToastProvider } from '../ui';

const fetchMeMock = vi.fn();

vi.mock('../api', () => ({
  fetchMe: () => fetchMeMock(),
  fetchFairness: vi.fn(() => new Promise(() => {})),
  claimDailyBonus: vi.fn(),
  rotateFairness: vi.fn(),
  verifyRound: vi.fn(),
  fetchDuels: vi.fn(() => Promise.resolve({ duels: [] })),
  getDevUserId: vi.fn(() => null),
}));

afterEach(() => cleanup());

beforeEach(() => {
  fetchMeMock.mockReset();
});

function setInitData(value: string) {
  window.Telegram = {
    WebApp: {
      initData: value,
      themeParams: {},
      ready: () => {},
      expand: () => {},
    },
  } as unknown as Window['Telegram'];
}

describe('plain-browser gate', () => {
  it('shows the open-in-Telegram screen when auth fails without initData', async () => {
    setInitData('');
    fetchMeMock.mockRejectedValue(new Error('Missing X-Init-Data header'));
    render(
      <ToastProvider>
        <App />
      </ToastProvider>,
    );
    expect(await screen.findByText(/runs as a Telegram Mini App/)).toBeTruthy();
    expect(screen.queryByText('Connection trouble')).toBeNull();
  });

  it('shows a retryable error when auth fails inside Telegram', async () => {
    setInitData('query_id=abc');
    fetchMeMock.mockRejectedValue(new Error('Server unreachable'));
    render(
      <ToastProvider>
        <App />
      </ToastProvider>,
    );
    expect(await screen.findByText('Connection trouble')).toBeTruthy();
    expect(screen.getByText('Server unreachable')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Try again/ })).toBeTruthy();
  });
});
