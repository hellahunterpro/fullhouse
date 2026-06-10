import { getGame } from '../games/registry.js';
import { reveal, toPublicProof } from './rng.js';
import { getBalance, settleRound } from './wallet.js';
import { getActiveSeedRow, incrementNonceStmt } from './fairness.js';
import { trackBetPlaced, trackBetResolved, trackBalanceDelta } from './analytics.js';
import type { PublicProof } from './rng.js';

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
  proof: PublicProof;
}

export async function playRound(db: D1Database, req: PlayRequest): Promise<PlayResult> {
  const game = getGame(req.gameId);
  if (!game) throw new Error(`Unknown game: ${req.gameId}`);

  const balance = await getBalance(db, req.walletId);
  const player = { userId: req.userId, walletId: req.walletId, balance };

  const validation = game.validateBet(req.bet, player);
  if (!validation.valid) throw new Error(validation.error ?? 'Invalid bet');

  // Provably-fair: derive the outcome from the seed committed in advance. The seed
  // is never generated at bet time, so the server cannot pick a favourable result.
  const seed = await getActiveSeedRow(db, req.userId);
  const nonce = seed.nonce;

  const rngResult = await reveal(
    { serverSeed: seed.seed, clientSeeds: [req.clientSeed], nonce },
    game.maxRoll,
  );

  const resolveResult = game.resolve(
    { roll: rngResult.roll, hmacHex: rngResult.proof.combinedHmac },
    [{ bet: req.bet, player }],
  );
  const payout = resolveResult.payouts[0]?.amount ?? 0;

  const roundId = `round:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;

  await trackBetPlaced(db, req.userId, req.gameId, roundId, req.bet.stake, {
    bet: req.bet,
    commitment: seed.seed_hash,
    nonce,
    clientSeed: req.clientSeed,
    hmac: rngResult.proof.combinedHmac,
    roll: rngResult.roll,
  });

  // Atomic settlement: debit stake + credit payout + advance the seed nonce all in
  // one transaction. A mid-round failure leaves no partial state.
  const settlement = await settleRound(
    db,
    {
      walletId: req.walletId,
      stake: req.bet.stake,
      payout,
      stakeRefKey: `${roundId}:stake`,
      payoutRefKey: `${roundId}:payout`,
      description: `${game.name} round`,
    },
    [incrementNonceStmt(db, seed.id)],
  );

  await trackBetResolved(db, req.userId, req.gameId, roundId, req.bet.stake, payout, resolveResult.outcome);
  await trackBalanceDelta(
    db,
    req.userId,
    req.walletId,
    settlement.balanceBefore,
    settlement.balanceAfter,
    `${req.gameId}_round`,
    roundId,
  );

  return {
    roundId,
    outcome: resolveResult.outcome,
    balanceBefore: settlement.balanceBefore,
    balanceAfter: settlement.balanceAfter,
    proof: toPublicProof(rngResult.proof, game.maxRoll),
  };
}
