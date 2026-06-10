import { useState, useCallback } from 'react';
import { play, type PlayResult } from '../api';
import { tokens } from '../theme';
import { GameResult } from './GameResult';

interface Props {
  balance: number;
  onBalanceUpdate: (b: number) => void;
}

export function DiceGame({ balance, onBalanceUpdate }: Props) {
  const [stake, setStake] = useState(100);
  const [target, setTarget] = useState(50);
  const [direction, setDirection] = useState<'under' | 'over'>('under');
  const [result, setResult] = useState<PlayResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const winChance = direction === 'under' ? target : 100 - target;
  const multiplier = Math.floor((100 / winChance) * 0.99 * 100) / 100;
  const potentialPayout = Math.floor(stake * multiplier);

  const handlePlay = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await play('dice', { stake, target, direction }, crypto.randomUUID());
      setResult(res);
      onBalanceUpdate(res.balanceAfter);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    } finally {
      setLoading(false);
    }
  }, [stake, target, direction, onBalanceUpdate]);

  return (
    <div style={{ padding: '16px' }}>
      <div style={{ background: tokens.bgSecondary, borderRadius: tokens.radius, padding: '20px', marginBottom: '16px' }}>
        <label style={{ color: tokens.textSecondary, fontSize: '14px', display: 'block', marginBottom: '8px' }}>Stake</label>
        <input type="number" value={stake}
          onChange={(e) => setStake(Math.max(1, Math.min(balance, parseInt(e.target.value) || 0)))}
          style={{ width: '100%', padding: '12px', borderRadius: '8px', border: `1px solid ${tokens.border}`, background: tokens.bg, color: tokens.text, fontSize: '18px', boxSizing: 'border-box' }}
        />
        <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
          {[10, 50, 100, 500, 1000].map((v) => (
            <button key={v} onClick={() => setStake(Math.min(v, balance))}
              style={{ flex: 1, padding: '8px', borderRadius: '6px', border: `1px solid ${tokens.border}`, background: stake === v ? tokens.accent : tokens.bg, color: tokens.text, cursor: 'pointer', fontSize: '13px' }}>
              {v}
            </button>
          ))}
        </div>
      </div>

      <div style={{ background: tokens.bgSecondary, borderRadius: tokens.radius, padding: '20px', marginBottom: '16px' }}>
        <label style={{ color: tokens.textSecondary, fontSize: '14px', display: 'block', marginBottom: '8px' }}>Target: {target}</label>
        <input type="range" value={target} onChange={(e) => setTarget(parseInt(e.target.value))} min={1} max={98}
          style={{ width: '100%', accentColor: tokens.accent }}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '12px', gap: '8px' }}>
          {(['under', 'over'] as const).map((d) => (
            <button key={d} onClick={() => setDirection(d)}
              style={{ flex: 1, padding: '12px', borderRadius: '8px', border: 'none', background: direction === d ? tokens.accent : tokens.bg, color: tokens.text, cursor: 'pointer', fontWeight: direction === d ? 'bold' : 'normal', fontSize: '16px' }}>
              Roll {d === 'under' ? 'Under' : 'Over'} {target}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', background: tokens.bgSecondary, borderRadius: tokens.radius, padding: '16px', marginBottom: '16px' }}>
        <div><div style={{ color: tokens.textSecondary, fontSize: '12px' }}>Win Chance</div><div style={{ color: tokens.text, fontSize: '18px', fontWeight: 'bold' }}>{winChance}%</div></div>
        <div><div style={{ color: tokens.textSecondary, fontSize: '12px' }}>Multiplier</div><div style={{ color: tokens.text, fontSize: '18px', fontWeight: 'bold' }}>{multiplier}x</div></div>
        <div><div style={{ color: tokens.textSecondary, fontSize: '12px' }}>Payout</div><div style={{ color: tokens.success, fontSize: '18px', fontWeight: 'bold' }}>{potentialPayout}</div></div>
      </div>

      <button onClick={handlePlay} disabled={loading || stake > balance || stake < 1}
        style={{ width: '100%', padding: '16px', borderRadius: tokens.radius, border: 'none', background: loading ? tokens.border : tokens.accent, color: '#fff', fontSize: '18px', fontWeight: 'bold', cursor: loading ? 'not-allowed' : 'pointer' }}>
        {loading ? 'Rolling...' : 'Roll Dice'}
      </button>

      {error && <div style={{ background: '#3a1a2a', borderRadius: tokens.radius, padding: '16px', color: tokens.danger, marginTop: '16px' }}>{error}</div>}
      {result && <GameResult result={result} />}
    </div>
  );
}
