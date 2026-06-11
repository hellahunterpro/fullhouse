/**
 * Computes the absolute rotateX angle the coin must animate to so the flip
 * always lands face-up on `result`. Heads = multiples of 360°, tails = 180°
 * offset. The target is strictly greater than `currentDeg`, adding at least
 * `spins` full forward rotations so every flip visibly spins.
 */
export function flipTarget(currentDeg: number, result: 'heads' | 'tails', spins = 4): number {
  const base = Math.ceil(currentDeg / 360) * 360;
  return base + spins * 360 + (result === 'tails' ? 180 : 0);
}

export function faceAt(deg: number): 'heads' | 'tails' {
  return deg % 360 === 0 ? 'heads' : 'tails';
}
