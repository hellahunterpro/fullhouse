import { useState, useEffect, useCallback } from 'react';
import { fetchMe, type UserInfo } from './api';
import { tokens, initTelegram } from './theme';
import { ScreenHeader } from './ui';
import { Lobby } from './components/Lobby';
import { DiceGame } from './components/DiceGame';
import { CoinflipGame } from './components/CoinflipGame';
import { RouletteGame } from './components/RouletteGame';
import { MinesGame } from './components/MinesGame';
import { History } from './components/History';
import { Leaderboard } from './components/Leaderboard';
import './App.css';

type Screen = 'lobby' | 'dice' | 'coinflip' | 'roulette' | 'mines' | 'history' | 'leaderboard';

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
  const [me, setMe] = useState<UserInfo | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [screen, setScreen] = useState<Screen>('lobby');

  useEffect(() => {
    initTelegram();
    fetchMe()
      .then((data) => {
        setMe(data);
        setBalance(data.balance);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  const handleBalanceUpdate = useCallback((b: number) => setBalance(b), []);
  const handleBalanceDelta = useCallback((d: number) => setBalance((b) => (b ?? 0) + d), []);

  const renderScreen = () => {
    if (balance === null || me === null) return null;
    switch (screen) {
      case 'lobby':
        return (
          <Lobby
            username={me.user.username || me.user.firstName || 'Player'}
            commitment={me.fairness.seedHash}
            bonusAvailable={me.dailyBonus?.available ?? true}
            bonusStreak={me.dailyBonus?.streak ?? 0}
            onNavigate={setScreen}
            onBalanceDelta={handleBalanceDelta}
          />
        );
      case 'dice': return <DiceGame balance={balance} onBalanceUpdate={handleBalanceUpdate} />;
      case 'coinflip': return <CoinflipGame balance={balance} onBalanceUpdate={handleBalanceUpdate} />;
      case 'roulette': return <RouletteGame balance={balance} onBalanceUpdate={handleBalanceUpdate} />;
      case 'mines': return <MinesGame balance={balance} onBalanceUpdate={handleBalanceUpdate} />;
      case 'history': return <History />;
      case 'leaderboard': return <Leaderboard />;
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

      {!loading && !error && renderScreen()}
    </div>
  );
}
