import { useState } from 'react';
import { tokens } from '../theme';

interface Props {
  proof: {
    serverSeed: string;
    serverSeedHash: string;
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
        <div style={{
          marginTop: '12px',
          textAlign: 'left',
          fontSize: '11px',
          color: tokens.textSecondary,
          wordBreak: 'break-all',
          lineHeight: '1.6',
        }}>
          <div><strong>Server Seed:</strong> {proof.serverSeed}</div>
          <div><strong>Hash:</strong> {proof.serverSeedHash}</div>
          <div><strong>Client Seed:</strong> {proof.clientSeeds.join(', ')}</div>
          <div><strong>Nonce:</strong> {proof.nonce}</div>
          <div><strong>HMAC:</strong> {proof.combinedHmac}</div>
        </div>
      )}
    </div>
  );
}
