import { useState, useCallback } from 'react';
import { play, type PlayResult } from '../api';
import { tokens } from '../theme';
import { GameResult } from './GameResult';

interface Props {
  balance: number;
  onBalanceUpdate: (b: number) => void;
}

export function MinesGame({ balance, onBalanceUpdate }: Props) {
  const [stake, setStake] = useState(100);
  const [mineCount, setMineCount] = useState(5);
  const [picks, setPicks] = useState<Set<number>>(new Set());
  const [result, setResult] = useState<PlayResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const maxPicks = 25 - mineCount;

  const togglePick = (i: number) => {
    if (result) return;
    const next = new Set(picks);
    if (next.has(i)) next.delete(i);
    else if (next.size < maxPicks) next.add(i);
    setPicks(next);
  };

  const handlePlay = useCallback(async () => {
    if (picks.size === 0) { setError('Pick at least one tile'); return; }
    setLoading(true);
    setError(null);
    try {
      const res = await play('mines', { stake, mineCount, picks: Array.from(picks).sort((a, b) => a - b) }, crypto.randomUUID());
      setResult(res);
      onBalanceUpdate(res.balanceAfter);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    } finally {
      setLoading(false);
    }
  }, [stake, mineCount, picks, onBalanceUpdate]);

  const minePositions = result ? new Set((result.outcome as { minePositions: number[] }).minePositions) : null;

  const resetGame = () => { setResult(null); setPicks(new Set()); setError(null); };

  return (
    <div style={{ padding: '16px' }}>
      <div style={{ background: tokens.bg1, borderRadius: tokens.radiusCard, padding: '20px', marginBottom: '16px' }}>
        <div style={{ display: 'flex', gap: '16px', marginBottom: '12px' }}>
          <div style={{ flex: 1 }}>
            <label style={{ color: tokens.textDim, fontSize: '14px', display: 'block', marginBottom: '4px' }}>Stake</label>
            <input type="number" value={stake}
              onChange={(e) => setStake(Math.max(1, Math.min(balance, parseInt(e.target.value) || 0)))}
              style={{ width: '100%', padding: '10px', borderRadius: '8px', border: `1px solid ${tokens.line}`, background: tokens.bg0, color: tokens.text, fontSize: '16px', boxSizing: 'border-box' }}
            />
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ color: tokens.textDim, fontSize: '14px', display: 'block', marginBottom: '4px' }}>Mines: {mineCount}</label>
            <input type="range" value={mineCount} onChange={(e) => { setMineCount(parseInt(e.target.value)); setPicks(new Set()); setResult(null); }} min={1} max={24}
              style={{ width: '100%', accentColor: tokens.accent, marginTop: '8px' }}
            />
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '6px', marginBottom: '16px' }}>
        {Array.from({ length: 25 }, (_, i) => {
          const isPicked = picks.has(i);
          const isMine = minePositions?.has(i);
          const revealed = result !== null;

          let bg: string = tokens.bg1;
          let content = '';
          if (revealed && isMine) { bg = '#5a1a1a'; content = '💣'; }
          else if (revealed && isPicked && !isMine) { bg = '#1a3a2a'; content = '💎'; }
          else if (revealed && !isPicked && !isMine) { bg = tokens.bg1; content = ''; }
          else if (isPicked) { bg = tokens.accent; content = '✓'; }

          return (
            <button key={i} onClick={() => togglePick(i)}
              style={{
                aspectRatio: '1', borderRadius: '8px', border: 'none',
                background: bg, color: tokens.text, cursor: revealed ? 'default' : 'pointer',
                fontSize: content.length > 1 ? '20px' : '16px', fontWeight: 'bold',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
              {content}
            </button>
          );
        })}
      </div>

      <div style={{ background: tokens.bg1, borderRadius: tokens.radiusCard, padding: '12px', marginBottom: '16px', textAlign: 'center' }}>
        <span style={{ color: tokens.textDim, fontSize: '14px' }}>
          {picks.size} / {maxPicks} tiles selected | {mineCount} mines
        </span>
      </div>

      {!result ? (
        <button onClick={handlePlay} disabled={loading || stake > balance || stake < 1 || picks.size === 0}
          style={{ width: '100%', padding: '16px', borderRadius: tokens.radiusCard, border: 'none', background: loading ? tokens.line : tokens.accent, color: '#fff', fontSize: '18px', fontWeight: 'bold', cursor: loading ? 'not-allowed' : 'pointer' }}>
          {loading ? 'Revealing...' : 'Reveal'}
        </button>
      ) : (
        <button onClick={resetGame}
          style={{ width: '100%', padding: '16px', borderRadius: tokens.radiusCard, border: 'none', background: tokens.accent, color: '#fff', fontSize: '18px', fontWeight: 'bold', cursor: 'pointer' }}>
          Play Again
        </button>
      )}

      {error && <div style={{ background: '#3a1a2a', borderRadius: tokens.radiusCard, padding: '16px', color: tokens.danger, marginTop: '16px' }}>{error}</div>}
      {result && <GameResult result={result} />}
    </div>
  );
}
