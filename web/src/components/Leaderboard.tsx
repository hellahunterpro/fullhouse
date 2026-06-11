import { useState, useEffect } from 'react';
import { fetchLeaderboard, type LeaderboardEntry } from '../api';
import { Skeleton } from '../ui';
import './Leaderboard.css';

function TrophyIcon({ size = 56 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 56 56" aria-hidden="true">
      <path
        d="M18 12h20v10a10 10 0 01-20 0z"
        fill="var(--bg-1)"
        stroke="var(--gold)"
        strokeWidth="2.4"
        strokeLinejoin="round"
      />
      <path
        d="M18 15h-6a6 6 0 006 8M38 15h6a6 6 0 01-6 8"
        fill="none"
        stroke="var(--gold)"
        strokeWidth="2.2"
      />
      <path d="M28 32v6M21 44h14M24 38h8v6h-8z" fill="var(--bg-1)" stroke="var(--gold)" strokeWidth="2.2" strokeLinejoin="round" />
    </svg>
  );
}

export function Leaderboard() {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchLeaderboard()
      .then((d) => {
        setEntries(d.leaderboard);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="leaderboard">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} height={64} radius="var(--radius-card)" />
        ))}
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="leaderboard-empty">
        <TrophyIcon size={64} />
        <p className="leaderboard-empty-title">No players yet</p>
        <p className="leaderboard-empty-sub">Be the first on the board</p>
      </div>
    );
  }

  return (
    <div className="leaderboard">
      {entries.map((e) => (
        <div
          key={e.userId}
          className={e.rank <= 3 ? `leaderboard-card leaderboard-card--top${e.rank}` : 'leaderboard-card'}
        >
          <div className={e.rank <= 3 ? `leaderboard-rank leaderboard-rank--top${e.rank}` : 'leaderboard-rank'}>
            {e.rank}
          </div>
          <div className="leaderboard-name">{e.username || 'Anonymous'}</div>
          <div className="leaderboard-balance">{e.balance.toLocaleString()}</div>
        </div>
      ))}
    </div>
  );
}
