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

export type RuntimeTier = 'house' | 'shared-realtime' | 'p2p';

export interface GameModule<TBet = unknown, TState = unknown> {
  id: string;
  name: string;
  runtimeTier: RuntimeTier;

  validateBet(bet: TBet, player: PlayerContext): BetValidationResult;

  resolve(rngRoll: number, bets: Array<{ bet: TBet; player: PlayerContext }>): ResolveResult;

  getState(): TState;

  uiComponent: string;
}
