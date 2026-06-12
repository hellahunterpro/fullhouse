export { generateId } from './id.js';
export * from './db/schema.js';
export { ensureSchema } from './db/bootstrap.js';
export {
  authenticate,
  provisionUser,
  AuthError,
  type AuthenticatedUser,
} from './auth.js';
export {
  credit,
  debit,
  getBalance,
  settleRound,
  InsufficientFundsError,
  DuplicateTransactionError,
  type TransactionType,
  type TransactionResult,
  type SettleRoundInput,
  type SettleRoundResult,
} from './wallet.js';
export {
  generateServerSeed,
  commit,
  reveal,
  verify,
  toPublicProof,
  type Commitment,
  type EntropySources,
  type RngResult,
  type FairnessProof,
  type PublicProof,
} from './rng.js';
export {
  getCommitment,
  rotateSeed,
  getActiveSeedRow,
  incrementNonceStmt,
  type Commitment as SeedCommitment,
  type RevealedSeed,
} from './fairness.js';
export { writeAuditEvent } from './audit.js';
export {
  trackAuth,
  trackBetPlaced,
  trackBetResolved,
  trackBalanceDelta,
  trackDuelCreated,
  trackDuelJoined,
  trackDuelResolved,
  trackDuelRematch,
} from './analytics.js';
export {
  resolveDuelOutcome,
  DUEL_GAMES,
  DUEL_MIN_STAKE,
  DUEL_MAX_STAKE,
  type DuelGame,
  type DuelResolution,
} from './duel.js';
