import { getGame } from '../games/registry.js';
import { generateServerSeed, commit, reveal } from './rng.js';
import { debit, credit, getBalance } from './wallet.js';
import { trackBetPlaced, trackBetResolved, trackBalanceDelta } from './analytics.js';
import type { FairnessProof } from './rng.js';

export interface PlayRequest {
  gameId: string;
  bet: { stake: number; [key: string]: unknown };
  clientSeed: string;
  userId: string;
  walletId: string;
}

export interface PlayResult {
  roundId: string;
  outcome: Record<string, unknown>;
  balanceBefore: number;
  balanceAfter: number;
  proof: FairnessProof;
}

export async function playRound(db: D1Database, req: PlayRequest): Promise<PlayResult> {
  const game = getGame(req.gameId);
  if (!game) throw new Error(`Unknown game: ${req.gameId}`);

  const balance = await getBalance(db, req.walletId);
  const player = { userId: req.userId, walletId: req.walletId, balance };

  const validation = game.validateBet(req.bet, player);
  if (!validation.valid) throw new Error(validation.error ?? 'Invalid bet');

  const serverSeed = await generateServerSeed();
  const commitment = await commit(serverSeed);

  const nonce = Date.now();
  const rngResult = await reveal(
    { serverSeed, clientSeeds: [req.clientSeed], nonce },
    100,
  );

  const resolveResult = game.resolve(rngResult.roll, [{ bet: req.bet, player }]);

  const roundId = `round:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
  const balanceBefore = balance;

  await trackBetPlaced(db, req.userId, req.gameId, roundId, req.bet.stake, {
    bet: req.bet,
    commitment: commitment.serverSeedHash,
  });

  await debit(db, req.walletId, req.bet.stake, 'bet_stake', {
    refKey: `${roundId}:debit`,
    description: `${game.name} bet`,
  });

  const payout = resolveResult.payouts[0]?.amount ?? 0;
  if (payout > 0) {
    await credit(db, req.walletId, payout, 'bet_payout', {
      refKey: `${roundId}:credit`,
      description: `${game.name} payout`,
    });
  }

  const balanceAfter = await getBalance(db, req.walletId);

  await trackBetResolved(db, req.userId, req.gameId, roundId, req.bet.stake, payout, resolveResult.outcome);
  await trackBalanceDelta(db, req.userId, req.walletId, balanceBefore, balanceAfter, `${req.gameId}_round`, roundId);

  return {
    roundId,
    outcome: resolveResult.outcome,
    balanceBefore,
    balanceAfter,
    proof: rngResult.proof,
  };
}
