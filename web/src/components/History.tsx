import { useState, useEffect } from 'react';
import { fetchHistory, type HistoryEntry } from '../api';
import { Skeleton } from '../ui';
import { DiceArt, CoinArt, RouletteArt, MinesArt } from './GameArt';
import { relativeTime } from './relativeTime';
import './History.css';

const GAME_ICONS: Record<string, (props: { size?: number }) => JSX.Element> = {
  dice: DiceArt,
  coinflip: CoinArt,
  roulette: RouletteArt,
  mines: MinesArt,
};

const GAME_NAMES: Record<string, string> = {
  dice: 'Dice',
  coinflip: 'Coin Flip',
  roulette: 'Roulette',
  mines: 'Mines',
};

export function History() {
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchHistory()
      .then((d) => {
        setHistory(d.history);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="history">
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} height={72} radius="var(--radius-card)" />
        ))}
      </div>
    );
  }

  if (history.length === 0) {
    return (
      <div className="history-empty">
        <DiceArt size={64} />
        <p className="history-empty-title">No games played yet</p>
        <p className="history-empty-sub">Your rounds will show up here</p>
      </div>
    );
  }

  return (
    <div className="history">
      {history.map((h) => {
        const Icon = GAME_ICONS[h.gameId];
        const win = h.netDelta >= 0;
        return (
          <div key={h.roundId} className="history-card">
            <div className="history-card-icon">{Icon ? <Icon size={40} /> : null}</div>
            <div className="history-card-main">
              <div className="history-card-game">{GAME_NAMES[h.gameId] ?? h.gameId}</div>
              <div className="history-card-time">{relativeTime(h.timestamp)}</div>
            </div>
            <div className="history-card-amounts">
              <div className="history-card-flow">
                {h.stake.toLocaleString()} → {h.payout.toLocaleString()}
              </div>
              <div className={win ? 'history-card-delta history-card-delta--win' : 'history-card-delta history-card-delta--loss'}>
                {win ? '+' : ''}
                {h.netDelta.toLocaleString()}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
