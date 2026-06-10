import { getGame } from '../games/registry.js';
import { generateServerSeed, commit, reveal } from './rng.js';
import { debit, credit, getBalance } from './wallet.js';
import { writeAuditEvent } from './audit.js';
import type { DiceBet } from '../games/dice.js';
import type { FairnessProof } from './rng.js';

export interface PlayRequest {
  gameId: string;
  bet: DiceBet;
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

  // Validate bet
  const validation = game.validateBet(req.bet, player);
  if (!validation.valid) throw new Error(validation.error ?? 'Invalid bet');

  // RNG: commit, then reveal
  const serverSeed = await generateServerSeed();
  const commitment = await commit(serverSeed);

  // Nonce: use current timestamp for uniqueness
  const nonce = Date.now();
  const rngResult = await reveal(
    { serverSeed, clientSeeds: [req.clientSeed], nonce },
    100,
  );

  // Resolve (pure)
  const resolveResult = game.resolve(rngResult.roll, [{ bet: req.bet, player }]);

  // Atomic wallet movement
  const roundId = `round:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
  const balanceBefore = balance;

  // Debit the stake
  await debit(db, req.walletId, req.bet.stake, 'bet_stake', {
    refKey: `${roundId}:debit`,
    description: `${game.name} bet`,
  });

  // Credit the payout (if any)
  const payout = resolveResult.payouts[0]?.amount ?? 0;
  if (payout > 0) {
    await credit(db, req.walletId, payout, 'bet_payout', {
      refKey: `${roundId}:credit`,
      description: `${game.name} payout`,
    });
  }

  const balanceAfter = await getBalance(db, req.walletId);

  // Audit event
  await writeAuditEvent(db, req.userId, 'bet_resolved', {
    roundId,
    gameId: req.gameId,
    stake: req.bet.stake,
    payout,
    outcome: resolveResult.outcome,
    commitment: commitment.serverSeedHash,
    balanceBefore,
    balanceAfter,
  });

  return {
    roundId,
    outcome: resolveResult.outcome,
    balanceBefore,
    balanceAfter,
    proof: rngResult.proof,
  };
}
