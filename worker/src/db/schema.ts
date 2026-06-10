export interface UserRow {
  id: string;
  tg_id: number;
  username: string | null;
  first_name: string | null;
  created_at: string;
}

export interface WalletRow {
  id: string;
  user_id: string;
  currency: string;
  balance: number;
  created_at: string;
  updated_at: string;
}

export interface LedgerEntryRow {
  id: string;
  wallet_id: string;
  type: string;
  amount: number;
  balance_after: number;
  ref_key: string | null;
  description: string | null;
  created_at: string;
}

export interface AuditEventRow {
  id: string;
  user_id: string | null;
  event_type: string;
  payload: string;
  created_at: string;
}

export interface ServerSeedRow {
  id: string;
  user_id: string;
  seed: string;
  seed_hash: string;
  nonce: number;
  status: 'active' | 'revealed';
  created_at: string;
  revealed_at: string | null;
}
