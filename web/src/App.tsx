import { useState, useEffect, useCallback } from 'react';
import { fetchMe, claimDailyBonus } from './api';
import { tokens, initTelegram } from './theme';
import { Button, ScreenHeader, useToast } from './ui';
import { DiceGame } from './components/DiceGame';
import { CoinflipGame } from './components/CoinflipGame';
import { RouletteGame } from './components/RouletteGame';
import { MinesGame } from './components/MinesGame';
import { History } from './components/History';
import { Leaderboard } from './components/Leaderboard';
import './App.css';

type Screen = 'lobby' | 'dice' | 'coinflip' | 'roulette' | 'mines' | 'history' | 'leaderboard';

const GAMES = [
  { id: 'dice' as Screen, name: 'Dice', desc: 'Roll under or over a target', icon: '🎲' },
  { id: 'coinflip' as Screen, name: 'Coin Flip', desc: '50/50 heads or tails', icon: '🪙' },
  { id: 'roulette' as Screen, name: 'Roulette', desc: 'European roulette wheel', icon: '🎰' },
  { id: 'mines' as Screen, name: 'Mines', desc: 'Avoid the hidden mines', icon: '💣' },
];

const SCREEN_TITLES: Record<Screen, string> = {
  lobby: 'Full House',
  dice: 'Dice',
  coinflip: 'Coin Flip',
  roulette: 'Roulette',
  mines: 'Mines',
  history: 'History',
  leaderboard: 'Leaderboard',
};

export function App() {
  const [balance, setBalance] = useState<number | null>(null);
  const [username, setUsername] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [screen, setScreen] = useState<Screen>('lobby');
  const [commitment, setCommitment] = useState<string | null>(null);
  const toast = useToast();

  useEffect(() => {
    initTelegram();
    fetchMe()
      .then((data) => { setBalance(data.balance); setUsername(data.user.username || data.user.firstName || 'Player'); setCommitment(data.fairness.seedHash); setLoading(false); })
      .catch((err) => { setError(err.message); setLoading(false); });
  }, []);

  const handleDailyBonus = useCallback(async () => {
    try {
      const result = await claimDailyBonus();
      if (result.awarded) {
        setBalance((b) => (b ?? 0) + result.amount);
        toast(`+${result.amount.toLocaleString()} chips! Streak: ${result.streak} day${result.streak > 1 ? 's' : ''}`, 'success');
      } else {
        toast('Already claimed today!');
      }
    } catch {
      toast('Failed to claim bonus', 'error');
    }
  }, [toast]);

  const handleBalanceUpdate = useCallback((b: number) => setBalance(b), []);

  const renderGame = () => {
    if (balance === null) return null;
    switch (screen) {
      case 'dice': return <DiceGame balance={balance} onBalanceUpdate={handleBalanceUpdate} />;
      case 'coinflip': return <CoinflipGame balance={balance} onBalanceUpdate={handleBalanceUpdate} />;
      case 'roulette': return <RouletteGame balance={balance} onBalanceUpdate={handleBalanceUpdate} />;
      case 'mines': return <MinesGame balance={balance} onBalanceUpdate={handleBalanceUpdate} />;
      case 'history': return <History />;
      case 'leaderboard': return <Leaderboard />;
      default: return null;
    }
  };

  return (
    <div className="app">
      <ScreenHeader
        title={SCREEN_TITLES[screen]}
        balance={balance}
        onBack={screen !== 'lobby' ? () => setScreen('lobby') : undefined}
      />

      {loading && <div style={{ textAlign: 'center', padding: '60px 20px', color: tokens.textDim }}>Loading...</div>}

      {error && (
        <div style={{ textAlign: 'center', padding: '60px 20px' }}>
          <div style={{ color: tokens.danger, marginBottom: '8px' }}>Failed to connect</div>
          <div style={{ color: tokens.textDim, fontSize: '14px' }}>{error}</div>
        </div>
      )}

      {!loading && !error && balance !== null && screen === 'lobby' && (
        <div style={{ padding: '16px' }}>
          <div style={{ marginBottom: '16px', color: tokens.textDim, fontSize: '14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>Welcome, {username}</span>
            <Button onClick={handleDailyBonus}>Daily Bonus</Button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px', marginBottom: '24px' }}>
            {GAMES.map((g) => (
              <button key={g.id} onClick={() => setScreen(g.id)}
                style={{
                  background: tokens.bg2, borderRadius: tokens.radiusCard, padding: '20px 16px',
                  border: `1px solid ${tokens.line}`, cursor: 'pointer', textAlign: 'center',
                }}>
                <div style={{ fontSize: '32px', marginBottom: '8px' }}>{g.icon}</div>
                <div style={{ fontSize: '16px', fontWeight: 'bold', color: tokens.text, marginBottom: '4px' }}>{g.name}</div>
                <div style={{ fontSize: '12px', color: tokens.textDim }}>{g.desc}</div>
              </button>
            ))}
          </div>

          <div style={{ display: 'flex', gap: '12px' }}>
            <Button variant="ghost" block onClick={() => setScreen('history')}>History</Button>
            <Button variant="ghost" block onClick={() => setScreen('leaderboard')}>Leaderboard</Button>
          </div>

          {commitment && (
            <div style={{ marginTop: '20px', textAlign: 'center', fontSize: '11px', color: tokens.textDim, wordBreak: 'break-all' }}>
              Provably fair · committed seed {commitment.slice(0, 16)}…
            </div>
          )}
        </div>
      )}

      {!loading && !error && screen !== 'lobby' && renderGame()}
    </div>
  );
}
