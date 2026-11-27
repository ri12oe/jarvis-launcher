/**
 * HUD motion, in the style of the MARIO OS live wallpaper: turning rings, a
 * radar sweep, light pulses running around the reactor, drifting particles,
 * and a boot-up sequence. config.json "motion" picks how much:
 *   "full" (default) everything, "calm" no particles or scan line and slower
 *   rings, "off" nothing moves except the orb and live readings.
 * Windows "Show animations" off (prefers-reduced-motion) acts like "off".
 */
export type MotionMode = "full" | "calm" | "off";

export const MOTION_MODES: readonly MotionMode[] = ["full", "calm", "off"];

export function isMotionMode(value: unknown): value is MotionMode {
  return typeof value === "string" && (MOTION_MODES as readonly string[]).includes(value);
}

/**
 * Boot-up delay for a panel group anchored at (fx, fy): the reactor first,
 * then outward to the edges, top before bottom. Milliseconds.
 */
export function bootDelay(fx: number, fy: number): number {
  const fromCenter = Math.abs(fx - 0.5) * 2;
  return Math.round(350 + fromCenter * 450 + fy * 180);
}

/** How far a group slides in from: outward, toward its own edge. Pixels. */
export function bootOffset(fx: number, fy: number): { x: number; y: number } {
  return { x: Math.round((fx - 0.5) * 48), y: Math.round((fy - 0.5) * 24) };
}

export interface Particle {
  x: number;
  y: number;
  size: number;
  drift: number;
  duration: number;
  delay: number;
}

/** Same particles on every start, spread over the 1192 by 670 canvas. */
export function particles(count: number, seed = 7): Particle[] {
  let state = seed >>> 0 || 1;
  const random = () => {
    // xorshift32: small, steady, and good enough to scatter dots.
    state ^= state << 13;
    state >>>= 0;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 0x100000000;
  };
  return Array.from({ length: count }, () => ({
    x: Math.round(random() * 1192),
    y: Math.round(80 + random() * 560),
    size: Math.round((1 + random() * 1.6) * 10) / 10,
    drift: Math.round(40 + random() * 70),
    duration: Math.round((9 + random() * 9) * 10) / 10,
    delay: -Math.round(random() * 18 * 10) / 10,
  }));
}
