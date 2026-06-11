import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';
import { ResultPanel } from '../components/ResultPanel';
import { FairnessSheet } from '../components/FairnessSheet';
import { ToastProvider } from '../ui';
import { getClientSeed } from '../clientSeed';
import type { PublicProof } from '../api';

const fetchFairnessMock = vi.fn();
const rotateFairnessMock = vi.fn();
const verifyRoundMock = vi.fn();

vi.mock('../api', () => ({
  fetchFairness: () => fetchFairnessMock(),
  rotateFairness: () => rotateFairnessMock(),
  verifyRound: (...args: unknown[]) => verifyRoundMock(...args),
}));

afterEach(() => cleanup());

beforeEach(() => {
  fetchFairnessMock.mockReset();
  rotateFairnessMock.mockReset();
  verifyRoundMock.mockReset();
  localStorage.clear();
});

const proof: PublicProof = {
  serverSeedHash: 'aa'.repeat(32),
  maxRoll: 100,
  clientSeeds: ['my-seed'],
  nonce: 7,
  combinedHmac: 'bb'.repeat(32),
  roll: 42,
};

describe('result panel', () => {
  it('shows payout, balance count-up target, and proof fields with copy buttons', () => {
    render(
      <ResultPanel
        result={{
          roundId: 'r1',
          outcome: { win: true, payout: 198 },
          balanceBefore: 1000,
          balanceAfter: 1198,
          proof,
        }}
      />,
    );
    expect(screen.getByText('+198')).toBeTruthy();

    fireEvent.click(screen.getByText('Show proof'));
    expect(screen.getByText(proof.serverSeedHash)).toBeTruthy();
    expect(screen.getByText('my-seed')).toBeTruthy();
    expect(screen.getByText('7')).toBeTruthy();
    expect(screen.getByText(proof.combinedHmac)).toBeTruthy();
    expect(screen.getByText('100')).toBeTruthy();
    expect(screen.getByLabelText('Copy HMAC')).toBeTruthy();
    expect(screen.getByLabelText('Copy Server seed hash')).toBeTruthy();
  });

  it('shows the lose state', () => {
    render(
      <ResultPanel
        result={{
          roundId: 'r2',
          outcome: { win: false, payout: 0 },
          balanceBefore: 1000,
          balanceAfter: 900,
          proof,
        }}
      />,
    );
    expect(screen.getByText('Lost')).toBeTruthy();
  });
});

describe('fairness sheet', () => {
  it('runs the full set-seed → rotate → verify loop', async () => {
    fetchFairnessMock.mockResolvedValue({
      commitment: { id: 'c1', seedHash: proof.serverSeedHash, nonce: 8 },
    });
    rotateFairnessMock.mockResolvedValue({
      revealed: { seed: 'raw-server-seed', seedHash: proof.serverSeedHash, nonce: 8 },
    });
    verifyRoundMock.mockResolvedValue({ valid: true });

    render(
      <ToastProvider>
        <FairnessSheet open onClose={() => {}} lastProof={proof} />
      </ToastProvider>,
    );

    // Commitment is loaded and shown.
    expect(await screen.findByText(proof.serverSeedHash)).toBeTruthy();
    expect(screen.getByText(/Next nonce: 8/)).toBeTruthy();

    // Edit and save the client seed; it must persist to localStorage.
    const input = screen.getByLabelText('Client seed') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'lucky-seed' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    });
    expect(getClientSeed()).toBe('lucky-seed');

    // Verify is gated until the seed is revealed.
    expect(screen.getByText(/Rotate first to reveal the seed/)).toBeTruthy();
    expect((screen.getByRole('button', { name: /Verify round/ }) as HTMLButtonElement).disabled).toBe(true);

    // Rotate reveals the previous seed.
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Rotate & reveal seed/ }));
    });
    expect(await screen.findByText('raw-server-seed')).toBeTruthy();

    // Verify the last round with the revealed seed.
    const verifyBtn = screen.getByRole('button', { name: /Verify round/ }) as HTMLButtonElement;
    expect(verifyBtn.disabled).toBe(false);
    await act(async () => {
      fireEvent.click(verifyBtn);
    });
    expect(await screen.findByText(/Round verified/)).toBeTruthy();
    expect(verifyRoundMock).toHaveBeenCalledWith(proof, 'raw-server-seed');
  });

  it('explains when the revealed seed does not cover the last round', async () => {
    fetchFairnessMock.mockResolvedValue({
      commitment: { id: 'c2', seedHash: 'cc'.repeat(32), nonce: 0 },
    });
    rotateFairnessMock.mockResolvedValue({
      revealed: { seed: 'other-seed', seedHash: 'dd'.repeat(32), nonce: 3 },
    });

    render(
      <ToastProvider>
        <FairnessSheet open onClose={() => {}} lastProof={proof} />
      </ToastProvider>,
    );

    await act(async () => {
      fireEvent.click(await screen.findByRole('button', { name: /Rotate & reveal seed/ }));
    });
    expect(await screen.findByText(/was played on the new seed/)).toBeTruthy();
    expect((screen.getByRole('button', { name: /Verify round/ }) as HTMLButtonElement).disabled).toBe(true);
  });
});
