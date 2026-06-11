import { useState } from 'react';
import { claimDailyBonus } from '../api';
import { useToast } from '../ui';
import { hapticImpact, hapticResult } from '../haptics';
import { DiceArt, CoinArt, RouletteArt, MinesArt, FlameArt } from './GameArt';
import './Lobby.css';

export type GameScreen = 'dice' | 'coinflip' | 'roulette' | 'mines';

const GAMES: { id: GameScreen; name: string; desc: string; art: React.ReactNode }[] = [
  { id: 'dice', name: 'Dice', desc: 'Roll under or over', art: <DiceArt /> },
  { id: 'coinflip', name: 'Coin Flip', desc: '50/50 heads or tails', art: <CoinArt /> },
  { id: 'roulette', name: 'Roulette', desc: 'European wheel', art: <RouletteArt /> },
  { id: 'mines', name: 'Mines', desc: 'Dodge the mines', art: <MinesArt /> },
];

interface Props {
  username: string;
  commitment: string | null;
  bonusAvailable: boolean;
  bonusStreak: number;
  onNavigate: (screen: GameScreen | 'history' | 'leaderboard') => void;
  onBalanceDelta: (amount: number) => void;
  onOpenFairness?: () => void;
}

export function Lobby({
  username,
  commitment,
  bonusAvailable,
  bonusStreak,
  onNavigate,
  onBalanceDelta,
  onOpenFairness,
}: Props) {
  const toast = useToast();
  const [available, setAvailable] = useState(bonusAvailable);
  const [streak, setStreak] = useState(bonusStreak);
  const [claiming, setClaiming] = useState(false);

  const handleClaim = async () => {
    if (!available || claiming) return;
    hapticImpact('medium');
    setClaiming(true);
    try {
      const result = await claimDailyBonus();
      if (result.awarded) {
        onBalanceDelta(result.amount);
        setStreak(result.streak);
        toast(`+${result.amount.toLocaleString()} chips!`, 'success');
        hapticResult(true);
      } else {
        toast('Already claimed today');
        setStreak(result.streak);
      }
      setAvailable(false);
    } catch {
      toast('Failed to claim bonus', 'error');
      hapticResult(false);
    } finally {
      setClaiming(false);
    }
  };

  return (
    <div className="lobby">
      <p className="lobby-welcome">Welcome back, {username}</p>

      <button
        className={available ? 'bonus-card bonus-card--ready' : 'bonus-card'}
        onClick={handleClaim}
        disabled={!available || claiming}
      >
        <span className="bonus-card-flame">
          <FlameArt size={26} />
        </span>
        <span className="bonus-card-info">
          <span className="bonus-card-title">
            {available ? 'Daily bonus ready' : 'Daily bonus claimed'}
          </span>
          <span className="bonus-card-sub">
            {streak > 0 ? `${streak}-day streak` : 'Start your streak today'}
          </span>
        </span>
        <span className="bonus-card-action">
          {claiming ? '…' : available ? 'Claim' : '✓'}
        </span>
      </button>

      <div className="games-grid">
        {GAMES.map((g) => (
          <button
            key={g.id}
            className="game-card"
            onClick={() => {
              hapticImpact('light');
              onNavigate(g.id);
            }}
          >
            <span className="game-card-art">{g.art}</span>
            <span className="game-card-name">{g.name}</span>
            <span className="game-card-desc">{g.desc}</span>
          </button>
        ))}
      </div>

      <div className="lobby-segmented">
        <button className="lobby-segment" onClick={() => onNavigate('history')}>
          History
        </button>
        <div className="lobby-segment-divider" />
        <button className="lobby-segment" onClick={() => onNavigate('leaderboard')}>
          Leaderboard
        </button>
      </div>

      {commitment && (
        <button className="fair-footer" onClick={onOpenFairness} disabled={!onOpenFairness}>
          <span className="fair-footer-dot" />
          Provably fair · seed {commitment.slice(0, 12)}…
        </button>
      )}
    </div>
  );
}
