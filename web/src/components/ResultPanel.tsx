import { useState, useEffect } from 'react';
import type { PlayResult } from '../api';
import { CopyField, useCountUp } from '../ui';
import './ResultPanel.css';

function BalanceCountUp({ from, to }: { from: number; to: number }) {
  const [target, setTarget] = useState(from);
  useEffect(() => setTarget(to), [to]);
  const display = useCountUp(target, 800);
  return <span className="result-panel-balance-value">{display.toLocaleString()}</span>;
}

interface Props {
  result: PlayResult;
}

export function ResultPanel({ result }: Props) {
  const [showProof, setShowProof] = useState(false);
  const outcome = result.outcome as { win?: boolean; payout?: number };
  const win = outcome.win ?? false;
  const payout = outcome.payout ?? 0;

  return (
    <div className="result-panel">
      <div className={win ? 'result-panel-headline result-panel-headline--win' : 'result-panel-headline result-panel-headline--lose'}>
        {win ? `+${payout.toLocaleString()}` : 'Lost'}
      </div>
      <div className="result-panel-balance">
        <span className="result-panel-balance-label">Balance</span>
        <BalanceCountUp from={result.balanceBefore} to={result.balanceAfter} />
      </div>
      <button className="result-panel-proof-toggle" onClick={() => setShowProof((s) => !s)}>
        {showProof ? 'Hide proof' : 'Show proof'}
      </button>
      {showProof && (
        <div className="result-panel-proof">
          <CopyField label="Server seed hash" value={result.proof.serverSeedHash} />
          <CopyField label="Client seed" value={result.proof.clientSeeds.join(', ')} />
          <CopyField label="Nonce" value={String(result.proof.nonce)} />
          <CopyField label="HMAC" value={result.proof.combinedHmac} />
          <CopyField label="Max roll" value={String(result.proof.maxRoll)} />
          <CopyField label="Roll" value={String(result.proof.roll)} />
          <p className="result-panel-proof-note">
            The seed hash was committed before this round. Rotate your seed in the fairness
            sheet to reveal it and verify every past round.
          </p>
        </div>
      )}
    </div>
  );
}
