import { useState, useEffect, useCallback } from 'react';
import { fetchMe, claimDailyBonus } from './api';
import { tokens, initTelegram } from './theme';
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

export function App() {
  const [balance, setBalance] = useState<number | null>(null);
  const [username, setUsername] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [screen, setScreen] = useState<Screen>('lobby');
  const [bonusMsg, setBonusMsg] = useState<string | null>(null);
  const [commitment, setCommitment] = useState<string | null>(null);

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
    <div className="app">
      <header className="app-header">
        <div className="app-header-left">
          {screen !== 'lobby' && (
            <button className="app-header-back" onClick={() => setScreen('lobby')} aria-label="Back">
              ←
            </button>
          )}
          <div className="app-header-title">Full House</div>
        </div>
        {balance !== null && (
          <div className="balance-pill">{balance.toLocaleString()}</div>
        )}
      </header>

      {bonusMsg && (
        <div style={{ background: tokens.bg1, padding: '12px', textAlign: 'center', color: tokens.accent, fontWeight: 'bold' }}>
          {bonusMsg}
        </div>
      )}

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
            <button onClick={handleDailyBonus}
              style={{ background: tokens.accent, border: 'none', color: '#062512', padding: '10px 16px', borderRadius: '20px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px' }}>
              Daily Bonus
            </button>
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
            <button onClick={() => setScreen('history')}
              style={{ flex: 1, background: tokens.bg1, borderRadius: tokens.radiusCard, padding: '14px', border: `1px solid ${tokens.line}`, cursor: 'pointer', color: tokens.text, fontSize: '15px', fontWeight: 'bold' }}>
              History
            </button>
            <button onClick={() => setScreen('leaderboard')}
              style={{ flex: 1, background: tokens.bg1, borderRadius: tokens.radiusCard, padding: '14px', border: `1px solid ${tokens.line}`, cursor: 'pointer', color: tokens.text, fontSize: '15px', fontWeight: 'bold' }}>
              Leaderboard
            </button>
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
