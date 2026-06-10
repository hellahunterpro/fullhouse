import { useState, useEffect, useCallback } from 'react';
import { fetchMe, claimDailyBonus } from './api';
import { tokens, applyTelegramTheme } from './theme';
import { DiceGame } from './components/DiceGame';
import { CoinflipGame } from './components/CoinflipGame';
import { RouletteGame } from './components/RouletteGame';
import { MinesGame } from './components/MinesGame';
import { History } from './components/History';
import { Leaderboard } from './components/Leaderboard';

type Screen = 'lobby' | 'dice' | 'coinflip' | 'roulette' | 'mines' | 'history' | 'leaderboard';

const GAMES = [
  { id: 'dice' as Screen, name: 'Dice', desc: 'Roll under or over a target', icon: '🎲' },
  { id: 'coinflip' as Screen, name: 'Coin Flip', desc: '50/50 heads or tails', icon: '🪙' },
  { id: 'roulette' as Screen, name: 'Roulette', desc: 'European roulette wheel', icon: '🎰' },
  { id: 'mines' as Screen, name: 'Mines', desc: 'Avoid the hidden mines', icon: '💣' },
];

export function App() {
  const [balance, setBalance] = useState<number | null>(null);
  const [username, setUsername] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [screen, setScreen] = useState<Screen>('lobby');
  const [bonusMsg, setBonusMsg] = useState<string | null>(null);

  useEffect(() => {
    applyTelegramTheme();
    fetchMe()
      .then((data) => { setBalance(data.balance); setUsername(data.user.username || data.user.firstName || 'Player'); setLoading(false); })
      .catch((err) => { setError(err.message); setLoading(false); });
  }, []);

  const handleDailyBonus = useCallback(async () => {
    try {
      const result = await claimDailyBonus();
      if (result.awarded) {
        setBalance((b) => (b ?? 0) + result.amount);
        setBonusMsg(`+${result.amount} chips! Streak: ${result.streak} day${result.streak > 1 ? 's' : ''}`);
      } else {
        setBonusMsg('Already claimed today!');
      }
      setTimeout(() => setBonusMsg(null), 3000);
    } catch {
      setBonusMsg('Failed to claim bonus');
      setTimeout(() => setBonusMsg(null), 3000);
    }
  }, []);

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
    <div style={{ minHeight: '100vh', background: tokens.bg, color: tokens.text, fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderBottom: `1px solid ${tokens.border}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {screen !== 'lobby' && (
            <button onClick={() => setScreen('lobby')}
              style={{ background: 'none', border: 'none', color: tokens.text, cursor: 'pointer', fontSize: '20px', padding: '4px' }}>
              ←
            </button>
          )}
          <div style={{ fontSize: '18px', fontWeight: 'bold' }}>Full House</div>
        </div>
        {balance !== null && (
          <div style={{ background: tokens.bgSecondary, padding: '6px 14px', borderRadius: '20px', fontSize: '15px', fontWeight: 'bold' }}>
            {balance.toLocaleString()} chips
          </div>
        )}
      </header>

      {bonusMsg && (
        <div style={{ background: '#1a3a2a', padding: '12px', textAlign: 'center', color: tokens.success, fontWeight: 'bold' }}>
          {bonusMsg}
        </div>
      )}

      {loading && <div style={{ textAlign: 'center', padding: '60px 20px', color: tokens.textSecondary }}>Loading...</div>}

      {error && (
        <div style={{ textAlign: 'center', padding: '60px 20px' }}>
          <div style={{ color: tokens.danger, marginBottom: '8px' }}>Failed to connect</div>
          <div style={{ color: tokens.textSecondary, fontSize: '14px' }}>{error}</div>
        </div>
      )}

      {!loading && !error && balance !== null && screen === 'lobby' && (
        <div style={{ padding: '16px' }}>
          <div style={{ marginBottom: '16px', color: tokens.textSecondary, fontSize: '14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>Welcome, {username}</span>
            <button onClick={handleDailyBonus}
              style={{ background: tokens.accent, border: 'none', color: '#fff', padding: '8px 16px', borderRadius: '20px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px' }}>
              Daily Bonus
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px', marginBottom: '24px' }}>
            {GAMES.map((g) => (
              <button key={g.id} onClick={() => setScreen(g.id)}
                style={{
                  background: tokens.bgSecondary, borderRadius: tokens.radius, padding: '20px 16px',
                  border: 'none', cursor: 'pointer', textAlign: 'center',
                }}>
                <div style={{ fontSize: '32px', marginBottom: '8px' }}>{g.icon}</div>
                <div style={{ fontSize: '16px', fontWeight: 'bold', color: tokens.text, marginBottom: '4px' }}>{g.name}</div>
                <div style={{ fontSize: '12px', color: tokens.textSecondary }}>{g.desc}</div>
              </button>
            ))}
          </div>

          <div style={{ display: 'flex', gap: '12px' }}>
            <button onClick={() => setScreen('history')}
              style={{ flex: 1, background: tokens.bgSecondary, borderRadius: tokens.radius, padding: '14px', border: 'none', cursor: 'pointer', color: tokens.text, fontSize: '15px', fontWeight: 'bold' }}>
              History
            </button>
            <button onClick={() => setScreen('leaderboard')}
              style={{ flex: 1, background: tokens.bgSecondary, borderRadius: tokens.radius, padding: '14px', border: 'none', cursor: 'pointer', color: tokens.text, fontSize: '15px', fontWeight: 'bold' }}>
              Leaderboard
            </button>
          </div>
        </div>
      )}

      {!loading && !error && screen !== 'lobby' && renderGame()}
    </div>
  );
}
