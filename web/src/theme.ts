export const tokens = {
  bg: '#1a1a2e',
  bgSecondary: '#16213e',
  text: '#eaeaea',
  textSecondary: '#a0a0b0',
  accent: '#e94560',
  accentHover: '#ff6b81',
  success: '#4ecdc4',
  danger: '#e94560',
  border: '#2a2a4a',
  radius: '12px',
};

export function applyTelegramTheme(): void {
  const tg = window.Telegram?.WebApp;
  if (tg) {
    const t = tg.themeParams;
    if (t.bg_color) tokens.bg = t.bg_color;
    if (t.text_color) tokens.text = t.text_color;
    if (t.hint_color) tokens.textSecondary = t.hint_color;
    if (t.button_color) tokens.accent = t.button_color;
    if (t.secondary_bg_color) tokens.bgSecondary = t.secondary_bg_color;
    tg.ready();
    tg.expand();
  }
}
