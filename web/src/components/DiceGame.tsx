import { useState, useCallback, useRef, useEffect } from 'react';
import { play, type PlayResult } from '../api';
import { Button, Panel } from '../ui';
import { getClientSeed } from '../clientSeed';
import { hapticImpact, hapticResult } from '../haptics';
import { StakeInput } from './StakeInput';
import { ResultPanel } from './ResultPanel';
import './DiceGame.css';

interface Props {
  balance: number;
  onResult: (res: PlayResult) => void;
}

interface DiceOutcome {
  roll: number;
  target: number;
  direction: 'under' | 'over';
  win: boolean;
  payout: number;
  multiplier: number;
}

// Mirrors the server formula for the live preview; the server result is authoritative.
function previewMultiplier(target: number, direction: 'under' | 'over'): number {
  const winCount = direction === 'under' ? target : 100 - target;
  if (winCount <= 0) return 0;
  return Math.floor((100 / winCount) * 0.99 * 100) / 100;
}

const SCRAMBLE_MS = 700;

export function DiceGame({ balance, onResult }: Props) {
  const [stake, setStake] = useState(100);
  const [target, setTarget] = useState(50);
  const [direction, setDirection] = useState<'under' | 'over'>('under');
  const [result, setResult] = useState<PlayResult | null>(null);
  const [display, setDisplay] = useState<number | null>(null);
  const [phase, setPhase] = useState<'idle' | 'rolling' | 'win' | 'lose'>('idle');
  const [error, setError] = useState<string | null>(null);
  const rafRef = useRef(0);
  const timerRef = useRef(0);

  useEffect(
    () => () => {
      cancelAnimationFrame(rafRef.current);
      clearTimeout(timerRef.current);
    },
    [],
  );

  const winChance = direction === 'under' ? target : 100 - target;
  const multiplier = previewMultiplier(target, direction);
  const potentialPayout = Math.floor(stake * multiplier);
  const rolling = phase === 'rolling';

  const settle = useCallback(
    (res: PlayResult) => {
      const outcome = res.outcome as unknown as DiceOutcome;
      cancelAnimationFrame(rafRef.current);
      setDisplay(outcome.roll);
      setResult(res);
      setPhase(outcome.win ? 'win' : 'lose');
      onResult(res);
      hapticResult(outcome.win);
    },
    [onResult],
  );

  const handlePlay = useCallback(async () => {
    hapticImpact('medium');
    setPhase('rolling');
    setResult(null);
    setError(null);

    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false;
    const started = performance.now();
    if (!reduced) {
      const tick = () => {
        setDisplay(Math.floor(Math.random() * 100));
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    }

    try {
      const res = await play('dice', { stake, target, direction }, getClientSeed());
      const wait = reduced ? 0 : Math.max(0, SCRAMBLE_MS - (performance.now() - started));
      timerRef.current = window.setTimeout(() => settle(res), wait);
    } catch (err) {
      cancelAnimationFrame(rafRef.current);
      setPhase('idle');
      setDisplay(null);
      setError(err instanceof Error ? err.message : 'Error');
      hapticResult(false);
    }
  }, [stake, target, direction, settle]);

  const trackStyle =
    direction === 'under'
      ? `linear-gradient(to right, var(--accent) 0%, var(--accent) ${target}%, var(--bg-2) ${target}%, var(--bg-2) 100%)`
      : `linear-gradient(to right, var(--bg-2) 0%, var(--bg-2) ${target}%, var(--accent) ${target}%, var(--accent) 100%)`;

  const outcome = result ? (result.outcome as unknown as DiceOutcome) : null;

  return (
    <div className="dice">
      <div className={`dice-display dice-display--${phase}`}>
        <div className="dice-display-glow" aria-hidden="true" />
        <div className="dice-display-number">{display === null ? '—' : display}</div>
        <div className="dice-display-caption">
          {phase === 'win' && outcome && `Won ${outcome.payout.toLocaleString()} chips`}
          {phase === 'lose' && 'No luck this time'}
          {phase === 'rolling' && 'Rolling…'}
          {phase === 'idle' && `Roll ${direction} ${target} to win`}
        </div>
      </div>

      <Panel className="dice-controls">
        <div className="dice-slider-head">
          <span className="dice-slider-label">Target</span>
          <span className="dice-slider-value">{target}</span>
        </div>
        <input
          className="dice-slider"
          type="range"
          min={1}
          max={98}
          value={target}
          disabled={rolling}
          onChange={(e) => setTarget(parseInt(e.target.value, 10))}
          style={{ background: trackStyle }}
        />
        <div className="dice-direction">
          {(['under', 'over'] as const).map((d) => (
            <button
              key={d}
              className={direction === d ? 'dice-dir-btn dice-dir-btn--active' : 'dice-dir-btn'}
              disabled={rolling}
              onClick={() => setDirection(d)}
            >
              Roll {d === 'under' ? 'Under' : 'Over'}
            </button>
          ))}
        </div>
      </Panel>

      <div className="dice-readout">
        <div className="dice-stat">
          <span className="dice-stat-label">Chance</span>
          <span className="dice-stat-value">{winChance}%</span>
        </div>
        <div className="dice-stat">
          <span className="dice-stat-label">Multiplier</span>
          <span className="dice-stat-value">{multiplier.toFixed(2)}×</span>
        </div>
        <div className="dice-stat">
          <span className="dice-stat-label">Payout</span>
          <span className="dice-stat-value dice-stat-value--accent">
            {potentialPayout.toLocaleString()}
          </span>
        </div>
      </div>

      <Panel>
        <StakeInput stake={stake} balance={balance} onChange={setStake} disabled={rolling} />
      </Panel>

      <Button block loading={rolling} disabled={stake > balance || stake < 1} onClick={handlePlay}>
        Roll Dice
      </Button>

      {error && <div className="dice-error">{error}</div>}
      {result && (
        <div className="dice-proof">
          <ResultPanel result={result} />
        </div>
      )}
    </div>
  );
}
