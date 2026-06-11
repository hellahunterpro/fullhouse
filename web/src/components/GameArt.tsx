// Original hand-drawn SVG art for game cards. All shapes are drawn from
// scratch with simple primitives; no external assets.

interface ArtProps {
  size?: number;
}

export function DiceArt({ size = 56 }: ArtProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 56 56" aria-hidden="true">
      <g transform="rotate(-8 22 26)">
        <rect x="8" y="14" width="26" height="26" rx="6" fill="var(--bg-1)" stroke="var(--accent)" strokeWidth="2" />
        <circle cx="16" cy="22" r="2.4" fill="var(--accent)" />
        <circle cx="26" cy="32" r="2.4" fill="var(--accent)" />
        <circle cx="26" cy="22" r="2.4" fill="var(--accent)" />
        <circle cx="16" cy="32" r="2.4" fill="var(--accent)" />
      </g>
      <g transform="rotate(12 38 32)">
        <rect x="28" y="22" width="20" height="20" rx="5" fill="var(--bg-1)" stroke="var(--gold)" strokeWidth="2" />
        <circle cx="38" cy="32" r="2.2" fill="var(--gold)" />
      </g>
    </svg>
  );
}

export function CoinArt({ size = 56 }: ArtProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 56 56" aria-hidden="true">
      <ellipse cx="28" cy="30" rx="17" ry="16" fill="var(--bg-1)" stroke="var(--gold)" strokeWidth="2" />
      <ellipse cx="28" cy="27" rx="17" ry="16" fill="var(--bg-1)" stroke="var(--gold)" strokeWidth="2.4" />
      <ellipse cx="28" cy="27" rx="11.5" ry="10.8" fill="none" stroke="var(--gold)" strokeWidth="1.4" opacity="0.7" />
      <path d="M28 20.5v13M24.5 23.5c0-1.6 1.5-2.6 3.5-2.6s3.5 1 3.5 2.4c0 1.6-1.4 2.2-3.5 2.7-2.1.5-3.5 1.1-3.5 2.7 0 1.4 1.5 2.4 3.5 2.4s3.5-1 3.5-2.6"
        fill="none" stroke="var(--gold)" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export function RouletteArt({ size = 56 }: ArtProps) {
  // Wheel slice: alternating red/black pockets around a green zero pocket.
  const pockets = 8;
  const cx = 28;
  const cy = 30;
  const rOuter = 19;
  const rInner = 8;
  const wedges = [];
  for (let i = 0; i < pockets; i++) {
    const a0 = (i / pockets) * Math.PI * 2 - Math.PI / 2;
    const a1 = ((i + 1) / pockets) * Math.PI * 2 - Math.PI / 2;
    const color = i === 0 ? 'var(--accent)' : i % 2 === 1 ? 'var(--danger)' : 'var(--bg-1)';
    const x0 = cx + rOuter * Math.cos(a0);
    const y0 = cy + rOuter * Math.sin(a0);
    const x1 = cx + rOuter * Math.cos(a1);
    const y1 = cy + rOuter * Math.sin(a1);
    const xi1 = cx + rInner * Math.cos(a1);
    const yi1 = cy + rInner * Math.sin(a1);
    const xi0 = cx + rInner * Math.cos(a0);
    const yi0 = cy + rInner * Math.sin(a0);
    wedges.push(
      <path
        key={i}
        d={`M${x0.toFixed(2)} ${y0.toFixed(2)} A${rOuter} ${rOuter} 0 0 1 ${x1.toFixed(2)} ${y1.toFixed(2)} L${xi1.toFixed(2)} ${yi1.toFixed(2)} A${rInner} ${rInner} 0 0 0 ${xi0.toFixed(2)} ${yi0.toFixed(2)} Z`}
        fill={color}
        stroke="var(--bg-2)"
        strokeWidth="1"
      />,
    );
  }
  return (
    <svg width={size} height={size} viewBox="0 0 56 56" aria-hidden="true">
      <circle cx={cx} cy={cy} r={rOuter + 2.5} fill="none" stroke="var(--gold)" strokeWidth="2" />
      {wedges}
      <circle cx={cx} cy={cy} r={rInner - 2} fill="var(--bg-1)" stroke="var(--gold)" strokeWidth="1.5" />
      <path d={`M${cx} ${cy - rOuter - 5} l-3 -4h6z`} fill="var(--gold)" />
    </svg>
  );
}

export function MinesArt({ size = 56 }: ArtProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 56 56" aria-hidden="true">
      <circle cx="21" cy="33" r="10" fill="var(--bg-1)" stroke="var(--danger)" strokeWidth="2" />
      <path d="M21 23v-5M21 43v5M11 33H6M36 33h-5M14 26l-3.5-3.5M28 40l3.5 3.5M28 26l3.5-3.5M14 40l-3.5 3.5"
        stroke="var(--danger)" strokeWidth="2" strokeLinecap="round" />
      <circle cx="17.5" cy="29.5" r="2.5" fill="var(--danger)" opacity="0.55" />
      <path d="M40 14l5.5 5-5.5 9-5.5-9z" fill="var(--bg-1)" stroke="var(--accent)" strokeWidth="2" strokeLinejoin="round" />
      <path d="M34.5 19h11M40 14l-2 5 2 9 2-9z" fill="none" stroke="var(--accent)" strokeWidth="1.2" strokeLinejoin="round" opacity="0.8" />
    </svg>
  );
}

export function FlameArt({ size = 20 }: ArtProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" aria-hidden="true">
      <path
        d="M10 1.5c.6 3-1 4.4-2.6 6C5.7 9.2 4 11 4 13.4 4 16.7 6.7 19 10 19s6-2.3 6-5.6c0-1.8-.8-3.3-1.9-4.8-.3 1-.8 1.8-1.7 2.3.3-3.4-.9-7-2.4-9.4z"
        fill="var(--gold)"
      />
      <path
        d="M10 19c-1.9 0-3.4-1.4-3.4-3.2 0-1.5 1-2.4 2-3.4.7-.7 1.3-1.4 1.5-2.3 1.1 1.2 3.3 3.2 3.3 5.7 0 1.8-1.5 3.2-3.4 3.2z"
        fill="var(--danger)"
        opacity="0.85"
      />
    </svg>
  );
}
