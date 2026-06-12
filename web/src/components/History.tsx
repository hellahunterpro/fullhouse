import { useState, useEffect } from 'react';
import { fetchHistory, fetchDuels, type HistoryEntry, type DuelSummary } from '../api';
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

type Item =
  | { kind: 'round'; at: string; round: HistoryEntry }
  | { kind: 'duel'; at: string; duel: DuelSummary };

function DuelIcon({ size = 40 }: { size?: number }) {
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden="true">
      <path d="M6 26L23 9M23 9v6M23 9h-6" stroke="var(--accent)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <path d="M26 26L9 9M9 9v6M9 9h6" stroke="var(--gold)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
}

export function History() {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.allSettled([fetchHistory(), fetchDuels()]).then(([rounds, duels]) => {
      const list: Item[] = [];
      if (rounds.status === 'fulfilled') {
        for (const r of rounds.value.history) {
          list.push({ kind: 'round', at: r.timestamp, round: r });
        }
      }
      if (duels.status === 'fulfilled') {
        for (const d of duels.value.duels) {
          list.push({ kind: 'duel', at: d.resolvedAt ?? d.createdAt, duel: d });
        }
      }
      list.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
      setItems(list);
      setLoading(false);
    });
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

  if (items.length === 0) {
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
      {items.map((item) => {
        if (item.kind === 'round') {
          const h = item.round;
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
        }

        const d = item.duel;
        const verdict =
          d.won === null
            ? d.state === 'created' || d.state === 'joined'
              ? 'open'
              : d.state
            : d.won
              ? 'won'
              : 'lost';
        return (
          <div key={`duel-${d.duelId}`} className="history-card">
            <div className="history-card-icon">
              <DuelIcon />
            </div>
            <div className="history-card-main">
              <div className="history-card-game">
                Duel · {GAME_NAMES[d.game] ?? d.game}
              </div>
              <div className="history-card-time">
                {d.creatorName ?? '—'} vs {d.opponentName ?? '—'} · {relativeTime(item.at)}
              </div>
            </div>
            <div className="history-card-amounts">
              <div className="history-card-flow">stake {d.stake.toLocaleString()}</div>
              <div
                className={
                  verdict === 'won'
                    ? 'history-card-delta history-card-delta--win'
                    : verdict === 'lost'
                      ? 'history-card-delta history-card-delta--loss'
                      : 'history-card-delta'
                }
              >
                {verdict === 'won' ? `+${d.stake.toLocaleString()}` : verdict === 'lost' ? `-${d.stake.toLocaleString()}` : verdict}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
