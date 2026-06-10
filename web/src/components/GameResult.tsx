import { tokens } from '../theme';
import { FairnessProof } from './FairnessProof';
import type { PlayResult } from '../api';

interface Props {
  result: PlayResult;
}

export function GameResult({ result }: Props) {
  const outcome = result.outcome as { win?: boolean; payout?: number; roll?: number; result?: string; spin?: number; color?: string };
  const win = outcome.win ?? false;
  const payout = outcome.payout ?? 0;

  let display = '';
  if (outcome.roll !== undefined) display = String(outcome.roll);
  else if (outcome.spin !== undefined) display = String(outcome.spin);
  else if (outcome.result) display = outcome.result.toUpperCase();

  return (
    <div style={{
      background: tokens.bgSecondary,
      borderRadius: tokens.radius,
      padding: '20px',
      textAlign: 'center',
      marginTop: '16px',
    }}>
      {display && (
        <div style={{
          fontSize: '48px',
          fontWeight: 'bold',
          color: win ? tokens.success : tokens.danger,
          marginBottom: '4px',
        }}>
          {display}
        </div>
      )}
      {outcome.color && (
        <div style={{ fontSize: '14px', color: tokens.textSecondary, marginBottom: '8px' }}>
          {outcome.color}
        </div>
      )}
      <div style={{
        fontSize: '20px',
        color: win ? tokens.success : tokens.danger,
        marginBottom: '12px',
      }}>
        {win ? `Won ${payout.toLocaleString()} chips!` : 'Lost'}
      </div>
      <div style={{ fontSize: '13px', color: tokens.textSecondary, marginBottom: '8px' }}>
        Balance: {result.balanceAfter.toLocaleString()}
      </div>
      <FairnessProof proof={result.proof} />
    </div>
  );
}
