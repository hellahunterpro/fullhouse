import { describe, it, expect } from 'vitest';
import { generateServerSeed, commit, reveal, verify } from './rng.js';
import type { FairnessProof } from './rng.js';

describe('rng service', () => {
  describe('commit-reveal', () => {
    it('commitment matches revealed server seed', async () => {
      const serverSeed = await generateServerSeed();
      const commitment = await commit(serverSeed);

      const result = await reveal(
        { serverSeed, clientSeeds: ['player-seed-abc'], nonce: 1 },
        100,
      );

      expect(result.proof.serverSeedHash).toBe(commitment.serverSeedHash);
    });

    it('produces deterministic results for same inputs', async () => {
      const serverSeed = 'fixed-server-seed-for-testing';
      const sources = { serverSeed, clientSeeds: ['client-123'], nonce: 42 };

      const result1 = await reveal(sources, 100);
      const result2 = await reveal(sources, 100);

      expect(result1.roll).toBe(result2.roll);
      expect(result1.proof.combinedHmac).toBe(result2.proof.combinedHmac);
    });

    it('produces different results with different client seeds', async () => {
      const serverSeed = 'fixed-server-seed';
      const result1 = await reveal(
        { serverSeed, clientSeeds: ['seed-a'], nonce: 1 },
        10000,
      );
      const result2 = await reveal(
        { serverSeed, clientSeeds: ['seed-b'], nonce: 1 },
        10000,
      );

      expect(result1.roll).not.toBe(result2.roll);
    });

    it('produces different results with different nonces', async () => {
      const serverSeed = 'fixed-server-seed';
      const result1 = await reveal(
        { serverSeed, clientSeeds: ['seed-a'], nonce: 1 },
        10000,
      );
      const result2 = await reveal(
        { serverSeed, clientSeeds: ['seed-a'], nonce: 2 },
        10000,
      );

      expect(result1.roll).not.toBe(result2.roll);
    });

    it('roll is within [0, maxRoll)', async () => {
      const serverSeed = await generateServerSeed();
      for (let nonce = 0; nonce < 50; nonce++) {
        const result = await reveal(
          { serverSeed, clientSeeds: ['test'], nonce },
          100,
        );
        expect(result.roll).toBeGreaterThanOrEqual(0);
        expect(result.roll).toBeLessThan(100);
      }
    });
  });

  describe('verification', () => {
    it('valid proof verifies successfully', async () => {
      const serverSeed = await generateServerSeed();
      const result = await reveal(
        { serverSeed, clientSeeds: ['player-seed'], nonce: 5 },
        100,
      );

      const valid = await verify(result.proof, 100);
      expect(valid).toBe(true);
    });

    it('detects tampered server seed', async () => {
      const serverSeed = await generateServerSeed();
      const result = await reveal(
        { serverSeed, clientSeeds: ['player-seed'], nonce: 5 },
        100,
      );

      const tampered: FairnessProof = {
        ...result.proof,
        serverSeed: 'tampered-seed',
      };

      const valid = await verify(tampered, 100);
      expect(valid).toBe(false);
    });

    it('detects tampered roll', async () => {
      const serverSeed = await generateServerSeed();
      const result = await reveal(
        { serverSeed, clientSeeds: ['player-seed'], nonce: 5 },
        100,
      );

      const tampered: FairnessProof = {
        ...result.proof,
        roll: (result.proof.roll + 1) % 100,
      };

      const valid = await verify(tampered, 100);
      expect(valid).toBe(false);
    });

    it('detects tampered client seed', async () => {
      const serverSeed = await generateServerSeed();
      const result = await reveal(
        { serverSeed, clientSeeds: ['player-seed'], nonce: 5 },
        100,
      );

      const tampered: FairnessProof = {
        ...result.proof,
        clientSeeds: ['different-seed'],
      };

      const valid = await verify(tampered, 100);
      expect(valid).toBe(false);
    });

    it('works with multiple client seeds (P2P scenario)', async () => {
      const serverSeed = await generateServerSeed();
      const result = await reveal(
        { serverSeed, clientSeeds: ['player1-seed', 'player2-seed'], nonce: 1 },
        100,
      );

      const valid = await verify(result.proof, 100);
      expect(valid).toBe(true);

      // Different player order should produce different result
      const result2 = await reveal(
        { serverSeed, clientSeeds: ['player2-seed', 'player1-seed'], nonce: 1 },
        100,
      );
      expect(result2.proof.combinedHmac).not.toBe(result.proof.combinedHmac);
    });
  });
});
