import { useState, useCallback, useRef, useEffect } from 'react';
import { play, type PlayResult } from '../api';
import { Button, Panel } from '../ui';
import { getClientSeed } from '../clientSeed';
import { hapticImpact, hapticResult } from '../haptics';
import { StakeInput } from './StakeInput';
import { FairnessProof } from './FairnessProof';
import './MinesGame.css';

const GRID_SIZE = 25;
const REVEAL_STAGGER_MS = 60;
const FLIP_MS = 350;

// Mirrors the server multiplier; the server payout is authoritative.
export function minesMultiplier(picks: number, mines: number): number {
  let multiplier = 1;
  for (let i = 0; i < picks; i++) {
    multiplier *= (GRID_SIZE - i) / (GRID_SIZE - mines - i);
  }
  return Math.floor(multiplier * 0.99 * 100) / 100;
}

interface MinesOutcome {
  minePositions: number[];
  picks: number[];
  hitMine: boolean;
  win: boolean;
  payout: number;
  multiplier: number;
  revealedSafe: number;
}

interface Props {
  balance: number;
  onBalanceUpdate: (b: number) => void;
}

function GemIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 3l6 5.5L12 21 6 8.5z"
        fill="rgba(43,217,107,0.25)"
        stroke="var(--accent)"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path d="M6.5 8.5h11M12 3l-2 5.5L12 20l2-11.5z" fill="none" stroke="var(--accent)" strokeWidth="1" opacity="0.8" />
    </svg>
  );
}

function MineIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="13" r="6" fill="rgba(255,92,92,0.3)" stroke="var(--danger)" strokeWidth="1.8" />
      <path
        d="M12 7V4M12 22v-3M6 13H3M21 13h-3M7.8 8.8L5.7 6.7M16.2 17.2l2.1 2.1M16.2 8.8l2.1-2.1M7.8 17.2l-2.1 2.1"
        stroke="var(--danger)"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

type Phase = 'picking' | 'waiting' | 'revealing' | 'win' | 'lose';

export function MinesGame({ balance, onBalanceUpdate }: Props) {
  const [stake, setStake] = useState(100);
  const [mineCount, setMineCount] = useState(5);
  const [picks, setPicks] = useState<number[]>([]);
  const [result, setResult] = useState<PlayResult | null>(null);
  const [phase, setPhase] = useState<Phase>('picking');
  const [showAllMines, setShowAllMines] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timersRef = useRef<number[]>([]);

  useEffect(
    () => () => {
      timersRef.current.forEach((t) => clearTimeout(t));
    },
    [],
  );

  const maxPicks = GRID_SIZE - mineCount;
  const busy = phase === 'waiting' || phase === 'revealing';
  const finished = phase === 'win' || phase === 'lose';

  const togglePick = (i: number) => {
    if (phase !== 'picking') return;
    hapticImpact('light');
    setPicks((prev) => {
      if (prev.includes(i)) return prev.filter((p) => p !== i);
      if (prev.length >= maxPicks) return prev;
      return [...prev, i];
    });
  };

  const changeMineCount = (n: number) => {
    setMineCount(n);
    setPicks([]);
    setResult(null);
    setShowAllMines(false);
    setPhase('picking');
    setError(null);
  };

  const resetGame = () => {
    setPicks([]);
    setResult(null);
    setShowAllMines(false);
    setPhase('picking');
    setError(null);
  };

  const handlePlay = useCallback(async () => {
    if (picks.length === 0) return;
    hapticImpact('medium');
    setPhase('waiting');
    setError(null);

    try {
      const sorted = [...picks].sort((a, b) => a - b);
      const res = await play('mines', { stake, mineCount, picks: sorted }, getClientSeed());
      const outcome = res.outcome as unknown as MinesOutcome;
      const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false;

      const settle = () => {
        setResult(res);
        if (outcome.hitMine) setShowAllMines(true);
        setPhase(outcome.win ? 'win' : 'lose');
        onBalanceUpdate(res.balanceAfter);
        hapticResult(outcome.win);
      };

      if (reduced) {
        settle();
      } else {
        // Result data is set now so tiles can flip; the staggered delays live in CSS.
        setResult(res);
        setPhase('revealing');
        const total = (picks.length - 1) * REVEAL_STAGGER_MS + FLIP_MS + 150;
        timersRef.current.push(window.setTimeout(settle, total));
      }
    } catch (err) {
      setPhase('picking');
      setError(err instanceof Error ? err.message : 'Error');
      hapticResult(false);
    }
  }, [picks, stake, mineCount, onBalanceUpdate]);

  const outcome = result ? (result.outcome as unknown as MinesOutcome) : null;
  const mineSet = outcome ? new Set(outcome.minePositions) : null;

  const currentMult = picks.length > 0 ? minesMultiplier(picks.length, mineCount) : 0;
  const nextMult = picks.length < maxPicks ? minesMultiplier(picks.length + 1, mineCount) : null;
  const potentialPayout = Math.floor(stake * currentMult);

  const revealOrder = new Map(picks.map((p, i) => [p, i]));

  return (
    <div className={`mines mines--${phase}`}>
      <div className="mines-grid-wrap">
        <div className="mines-grid-glow" aria-hidden="true" />
        <div className="mines-grid">
          {Array.from({ length: GRID_SIZE }, (_, i) => {
            const isPicked = picks.includes(i);
            const isMine = mineSet?.has(i) ?? false;
            const revealThis = (phase === 'revealing' || finished) && isPicked;
            const showMine = showAllMines && isMine && !isPicked;
            const delay = phase === 'revealing' ? (revealOrder.get(i) ?? 0) * REVEAL_STAGGER_MS : 0;

            let state = 'hidden';
            if (revealThis) state = isMine ? 'mine' : 'gem';
            else if (showMine) state = 'mine-missed';
            else if (isPicked) state = 'picked';

            return (
              <button
                key={i}
                className={`mines-tile mines-tile--${state}`}
                data-testid={`tile-${i}`}
                data-state={state}
                disabled={phase !== 'picking'}
                onClick={() => togglePick(i)}
              >
                <span
                  className={revealThis ? 'mines-tile-inner mines-tile-inner--flipped' : 'mines-tile-inner'}
                  style={delay ? { transitionDelay: `${delay}ms` } : undefined}
                >
                  <span className="mines-tile-front" />
                  <span className="mines-tile-back">
                    {revealThis && (isMine ? <MineIcon /> : <GemIcon />)}
                  </span>
                </span>
                {showMine && (
                  <span className="mines-tile-missed">
                    <MineIcon />
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <div className="mines-caption">
          {phase === 'picking' &&
            (picks.length === 0
              ? 'Pick tiles to reveal'
              : `${picks.length}/${maxPicks} picked · ${mineCount} mines`)}
          {phase === 'waiting' && 'Checking…'}
          {phase === 'revealing' && 'Revealing…'}
          {phase === 'win' && outcome && `Cleared! Won ${outcome.payout.toLocaleString()} chips`}
          {phase === 'lose' && 'Boom! Hit a mine'}
        </div>
      </div>

      <div className="mines-readout">
        <div className="mines-stat">
          <span className="mines-stat-label">Current</span>
          <span className="mines-stat-value">
            {currentMult > 0 ? `${currentMult.toFixed(2)}×` : '—'}
          </span>
        </div>
        <div className="mines-stat">
          <span className="mines-stat-label">Next pick</span>
          <span className="mines-stat-value">
            {nextMult !== null ? `${nextMult.toFixed(2)}×` : '—'}
          </span>
        </div>
        <div className="mines-stat">
          <span className="mines-stat-label">Payout</span>
          <span className="mines-stat-value mines-stat-value--accent">
            {potentialPayout > 0 ? potentialPayout.toLocaleString() : '—'}
          </span>
        </div>
      </div>

      <Panel className="mines-controls">
        <div className="mines-count-head">
          <span className="mines-count-label">Mines</span>
          <span className="mines-count-value">{mineCount}</span>
        </div>
        <input
          className="mines-count-slider"
          type="range"
          min={1}
          max={24}
          value={mineCount}
          disabled={busy}
          onChange={(e) => changeMineCount(parseInt(e.target.value, 10))}
        />
        <StakeInput stake={stake} balance={balance} onChange={setStake} disabled={busy} />
      </Panel>

      {finished ? (
        <Button block onClick={resetGame}>
          Play Again
        </Button>
      ) : (
        <Button
          block
          loading={busy}
          disabled={stake > balance || stake < 1 || picks.length === 0}
          onClick={handlePlay}
        >
          Reveal
        </Button>
      )}

      {error && <div className="mines-error">{error}</div>}
      {result && finished && (
        <div className="mines-proof">
          <FairnessProof proof={result.proof} />
        </div>
      )}
    </div>
  );
}
