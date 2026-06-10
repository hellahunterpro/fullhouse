import { useState } from 'react';
import { tokens } from '../theme';

interface Props {
  proof: {
    serverSeedHash: string;
    maxRoll?: number;
    clientSeeds: string[];
    nonce: number;
    combinedHmac: string;
    roll: number;
  };
}

export function FairnessProof({ proof }: Props) {
  const [show, setShow] = useState(false);

  return (
    <div>
      <button
        onClick={() => setShow(!show)}
        style={{
          background: 'none',
          border: 'none',
          color: tokens.textSecondary,
          cursor: 'pointer',
          textDecoration: 'underline',
          fontSize: '13px',
          padding: '4px 0',
        }}
      >
        {show ? 'Hide' : 'Show'} Fairness Proof
      </button>
      {show && (
        <div
          style={{
            marginTop: '12px',
            textAlign: 'left',
            fontSize: '11px',
            color: tokens.textSecondary,
            wordBreak: 'break-all',
            lineHeight: '1.6',
          }}
        >
          <div>
            <strong style={{ color: tokens.text }}>Server Seed Hash:</strong> {proof.serverSeedHash}
          </div>
          <div>
            <strong style={{ color: tokens.text }}>Client Seed:</strong> {proof.clientSeeds.join(', ')}
          </div>
          <div>
            <strong style={{ color: tokens.text }}>Nonce:</strong> {proof.nonce}
          </div>
          <div>
            <strong style={{ color: tokens.text }}>HMAC:</strong> {proof.combinedHmac}
          </div>
          <div style={{ marginTop: '8px', color: tokens.textSecondary }}>
            The server seed hash was committed before this round. Rotate your seed to reveal
            it and verify every past round.
          </div>
        </div>
      )}
    </div>
  );
}
