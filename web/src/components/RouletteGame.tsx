import { useState, useCallback } from 'react';
import { play, type PlayResult } from '../api';
import { tokens } from '../theme';
import { GameResult } from './GameResult';

type BetType = 'red' | 'black' | 'odd' | 'even' | 'high' | 'low' | 'dozen1' | 'dozen2' | 'dozen3' | 'straight';

const BET_LABELS: Record<BetType, string> = {
  red: 'Red', black: 'Black', odd: 'Odd', even: 'Even',
  high: '19-36', low: '1-18', dozen1: '1-12', dozen2: '13-24', dozen3: '25-36', straight: 'Number',
};
const BET_MULTIPLIERS: Record<BetType, number> = {
  red: 2, black: 2, odd: 2, even: 2, high: 2, low: 2, dozen1: 3, dozen2: 3, dozen3: 3, straight: 36,
};

interface Props {
  balance: number;
  onBalanceUpdate: (b: number) => void;
}

export function RouletteGame({ balance, onBalanceUpdate }: Props) {
  const [stake, setStake] = useState(100);
  const [betType, setBetType] = useState<BetType>('red');
  const [straightNumber, setStraightNumber] = useState(0);
  const [result, setResult] = useState<PlayResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const multiplier = BET_MULTIPLIERS[betType];

  const handlePlay = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const bet: Record<string, unknown> = { stake, betType };
      if (betType === 'straight') bet.number = straightNumber;
      const res = await play('roulette', bet, crypto.randomUUID());
      setResult(res);
      onBalanceUpdate(res.balanceAfter);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    } finally {
      setLoading(false);
    }
  }, [stake, betType, straightNumber, onBalanceUpdate]);

  return (
    <div style={{ padding: '16px' }}>
      <div style={{ background: tokens.bg1, borderRadius: tokens.radiusCard, padding: '20px', marginBottom: '16px' }}>
        <label style={{ color: tokens.textDim, fontSize: '14px', display: 'block', marginBottom: '8px' }}>Stake</label>
        <input type="number" value={stake}
          onChange={(e) => setStake(Math.max(1, Math.min(balance, parseInt(e.target.value) || 0)))}
          style={{ width: '100%', padding: '12px', borderRadius: '8px', border: `1px solid ${tokens.line}`, background: tokens.bg0, color: tokens.text, fontSize: '18px', boxSizing: 'border-box' }}
        />
      </div>

      <div style={{ background: tokens.bg1, borderRadius: tokens.radiusCard, padding: '20px', marginBottom: '16px' }}>
        <label style={{ color: tokens.textDim, fontSize: '14px', display: 'block', marginBottom: '12px' }}>Bet Type</label>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
          {(Object.keys(BET_LABELS) as BetType[]).map((bt) => (
            <button key={bt} onClick={() => setBetType(bt)}
              style={{
                padding: '10px 8px', borderRadius: '8px', border: 'none', fontSize: '13px',
                background: betType === bt ? tokens.accent : tokens.bg0,
                color: bt === 'red' && betType !== bt ? '#e74c3c' : bt === 'black' && betType !== bt ? '#95a5a6' : tokens.text,
                cursor: 'pointer', fontWeight: betType === bt ? 'bold' : 'normal',
              }}>
              {BET_LABELS[bt]} ({BET_MULTIPLIERS[bt]}x)
            </button>
          ))}
        </div>
        {betType === 'straight' && (
          <div style={{ marginTop: '12px' }}>
            <label style={{ color: tokens.textDim, fontSize: '14px' }}>Number: {straightNumber}</label>
            <input type="range" value={straightNumber} onChange={(e) => setStraightNumber(parseInt(e.target.value))} min={0} max={36}
              style={{ width: '100%', accentColor: tokens.accent }}
            />
          </div>
        )}
      </div>

      <div style={{ background: tokens.bg1, borderRadius: tokens.radiusCard, padding: '16px', marginBottom: '16px', display: 'flex', justifyContent: 'space-between' }}>
        <div><div style={{ color: tokens.textDim, fontSize: '12px' }}>Multiplier</div><div style={{ color: tokens.text, fontSize: '18px', fontWeight: 'bold' }}>{multiplier}x</div></div>
        <div><div style={{ color: tokens.textDim, fontSize: '12px' }}>Payout</div><div style={{ color: tokens.accent, fontSize: '18px', fontWeight: 'bold' }}>{(stake * multiplier).toLocaleString()}</div></div>
      </div>

      <button onClick={handlePlay} disabled={loading || stake > balance || stake < 1}
        style={{ width: '100%', padding: '16px', borderRadius: tokens.radiusCard, border: 'none', background: loading ? tokens.line : tokens.accent, color: '#fff', fontSize: '18px', fontWeight: 'bold', cursor: loading ? 'not-allowed' : 'pointer' }}>
        {loading ? 'Spinning...' : 'Spin Wheel'}
      </button>

      {error && <div style={{ background: '#3a1a2a', borderRadius: tokens.radiusCard, padding: '16px', color: tokens.danger, marginTop: '16px' }}>{error}</div>}
      {result && <GameResult result={result} />}
    </div>
  );
}
