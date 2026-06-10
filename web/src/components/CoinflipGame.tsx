import { useState, useCallback } from 'react';
import { play, type PlayResult } from '../api';
import { tokens } from '../theme';
import { GameResult } from './GameResult';

interface Props {
  balance: number;
  onBalanceUpdate: (b: number) => void;
}

export function CoinflipGame({ balance, onBalanceUpdate }: Props) {
  const [stake, setStake] = useState(100);
  const [choice, setChoice] = useState<'heads' | 'tails'>('heads');
  const [result, setResult] = useState<PlayResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handlePlay = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await play('coinflip', { stake, choice }, crypto.randomUUID());
      setResult(res);
      onBalanceUpdate(res.balanceAfter);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    } finally {
      setLoading(false);
    }
  }, [stake, choice, onBalanceUpdate]);

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

      <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
        {(['heads', 'tails'] as const).map((c) => (
          <button key={c} onClick={() => setChoice(c)}
            style={{
              flex: 1, padding: '24px 16px', borderRadius: tokens.radius, border: 'none',
              background: choice === c ? tokens.accent : tokens.bgSecondary,
              color: tokens.text, cursor: 'pointer', fontSize: '18px', fontWeight: 'bold',
              textTransform: 'capitalize',
            }}>
            {c === 'heads' ? '🪙 Heads' : '🪙 Tails'}
          </button>
        ))}
      </div>

      <div style={{ background: tokens.bgSecondary, borderRadius: tokens.radius, padding: '16px', marginBottom: '16px', display: 'flex', justifyContent: 'space-between' }}>
        <div><div style={{ color: tokens.textSecondary, fontSize: '12px' }}>Win Chance</div><div style={{ color: tokens.text, fontSize: '18px', fontWeight: 'bold' }}>50%</div></div>
        <div><div style={{ color: tokens.textSecondary, fontSize: '12px' }}>Multiplier</div><div style={{ color: tokens.text, fontSize: '18px', fontWeight: 'bold' }}>1.98x</div></div>
        <div><div style={{ color: tokens.textSecondary, fontSize: '12px' }}>Payout</div><div style={{ color: tokens.success, fontSize: '18px', fontWeight: 'bold' }}>{Math.floor(stake * 1.98)}</div></div>
      </div>

      <button onClick={handlePlay} disabled={loading || stake > balance || stake < 1}
        style={{ width: '100%', padding: '16px', borderRadius: tokens.radius, border: 'none', background: loading ? tokens.border : tokens.accent, color: '#fff', fontSize: '18px', fontWeight: 'bold', cursor: loading ? 'not-allowed' : 'pointer' }}>
        {loading ? 'Flipping...' : 'Flip Coin'}
      </button>

      {error && <div style={{ background: '#3a1a2a', borderRadius: tokens.radius, padding: '16px', color: tokens.danger, marginTop: '16px' }}>{error}</div>}
      {result && <GameResult result={result} />}
    </div>
  );
}
