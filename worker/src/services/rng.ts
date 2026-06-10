// Provably-fair RNG using commit–reveal with HMAC-SHA256.
// Interface supports multiple entropy contributors for future P2P games.

export interface Commitment {
  serverSeedHash: string;
}

export interface EntropySources {
  serverSeed: string;
  clientSeeds: string[];
  nonce: number;
}

export interface RngResult {
  roll: number;
  proof: FairnessProof;
}

export interface FairnessProof {
  serverSeed: string;
  serverSeedHash: string;
  clientSeeds: string[];
  nonce: number;
  combinedHmac: string;
  roll: number;
}

async function sha256Hex(data: string): Promise<string> {
  const encoded = new TextEncoder().encode(data);
  const hash = await crypto.subtle.digest('SHA-256', encoded);
  return Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, '0')).join('');
}

async function hmacSha256Hex(key: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    enc.encode(key),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, enc.encode(message));
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, '0')).join('');
}

export async function generateServerSeed(): Promise<string> {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export async function commit(serverSeed: string): Promise<Commitment> {
  return { serverSeedHash: await sha256Hex(serverSeed) };
}

export async function reveal(sources: EntropySources, maxRoll: number): Promise<RngResult> {
  const { serverSeed, clientSeeds, nonce } = sources;
  const serverSeedHash = await sha256Hex(serverSeed);

  // Combine all entropy: serverSeed is HMAC key, message is all client seeds + nonce
  const message = [...clientSeeds, String(nonce)].join(':');
  const combinedHmac = await hmacSha256Hex(serverSeed, message);

  // Derive a roll in [0, maxRoll) from the first 8 hex chars (32 bits)
  const rollRaw = parseInt(combinedHmac.slice(0, 8), 16);
  const roll = rollRaw % maxRoll;

  return {
    roll,
    proof: {
      serverSeed,
      serverSeedHash,
      clientSeeds,
      nonce,
      combinedHmac,
      roll,
    },
  };
}

export async function verify(proof: FairnessProof, maxRoll: number): Promise<boolean> {
  // 1. Verify the server seed matches its commitment
  const expectedHash = await sha256Hex(proof.serverSeed);
  if (expectedHash !== proof.serverSeedHash) return false;

  // 2. Recompute the HMAC
  const message = [...proof.clientSeeds, String(proof.nonce)].join(':');
  const expectedHmac = await hmacSha256Hex(proof.serverSeed, message);
  if (expectedHmac !== proof.combinedHmac) return false;

  // 3. Recompute the roll
  const rollRaw = parseInt(expectedHmac.slice(0, 8), 16);
  const expectedRoll = rollRaw % maxRoll;
  if (expectedRoll !== proof.roll) return false;

  return true;
}

// The per-round proof shown to the player. It deliberately omits the raw server
// seed: revealing it per round would let the player predict the next round. The
// raw seed is disclosed only on rotation, after which past rounds can be verified.
export interface PublicProof {
  serverSeedHash: string;
  clientSeeds: string[];
  nonce: number;
  combinedHmac: string;
  roll: number;
}

export function toPublicProof(p: FairnessProof): PublicProof {
  return {
    serverSeedHash: p.serverSeedHash,
    clientSeeds: p.clientSeeds,
    nonce: p.nonce,
    combinedHmac: p.combinedHmac,
    roll: p.roll,
  };
}
