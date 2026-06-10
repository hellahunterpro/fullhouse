interface TelegramWebApp {
  initData: string;
  themeParams: {
    bg_color?: string;
    text_color?: string;
    hint_color?: string;
    link_color?: string;
    button_color?: string;
    button_text_color?: string;
    secondary_bg_color?: string;
  };
  ready(): void;
  expand(): void;
}

interface Window {
  Telegram?: {
    WebApp?: TelegramWebApp;
  };
}
