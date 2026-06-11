// Standard European wheel order, clockwise starting at the zero pocket.
export const WHEEL_ORDER = [
  0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20,
  14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26,
] as const;

export const POCKET_COUNT = 37;
export const STEP = 360 / POCKET_COUNT;

export const RED_NUMBERS = new Set([
  1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36,
]);

export function pocketColor(n: number): 'green' | 'red' | 'black' {
  return n === 0 ? 'green' : RED_NUMBERS.has(n) ? 'red' : 'black';
}

/** Angle of the pocket's center, clockwise from the top pointer, at rotation 0. */
export function pocketAngle(n: number): number {
  const idx = WHEEL_ORDER.indexOf(n as (typeof WHEEL_ORDER)[number]);
  return idx * STEP;
}

/**
 * Absolute wheel rotation that puts the winning pocket under the top pointer,
 * always spinning forward at least `turns` full rotations from `currentDeg`.
 */
export function wheelTarget(currentDeg: number, spin: number, turns = 5): number {
  const offset = (360 - pocketAngle(spin)) % 360;
  const base = Math.ceil(currentDeg / 360) * 360;
  return base + turns * 360 + offset;
}

/** Which pocket sits under the top pointer at the given wheel rotation. */
export function landedPocket(rotationDeg: number): number {
  const norm = ((rotationDeg % 360) + 360) % 360;
  const angle = (360 - norm) % 360;
  const idx = Math.round(angle / STEP) % POCKET_COUNT;
  return WHEEL_ORDER[idx];
}
