// Scalar math helpers. No allocation, no dependencies.
export const TAU = Math.PI * 2;
export const DEG = Math.PI / 180;

export function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
export function lerp(a, b, t) { return a + (b - a) * t; }
/** Frame-rate independent approach: returns a moved toward b. */
export function damp(a, b, rate, dt) { return lerp(a, b, 1 - Math.exp(-rate * dt)); }
export function rand(lo, hi) { return lo + Math.random() * (hi - lo); }
export function randi(lo, hi) { return Math.floor(rand(lo, hi + 1)); }
export function pick(arr) { return arr[(Math.random() * arr.length) | 0]; }

/** Shortest-arc angle difference, result in [-PI, PI]. */
export function angleDiff(a, b) {
  let d = (a - b) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}
export function angleLerp(a, b, t) { return a + angleDiff(b, a) * t; }

/** 2D distance squared on the ground plane. */
export function dist2XZ(ax, az, bx, bz) {
  const dx = ax - bx, dz = az - bz;
  return dx * dx + dz * dz;
}
