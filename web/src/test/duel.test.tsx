import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';
import { DuelGame } from '../components/DuelGame';
import { ToastProvider } from '../ui';

const createDuelMock = vi.fn();

vi.mock('../api', () => ({
  createDuel: (...args: unknown[]) => createDuelMock(...args),
  getDevUserId: () => null,
}));

// Scripted in-memory WebSocket standing in for the realtime worker.
class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  static OPEN = 1;
  readyState = 0;
  url: string;
  sent: string[] = [];
  private listeners: Record<string, Array<(event: unknown) => void>> = {};

  constructor(url: string) {
    this.url = url;
    FakeWebSocket.instances.push(this);
  }

  addEventListener(type: string, fn: (event: unknown) => void) {
    (this.listeners[type] ??= []).push(fn);
  }

  removeEventListener() {}

  send(data: string) {
    this.sent.push(data);
  }

  close() {
    this.readyState = 3;
    this.emit('close', {});
  }

  // test controls
  open() {
    this.readyState = 1;
    this.emit('open', {});
  }

  receive(msg: unknown) {
    this.emit('message', { data: JSON.stringify(msg) });
  }

  private emit(type: string, event: unknown) {
    for (const fn of this.listeners[type] ?? []) fn(event);
  }
}

afterEach(() => cleanup());

beforeEach(() => {
  createDuelMock.mockReset();
  FakeWebSocket.instances = [];
  vi.stubGlobal('WebSocket', FakeWebSocket as unknown as typeof WebSocket);
  window.matchMedia = ((query: string) => ({
    matches: true, // reduced motion: reveal settles instantly
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
    onchange: null,
  })) as typeof window.matchMedia;
  localStorage.setItem('fh_client_seed', 'test-seed');
});

const baseState = {
  type: 'duel_state',
  duelId: 'd1',
  game: 'coinflip',
  stake: 250,
  round: 0,
  creator: { userId: 'u-a', name: 'alice' },
  opponent: null,
  seedHash: 'hash0',
  committed: [] as string[],
  rematchVotes: [] as string[],
  winnerId: null,
};

function renderDuel(props: Partial<Parameters<typeof DuelGame>[0]> = {}) {
  return render(
    <ToastProvider>
      <DuelGame
        balance={5000}
        realtimeUrl="ws://test"
        joinDuelId={null}
        onBalanceRefresh={() => {}}
        {...props}
      />
    </ToastProvider>,
  );
}

describe('duel screen', () => {
  it('creates a challenge and shows the share stage', async () => {
    createDuelMock.mockResolvedValue({
      duelId: 'd1',
      game: 'coinflip',
      stake: 250,
      shareLink: 'https://t.me/bot?startapp=duel_d1',
      realtimeUrl: 'ws://test',
    });
    renderDuel();

    expect(screen.getByText('Create Challenge')).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Create Challenge/ }));
    });
    expect(createDuelMock).toHaveBeenCalledWith('coinflip', 100);

    const ws = FakeWebSocket.instances[0];
    expect(ws).toBeTruthy();
    await act(async () => {
      ws.open();
      ws.receive({ type: 'hello', duelId: 'd1', you: { userId: 'u-a', name: 'alice' }, peers: [] });
      ws.receive({ ...baseState, state: 'created' });
    });

    expect(screen.getByText(/Waiting for an opponent/)).toBeTruthy();
    expect(screen.getByText('https://t.me/bot?startapp=duel_d1')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Share Challenge/ })).toBeTruthy();
  });

  it('joiner accepts, auto-commits after the countdown, and sees the result + rematch', async () => {
    renderDuel({ joinDuelId: 'd1' });
    const ws = FakeWebSocket.instances[0];
    await act(async () => {
      ws.open();
      ws.receive({ type: 'hello', duelId: 'd1', you: { userId: 'u-b', name: 'bob' }, peers: [{ userId: 'u-a', name: 'alice' }, { userId: 'u-b', name: 'bob' }] });
      ws.receive({ ...baseState, state: 'created' });
    });

    // Join stage for a non-creator.
    const accept = screen.getByRole('button', { name: /Accept — stake 250/ });
    fireEvent.click(accept);
    expect(ws.sent.some((s) => JSON.parse(s).type === 'join')).toBe(true);

    // Both in: countdown starts, then the commit is sent automatically.
    await act(async () => {
      ws.receive({
        ...baseState,
        state: 'joined',
        opponent: { userId: 'u-b', name: 'bob' },
      });
    });
    expect(screen.getByTestId('countdown')).toBeTruthy();

    const commit = await vi.waitFor(
      async () => {
        await act(async () => {
          await new Promise((r) => setTimeout(r, 150));
        });
        const found = ws.sent.map((s) => JSON.parse(s)).find((m) => m.type === 'commit');
        expect(found).toBeTruthy();
        return found;
      },
      { timeout: 6000 },
    );
    expect(commit.clientSeed).toBe('test-seed');

    // Server resolves: reveal then result + rematch button.
    await act(async () => {
      ws.receive({
        ...baseState,
        state: 'resolved',
        opponent: { userId: 'u-b', name: 'bob' },
        winnerId: 'u-b',
      });
      ws.receive({
        type: 'resolved',
        duelId: 'd1',
        round: 0,
        winnerId: 'u-b',
        winnerName: 'bob',
        payout: 500,
        outcome: { kind: 'coinflip', result: 1 },
        proof: {
          serverSeed: 'seed',
          serverSeedHash: 'hash0',
          clientSeeds: ['a', 'b'],
          nonce: 0,
          combinedHmac: 'mac',
          roll: 1,
        },
        nextSeedHash: 'hash1',
      });
    });

    expect(await screen.findByText(/You won 500 chips!/)).toBeTruthy();
    const rematch = screen.getByRole('button', { name: /Rematch — same stake/ });
    fireEvent.click(rematch);
    const rematchMsg = ws.sent.map((s) => JSON.parse(s)).find((m) => m.type === 'rematch');
    expect(rematchMsg.clientSeed).toBe('test-seed');
  });

  it('shows the cancellation notice', async () => {
    renderDuel({ joinDuelId: 'd1' });
    const ws = FakeWebSocket.instances[0];
    await act(async () => {
      ws.open();
      ws.receive({ type: 'hello', duelId: 'd1', you: { userId: 'u-b', name: 'bob' }, peers: [] });
      ws.receive({ type: 'cancelled', duelId: 'd1', reason: 'Duel expired before an opponent joined' });
    });
    expect(screen.getByText(/Duel expired/)).toBeTruthy();
  });
});
