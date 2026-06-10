export interface PlayerContext {
  userId: string;
  walletId: string;
  balance: number;
}

export interface Payout {
  walletId: string;
  amount: number;
}

export interface BetValidationResult {
  valid: boolean;
  error?: string;
}

export interface ResolveResult {
  payouts: Payout[];
  outcome: Record<string, unknown>;
}

export interface RngOutcome {
  /** Uniform roll in [0, maxRoll) for this game's declared outcome space. */
  roll: number;
  /** Full 256-bit HMAC hex for games that need more entropy than one roll. */
  hmacHex: string;
}

export type RuntimeTier = 'house' | 'shared-realtime' | 'p2p';

export interface GameModule<TBet = unknown, TState = unknown> {
  id: string;
  name: string;
  runtimeTier: RuntimeTier;

  /** Size of the game's outcome space; the engine derives roll in [0, maxRoll). */
  maxRoll: number;

  validateBet(bet: TBet, player: PlayerContext): BetValidationResult;

  resolve(rng: RngOutcome, bets: Array<{ bet: TBet; player: PlayerContext }>): ResolveResult;

  getState(): TState;

  uiComponent: string;
}
