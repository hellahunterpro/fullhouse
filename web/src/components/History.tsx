import { useState, useEffect } from 'react';
import { fetchHistory, type HistoryEntry } from '../api';
import { tokens } from '../theme';

export function History() {
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchHistory().then((d) => { setHistory(d.history); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  if (loading) return <div style={{ padding: '40px', textAlign: 'center', color: tokens.textSecondary }}>Loading...</div>;
  if (history.length === 0) return <div style={{ padding: '40px', textAlign: 'center', color: tokens.textSecondary }}>No games played yet</div>;

  return (
    <div style={{ padding: '16px' }}>
      {history.map((h, i) => (
        <div key={i} style={{
          background: tokens.bgSecondary, borderRadius: tokens.radius, padding: '16px', marginBottom: '8px',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <div>
            <div style={{ fontSize: '16px', fontWeight: 'bold', textTransform: 'capitalize' }}>{h.gameId}</div>
            <div style={{ fontSize: '12px', color: tokens.textSecondary }}>{new Date(h.timestamp).toLocaleString()}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '14px', color: tokens.textSecondary }}>Stake: {h.stake}</div>
            <div style={{ fontSize: '16px', fontWeight: 'bold', color: h.netDelta >= 0 ? tokens.success : tokens.danger }}>
              {h.netDelta >= 0 ? '+' : ''}{h.netDelta}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
