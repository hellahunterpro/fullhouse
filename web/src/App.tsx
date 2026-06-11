import { useState, useEffect, useCallback } from 'react';
import { fetchMe, type UserInfo, type PlayResult, type PublicProof } from './api';
import { initTelegram } from './theme';
import { Button, ScreenHeader, Skeleton } from './ui';
import { Lobby } from './components/Lobby';
import { DiceGame } from './components/DiceGame';
import { CoinflipGame } from './components/CoinflipGame';
import { RouletteGame } from './components/RouletteGame';
import { MinesGame } from './components/MinesGame';
import { History } from './components/History';
import { Leaderboard } from './components/Leaderboard';
import { FairnessSheet } from './components/FairnessSheet';
import { TelegramGate } from './components/TelegramGate';
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

function LobbySkeleton() {
  return (
    <div className="app-skeleton">
      <Skeleton height={72} radius="var(--radius-card)" />
      <div className="app-skeleton-grid">
        <Skeleton height={140} radius="var(--radius-card)" />
        <Skeleton height={140} radius="var(--radius-card)" />
        <Skeleton height={140} radius="var(--radius-card)" />
        <Skeleton height={140} radius="var(--radius-card)" />
      </div>
      <Skeleton height={52} radius="var(--radius-card)" />
    </div>
  );
}

export function App() {
  const [me, setMe] = useState<UserInfo | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [screen, setScreen] = useState<Screen>('lobby');
  const [lastProof, setLastProof] = useState<PublicProof | null>(null);
  const [fairnessOpen, setFairnessOpen] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    fetchMe()
      .then((data) => {
        setMe(data);
        setBalance(data.balance);
        setLoading(false);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Failed to connect');
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    initTelegram();
    load();
  }, [load]);

  const handleResult = useCallback((res: PlayResult) => {
    setBalance(res.balanceAfter);
    setLastProof(res.proof);
  }, []);
  const handleBalanceDelta = useCallback((d: number) => setBalance((b) => (b ?? 0) + d), []);

  // Auth failed and we are not inside Telegram: this is the plain-browser case.
  const hasInitData = Boolean(window.Telegram?.WebApp?.initData);
  if (error && !hasInitData) {
    return <TelegramGate />;
  }

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
            onOpenFairness={() => setFairnessOpen(true)}
          />
        );
      case 'dice': return <DiceGame balance={balance} onResult={handleResult} />;
      case 'coinflip': return <CoinflipGame balance={balance} onResult={handleResult} />;
      case 'roulette': return <RouletteGame balance={balance} onResult={handleResult} />;
      case 'mines': return <MinesGame balance={balance} onResult={handleResult} />;
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

      {loading && <LobbySkeleton />}

      {error && (
        <div className="app-error">
          <div className="app-error-title">Connection trouble</div>
          <div className="app-error-text">{error}</div>
          <Button variant="ghost" onClick={load}>
            Try again
          </Button>
        </div>
      )}

      {!loading && !error && renderScreen()}

      <FairnessSheet
        open={fairnessOpen}
        onClose={() => setFairnessOpen(false)}
        lastProof={lastProof}
      />
    </div>
  );
}
