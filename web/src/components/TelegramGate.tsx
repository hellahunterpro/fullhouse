import './TelegramGate.css';

export function TelegramGate() {
  return (
    <div className="tg-gate">
      <svg className="tg-gate-logo" viewBox="0 0 80 80" aria-hidden="true">
        <circle cx="40" cy="40" r="34" fill="none" stroke="var(--accent)" strokeWidth="4" />
        <circle cx="40" cy="40" r="20" fill="none" stroke="var(--accent)" strokeWidth="2.5" />
        <path
          d="M40 6v12M40 62v12M6 40h12M62 40h12M16 16l8.5 8.5M55.5 55.5l8.5 8.5M64 16l-8.5 8.5M24.5 55.5L16 64"
          stroke="var(--accent)"
          strokeWidth="3"
          strokeLinecap="round"
        />
        <circle cx="40" cy="40" r="7" fill="var(--gold)" />
      </svg>
      <h1 className="tg-gate-title">Full House</h1>
      <p className="tg-gate-text">
        This casino runs as a Telegram Mini App. Open it from your bot&apos;s menu button inside
        Telegram to play.
      </p>
      <p className="tg-gate-sub">Play-money chips only — nothing to buy, nothing to cash out.</p>
    </div>
  );
}
