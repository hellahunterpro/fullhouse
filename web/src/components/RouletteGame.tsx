import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { play, type PlayResult } from '../api';
import { Button, Panel } from '../ui';
import { getClientSeed } from '../clientSeed';
import { hapticImpact, hapticResult } from '../haptics';
import { StakeInput } from './StakeInput';
import { ResultPanel } from './ResultPanel';
import { WHEEL_ORDER, STEP, pocketColor, wheelTarget } from './rouletteWheel';
import './RouletteGame.css';

type OutsideBet = 'red' | 'black' | 'odd' | 'even' | 'low' | 'high' | 'dozen1' | 'dozen2' | 'dozen3';
type BetType = OutsideBet | 'straight';

const OUTSIDE_BETS: { id: OutsideBet; label: string; mult: number }[] = [
  { id: 'red', label: 'Red', mult: 2 },
  { id: 'black', label: 'Black', mult: 2 },
  { id: 'odd', label: 'Odd', mult: 2 },
  { id: 'even', label: 'Even', mult: 2 },
  { id: 'low', label: '1–18', mult: 2 },
  { id: 'high', label: '19–36', mult: 2 },
  { id: 'dozen1', label: '1st 12', mult: 3 },
  { id: 'dozen2', label: '2nd 12', mult: 3 },
  { id: 'dozen3', label: '3rd 12', mult: 3 },
];

const MULTIPLIERS: Record<BetType, number> = {
  red: 2, black: 2, odd: 2, even: 2, low: 2, high: 2,
  dozen1: 3, dozen2: 3, dozen3: 3, straight: 36,
};

const BET_NAMES: Record<BetType, string> = {
  red: 'Red', black: 'Black', odd: 'Odd', even: 'Even',
  low: '1–18', high: '19–36', dozen1: '1st 12', dozen2: '2nd 12', dozen3: '3rd 12',
  straight: 'Straight',
};

interface RouletteOutcome {
  spin: number;
  color: 'green' | 'red' | 'black';
  win: boolean;
  payout: number;
  multiplier: number;
}

const SPIN_MS = 1200;
const CX = 150;
const CY = 150;
const R_OUTER = 140;
const R_INNER = 92;
const R_LABEL = 116;

function Wheel({ rotation, spinning }: { rotation: number; spinning: boolean }) {
  const wedges = useMemo(() => {
    return WHEEL_ORDER.map((n, i) => {
      const center = i * STEP;
      const a0 = ((center - STEP / 2 - 90) * Math.PI) / 180;
      const a1 = ((center + STEP / 2 - 90) * Math.PI) / 180;
      const x0 = CX + R_OUTER * Math.cos(a0);
      const y0 = CY + R_OUTER * Math.sin(a0);
      const x1 = CX + R_OUTER * Math.cos(a1);
      const y1 = CY + R_OUTER * Math.sin(a1);
      const xi1 = CX + R_INNER * Math.cos(a1);
      const yi1 = CY + R_INNER * Math.sin(a1);
      const xi0 = CX + R_INNER * Math.cos(a0);
      const yi0 = CY + R_INNER * Math.sin(a0);
      const color = pocketColor(n);
      const fill =
        color === 'green' ? 'var(--accent)' : color === 'red' ? 'var(--danger)' : 'var(--bg-2)';
      return (
        <g key={n}>
          <path
            d={`M${x0.toFixed(2)} ${y0.toFixed(2)} A${R_OUTER} ${R_OUTER} 0 0 1 ${x1.toFixed(2)} ${y1.toFixed(2)} L${xi1.toFixed(2)} ${yi1.toFixed(2)} A${R_INNER} ${R_INNER} 0 0 0 ${xi0.toFixed(2)} ${yi0.toFixed(2)} Z`}
            fill={fill}
            stroke="var(--bg-0)"
            strokeWidth="1"
          />
          <text
            x={CX}
            y={CY - R_LABEL}
            transform={`rotate(${center} ${CX} ${CY})`}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize="11"
            fontWeight="700"
            fill={color === 'green' ? '#06230f' : 'var(--text)'}
          >
            {n}
          </text>
        </g>
      );
    });
  }, []);

  return (
    <svg
      className={spinning ? 'roulette-wheel roulette-wheel--spinning' : 'roulette-wheel'}
      viewBox="0 0 300 300"
      style={{ transform: `rotate(${rotation}deg)` }}
      data-testid="wheel"
      data-rotation={rotation}
    >
      <circle cx={CX} cy={CY} r={R_OUTER + 4} fill="var(--bg-1)" stroke="var(--gold)" strokeWidth="3" />
      {wedges}
      <circle cx={CX} cy={CY} r={R_INNER - 6} fill="var(--bg-1)" stroke="var(--gold)" strokeWidth="2" />
      <circle cx={CX} cy={CY} r={14} fill="var(--bg-2)" stroke="var(--gold)" strokeWidth="2" />
    </svg>
  );
}

interface Props {
  balance: number;
  onResult: (res: PlayResult) => void;
}

export function RouletteGame({ balance, onResult }: Props) {
  const [stake, setStake] = useState(100);
  const [betType, setBetType] = useState<BetType>('red');
  const [straightNumber, setStraightNumber] = useState<number | null>(null);
  const [result, setResult] = useState<PlayResult | null>(null);
  const [phase, setPhase] = useState<'idle' | 'waiting' | 'spinning' | 'win' | 'lose'>('idle');
  const [rotation, setRotation] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const rotationRef = useRef(0);
  const timerRef = useRef(0);

  useEffect(() => () => clearTimeout(timerRef.current), []);

  const busy = phase === 'waiting' || phase === 'spinning';
  const multiplier = MULTIPLIERS[betType];

  const selectOutside = (b: OutsideBet) => {
    setBetType(b);
    setStraightNumber(null);
  };

  const selectNumber = (n: number) => {
    setBetType('straight');
    setStraightNumber(n);
  };

  const handlePlay = useCallback(async () => {
    hapticImpact('medium');
    setPhase('waiting');
    setResult(null);
    setError(null);

    try {
      const bet: Record<string, unknown> = { stake, betType };
      if (betType === 'straight') bet.number = straightNumber;
      const res = await play('roulette', bet, getClientSeed());
      const outcome = res.outcome as unknown as RouletteOutcome;
      const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false;

      const settle = () => {
        setResult(res);
        setPhase(outcome.win ? 'win' : 'lose');
        onResult(res);
        hapticResult(outcome.win);
      };

      const target = wheelTarget(rotationRef.current, outcome.spin);
      rotationRef.current = target;
      setRotation(target);

      if (reduced) {
        settle();
      } else {
        setPhase('spinning');
        timerRef.current = window.setTimeout(settle, SPIN_MS);
      }
    } catch (err) {
      setPhase('idle');
      setError(err instanceof Error ? err.message : 'Error');
      hapticResult(false);
    }
  }, [stake, betType, straightNumber, onResult]);

  const outcome = result ? (result.outcome as unknown as RouletteOutcome) : null;
  const betLabel =
    betType === 'straight'
      ? straightNumber === null
        ? 'Pick a number'
        : `Number ${straightNumber}`
      : BET_NAMES[betType];
  const canSpin = stake >= 1 && stake <= balance && (betType !== 'straight' || straightNumber !== null);

  return (
    <div className="roulette">
      <div className={`roulette-stage roulette-stage--${phase}`}>
        <div className="roulette-stage-glow" aria-hidden="true" />
        <div className="roulette-pointer" aria-hidden="true" />
        <Wheel rotation={rotation} spinning={phase === 'spinning'} />
        <div className="roulette-caption">
          {phase === 'win' && outcome && (
            <>
              <span className={`roulette-result-num roulette-result-num--${outcome.color}`}>
                {outcome.spin}
              </span>
              {` Won ${outcome.payout.toLocaleString()} chips`}
            </>
          )}
          {phase === 'lose' && outcome && (
            <>
              <span className={`roulette-result-num roulette-result-num--${outcome.color}`}>
                {outcome.spin}
              </span>
              {' No luck this time'}
            </>
          )}
          {busy && 'Spinning…'}
          {phase === 'idle' && 'Place your bet'}
        </div>
      </div>

      <Panel className="roulette-board">
        <div className="roulette-outside">
          {OUTSIDE_BETS.map((b) => (
            <button
              key={b.id}
              className={
                betType === b.id
                  ? `roulette-bet roulette-bet--${b.id} roulette-bet--active`
                  : `roulette-bet roulette-bet--${b.id}`
              }
              disabled={busy}
              onClick={() => selectOutside(b.id)}
            >
              {b.label}
            </button>
          ))}
        </div>
        <div className="roulette-grid">
          {Array.from({ length: 37 }, (_, n) => (
            <button
              key={n}
              className={[
                'roulette-num',
                `roulette-num--${pocketColor(n)}`,
                betType === 'straight' && straightNumber === n ? 'roulette-num--active' : '',
                n === 0 ? 'roulette-num--zero' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              disabled={busy}
              onClick={() => selectNumber(n)}
            >
              {n}
            </button>
          ))}
        </div>
      </Panel>

      <div className="roulette-summary">
        <span className="roulette-summary-bet">{betLabel}</span>
        <span className="roulette-summary-detail">
          {multiplier}× · win {(stake * multiplier).toLocaleString()}
        </span>
      </div>

      <Panel>
        <StakeInput stake={stake} balance={balance} onChange={setStake} disabled={busy} />
      </Panel>

      <Button block loading={busy} disabled={!canSpin} onClick={handlePlay}>
        Spin Wheel
      </Button>

      {error && <div className="roulette-error">{error}</div>}
      {result && (
        <div className="roulette-proof">
          <ResultPanel result={result} />
        </div>
      )}
    </div>
  );
}
