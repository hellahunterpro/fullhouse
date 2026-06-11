/** Compact relative time: "just now", "5m ago", "3h ago", "2d ago", else a short date. */
export function relativeTime(iso: string, now: Date = new Date()): string {
  const then = new Date(iso.includes('T') ? iso : iso.replace(' ', 'T') + 'Z');
  const diffMs = now.getTime() - then.getTime();
  if (Number.isNaN(diffMs)) return '';
  const sec = Math.floor(diffMs / 1000);
  if (sec < 60) return 'just now';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  return then.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
