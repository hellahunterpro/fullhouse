import { useState, useEffect } from 'react';
import { fetchLeaderboard, type LeaderboardEntry } from '../api';
import { tokens } from '../theme';

export function Leaderboard() {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchLeaderboard().then((d) => { setEntries(d.leaderboard); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  if (loading) return <div style={{ padding: '40px', textAlign: 'center', color: tokens.textSecondary }}>Loading...</div>;
  if (entries.length === 0) return <div style={{ padding: '40px', textAlign: 'center', color: tokens.textSecondary }}>No players yet</div>;

  return (
    <div style={{ padding: '16px' }}>
      {entries.map((e) => (
        <div key={e.userId} style={{
          background: tokens.bgSecondary, borderRadius: tokens.radius, padding: '16px', marginBottom: '8px',
          display: 'flex', alignItems: 'center', gap: '16px',
        }}>
          <div style={{
            width: '36px', height: '36px', borderRadius: '50%',
            background: e.rank <= 3 ? tokens.accent : tokens.border,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '16px', fontWeight: 'bold', flexShrink: 0,
          }}>
            {e.rank}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '16px', fontWeight: 'bold' }}>{e.username || 'Anonymous'}</div>
          </div>
          <div style={{ fontSize: '16px', fontWeight: 'bold', color: tokens.success }}>
            {e.balance.toLocaleString()}
          </div>
        </div>
      ))}
    </div>
  );
}
