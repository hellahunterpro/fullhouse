import { useState, useEffect } from 'react';
import { fetchMe } from './api';
import { tokens, applyTelegramTheme } from './theme';
import { DiceGame } from './components/DiceGame';

export function App() {
  const [balance, setBalance] = useState<number | null>(null);
  const [username, setUsername] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    applyTelegramTheme();
    fetchMe()
      .then((data) => {
        setBalance(data.balance);
        setUsername(data.user.username || data.user.firstName || 'Player');
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  return (
    <div style={{
      minHeight: '100vh',
      background: tokens.bg,
      color: tokens.text,
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    }}>
      <header style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '16px',
        borderBottom: `1px solid ${tokens.border}`,
      }}>
        <div style={{ fontSize: '20px', fontWeight: 'bold' }}>Full House</div>
        {balance !== null && (
          <div style={{
            background: tokens.bgSecondary,
            padding: '8px 16px',
            borderRadius: '20px',
            fontSize: '16px',
            fontWeight: 'bold',
          }}>
            {balance.toLocaleString()} chips
          </div>
        )}
      </header>

      {loading && (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: tokens.textSecondary }}>
          Loading...
        </div>
      )}

      {error && (
        <div style={{ textAlign: 'center', padding: '60px 20px' }}>
          <div style={{ color: tokens.danger, marginBottom: '8px' }}>Failed to connect</div>
          <div style={{ color: tokens.textSecondary, fontSize: '14px' }}>{error}</div>
        </div>
      )}

      {!loading && !error && balance !== null && (
        <>
          <div style={{ padding: '16px 16px 0', color: tokens.textSecondary, fontSize: '14px' }}>
            Welcome, {username}
          </div>
          <DiceGame balance={balance} onBalanceUpdate={setBalance} />
        </>
      )}
    </div>
  );
}
