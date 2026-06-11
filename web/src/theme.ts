export const tokens = {
  bg0: 'var(--bg-0)',
  bg1: 'var(--bg-1)',
  bg2: 'var(--bg-2)',
  line: 'var(--line)',
  text: 'var(--text)',
  textDim: 'var(--text-dim)',
  accent: 'var(--accent)',
  accentPartner: 'var(--accent-partner)',
  accentGlow: 'var(--accent-glow)',
  gold: 'var(--gold)',
  danger: 'var(--danger)',
  radiusCard: 'var(--radius-card)',
  radiusControl: 'var(--radius-control)',
  elevation: 'var(--elevation)',
} as const;

export function initTelegram(): void {
  const tg = window.Telegram?.WebApp;
  if (tg) {
    tg.ready();
    tg.expand();
  }
}
