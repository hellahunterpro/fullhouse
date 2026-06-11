import { useState, useCallback, useRef, useEffect } from 'react';
import { play, type PlayResult } from '../api';
import { Button, Panel } from '../ui';
import { getClientSeed } from '../clientSeed';
import { hapticImpact, hapticResult } from '../haptics';
import { StakeInput } from './StakeInput';
import { ResultPanel } from './ResultPanel';
import { flipTarget } from './flipMath';
import './CoinflipGame.css';

interface Props {
  balance: number;
  onResult: (res: PlayResult) => void;
}

interface CoinflipOutcome {
  result: 'heads' | 'tails';
  win: boolean;
  payout: number;
  multiplier: number;
}

const FLIP_MS = 900;
const MULTIPLIER = 1.98;

function CoinFace({ side }: { side: 'heads' | 'tails' }) {
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true">
      <circle cx="50" cy="50" r="47" fill="var(--bg-1)" stroke="var(--gold)" strokeWidth="4" />
      <circle cx="50" cy="50" r="36" fill="none" stroke="var(--gold)" strokeWidth="1.5" opacity="0.6" />
      {side === 'heads' ? (
        <>
          <path
            d="M50 22l6.5 13.5 14.5 2-10.5 10 2.5 14.5L50 55l-13 7 2.5-14.5-10.5-10 14.5-2z"
            fill="var(--gold)"
          />
          <circle cx="50" cy="78" r="3" fill="var(--gold)" opacity="0.7" />
        </>
      ) : (
        <>
          <path d="M34 32h32M50 32v36" stroke="var(--gold)" strokeWidth="7" strokeLinecap="round" />
          <circle cx="32" cy="74" r="3" fill="var(--gold)" opacity="0.7" />
          <circle cx="68" cy="74" r="3" fill="var(--gold)" opacity="0.7" />
        </>
      )}
    </svg>
  );
}

export function CoinflipGame({ balance, onResult }: Props) {
  const [stake, setStake] = useState(100);
  const [choice, setChoice] = useState<'heads' | 'tails'>('heads');
  const [result, setResult] = useState<PlayResult | null>(null);
  const [phase, setPhase] = useState<'idle' | 'waiting' | 'flipping' | 'win' | 'lose'>('idle');
  const [deg, setDeg] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const degRef = useRef(0);
  const timerRef = useRef(0);

  useEffect(() => () => clearTimeout(timerRef.current), []);

  const busy = phase === 'waiting' || phase === 'flipping';

  const handlePlay = useCallback(async () => {
    hapticImpact('medium');
    setPhase('waiting');
    setResult(null);
    setError(null);

    try {
      const res = await play('coinflip', { stake, choice }, getClientSeed());
      const outcome = res.outcome as unknown as CoinflipOutcome;
      const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false;

      const settle = () => {
        setResult(res);
        setPhase(outcome.win ? 'win' : 'lose');
        onResult(res);
        hapticResult(outcome.win);
      };

      const target = flipTarget(degRef.current, outcome.result);
      degRef.current = target;
      setDeg(target);

      if (reduced) {
        settle();
      } else {
        setPhase('flipping');
        timerRef.current = window.setTimeout(settle, FLIP_MS);
      }
    } catch (err) {
      setPhase('idle');
      setError(err instanceof Error ? err.message : 'Error');
      hapticResult(false);
    }
  }, [stake, choice, onResult]);

  const outcome = result ? (result.outcome as unknown as CoinflipOutcome) : null;

  return (
    <div className="coinflip">
      <div className={`coin-stage coin-stage--${phase}`}>
        <div className="coin-stage-glow" aria-hidden="true" />
        <div
          className={phase === 'waiting' ? 'coin coin--waiting' : 'coin'}
          style={{ transform: `rotateX(${deg}deg)` }}
          data-testid="coin"
        >
          <div className="coin-face coin-face--front">
            <CoinFace side="heads" />
          </div>
          <div className="coin-face coin-face--back">
            <CoinFace side="tails" />
          </div>
        </div>
        <div className="coin-caption">
          {phase === 'win' && outcome && `${outcome.result.toUpperCase()} — won ${outcome.payout.toLocaleString()} chips`}
          {phase === 'lose' && outcome && `${outcome.result.toUpperCase()} — no luck this time`}
          {(phase === 'waiting' || phase === 'flipping') && 'Flipping…'}
          {phase === 'idle' && 'Pick a side and flip'}
        </div>
      </div>

      <div className="coin-choice">
        {(['heads', 'tails'] as const).map((c) => (
          <button
            key={c}
            className={choice === c ? 'coin-choice-card coin-choice-card--active' : 'coin-choice-card'}
            disabled={busy}
            onClick={() => setChoice(c)}
          >
            <span className="coin-choice-icon">
              <CoinFace side={c} />
            </span>
            <span className="coin-choice-name">{c === 'heads' ? 'Heads' : 'Tails'}</span>
          </button>
        ))}
      </div>

      <div className="coin-readout">
        <div className="coin-stat">
          <span className="coin-stat-label">Chance</span>
          <span className="coin-stat-value">50%</span>
        </div>
        <div className="coin-stat">
          <span className="coin-stat-label">Multiplier</span>
          <span className="coin-stat-value">{MULTIPLIER}×</span>
        </div>
        <div className="coin-stat">
          <span className="coin-stat-label">Payout</span>
          <span className="coin-stat-value coin-stat-value--accent">
            {Math.floor(stake * MULTIPLIER).toLocaleString()}
          </span>
        </div>
      </div>

      <Panel>
        <StakeInput stake={stake} balance={balance} onChange={setStake} disabled={busy} />
      </Panel>

      <Button block loading={busy} disabled={stake > balance || stake < 1} onClick={handlePlay}>
        Flip Coin
      </Button>

      {error && <div className="coin-error">{error}</div>}
      {result && (
        <div className="coin-proof">
          <ResultPanel result={result} />
        </div>
      )}
    </div>
  );
}
