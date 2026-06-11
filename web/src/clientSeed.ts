const KEY = 'fh_client_seed';

export function getClientSeed(): string {
  try {
    let seed = localStorage.getItem(KEY);
    if (!seed) {
      seed = crypto.randomUUID();
      localStorage.setItem(KEY, seed);
    }
    return seed;
  } catch {
    return crypto.randomUUID();
  }
}

export function setClientSeed(seed: string): void {
  try {
    localStorage.setItem(KEY, seed.trim());
  } catch {
    // localStorage unavailable (private mode) — seed falls back to per-session
  }
}
