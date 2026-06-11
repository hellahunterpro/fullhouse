export function hapticImpact(style: 'light' | 'medium' = 'light'): void {
  window.Telegram?.WebApp?.HapticFeedback?.impactOccurred?.(style);
}

export function hapticResult(success: boolean): void {
  window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred?.(success ? 'success' : 'error');
}
