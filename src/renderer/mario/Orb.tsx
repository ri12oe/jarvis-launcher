import { useEffect, useRef } from "react";
import type { VoicePhase } from "../../shared/types";

/**
 * The plasma orb in the centre of the reactor, drawn on a canvas: a white-hot
 * sphere with a veined texture, wispy filaments around its edge, and a soft
 * blue halo. It idles dim and slow. When the wake word is heard it flares up,
 * swirls while thinking, and pulses while Jarvis speaks.
 */

/** Design pixels the canvas covers, centred on the reactor. */
export const ORB_BOX = 200;
/** Radius of the sphere itself in design pixels. */
export const ORB_RADIUS = 50;

/** How bright the orb burns in each phase, 0 to 1. */
export const ORB_LEVEL: Record<VoicePhase, number> = {
  idle: 0.32,
  listening: 1,
  thinking: 0.85,
  speaking: 1,
};

interface Filament {
  angle: number;
  start: number;
  length: number;
  curl: number;
  width: number;
  phase: number;
  speed: number;
}

interface Vein {
  points: [number, number][];
  width: number;
  dark: boolean;
}

/** A small seeded random, so the orb looks the same on every start. */
function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function makeFilaments(random: () => number): Filament[] {
  const list: Filament[] = [];
  for (let index = 0; index < 420; index++) {
    const long = random();
    list.push({
      angle: random() * Math.PI * 2,
      start: ORB_RADIUS * (0.8 + random() * 0.2),
      length: 3 + long * long * 28,
      curl: (random() - 0.5) * 2.2,
      width: 0.18 + random() * 0.45,
      phase: random() * Math.PI * 2,
      speed: 0.4 + random() * 1.4,
    });
  }
  return list;
}

function makeVeins(random: () => number): Vein[] {
  const list: Vein[] = [];
  for (let index = 0; index < 110; index++) {
    const radius = Math.sqrt(random()) * ORB_RADIUS * 0.95;
    const angle = random() * Math.PI * 2;
    let x = Math.cos(angle) * radius;
    let y = Math.sin(angle) * radius;
    let heading = random() * Math.PI * 2;
    const points: [number, number][] = [[x, y]];
    const steps = 3 + Math.floor(random() * 5);
    for (let step = 0; step < steps; step++) {
      heading += (random() - 0.5) * 1.6;
      const length = 2 + random() * 6;
      x += Math.cos(heading) * length;
      y += Math.sin(heading) * length;
      points.push([x, y]);
    }
    list.push({ points, width: 0.5 + random() * 1.3, dark: random() < 0.55 });
  }
  return list;
}

/** Wisps are drawn here, then laid down twice: blurred for the glow, sharp for the detail. */
let wispLayer: HTMLCanvasElement | null = null;

function strokeFilaments(
  ctx: CanvasRenderingContext2D,
  filaments: readonly Filament[],
  time: number,
  glow: number,
): void {
  ctx.lineCap = "round";
  for (const f of filaments) {
    const wobble = Math.sin(time * f.speed + f.phase);
    const sway = Math.sin(time * f.speed * 0.7 + f.phase * 1.3);
    const reach =
      f.length *
      (0.45 + 0.6 * glow + 0.25 * Math.sin(time * f.speed * 1.7 + f.phase));
    const a = f.angle + wobble * 0.04 + time * 0.025;
    // Two bends make the smoky, curling look of the reference.
    const r1 = f.start + reach * 0.35;
    const r2 = f.start + reach * 0.7;
    const r3 = f.start + reach;
    const a1 = a + f.curl * 0.06 + sway * 0.05;
    const a2 = a - f.curl * 0.08 + wobble * 0.09;
    const a3 = a + f.curl * 0.14 + sway * 0.12;
    const alpha =
      (0.14 + 0.5 * glow) *
      (0.6 + 0.4 * Math.sin(time * f.speed * 2.1 + f.phase * 2));
    ctx.strokeStyle = `rgba(225, 244, 255, ${Math.max(0, Math.min(1, alpha)).toFixed(3)})`;
    ctx.lineWidth = f.width;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * f.start, Math.sin(a) * f.start);
    ctx.bezierCurveTo(
      Math.cos(a1) * r1,
      Math.sin(a1) * r1,
      Math.cos(a2) * r2,
      Math.sin(a2) * r2,
      Math.cos(a3) * r3,
      Math.sin(a3) * r3,
    );
    ctx.stroke();
  }
}

function drawOrb(
  ctx: CanvasRenderingContext2D,
  filaments: readonly Filament[],
  veins: readonly Vein[],
  time: number,
  level: number,
  speaking: boolean,
): void {
  const c = ORB_BOX / 2;
  const r = ORB_RADIUS;
  // A living flicker, plus a voice-like pulse while speaking.
  const pulse = speaking
    ? 0.14 * Math.max(0, Math.sin(time * 9)) * Math.abs(Math.sin(time * 2.3))
    : 0;
  const glow = Math.min(
    1.15,
    level * (0.95 + 0.05 * Math.sin(time * 11)) + pulse,
  );
  const lit = Math.min(1, glow);

  ctx.clearRect(0, 0, ORB_BOX, ORB_BOX);
  ctx.save();
  ctx.translate(c, c);

  // Halo.
  const halo = ctx.createRadialGradient(
    0,
    0,
    r * 0.8,
    0,
    0,
    r * (1.3 + 0.7 * glow),
  );
  halo.addColorStop(0, `rgba(200, 236, 255, ${0.15 + 0.6 * lit})`);
  halo.addColorStop(0.35, `rgba(120, 195, 245, ${0.08 + 0.3 * lit})`);
  halo.addColorStop(1, "rgba(40, 120, 200, 0)");
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(0, 0, c, 0, Math.PI * 2);
  ctx.fill();

  // Wisps around the edge: one blurred pass for the glow, one sharp pass for detail.
  const scale = ctx.getTransform().a;
  if (!wispLayer) wispLayer = document.createElement("canvas");
  const size = Math.round(ORB_BOX * scale);
  if (wispLayer.width !== size) {
    wispLayer.width = size;
    wispLayer.height = size;
  }
  const wctx = wispLayer.getContext("2d");
  ctx.globalCompositeOperation = "lighter";
  if (wctx) {
    wctx.setTransform(1, 0, 0, 1, 0, 0);
    wctx.clearRect(0, 0, size, size);
    wctx.setTransform(scale, 0, 0, scale, c * scale, c * scale);
    strokeFilaments(wctx, filaments, time, glow);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.filter = `blur(${(2 + 3 * lit) * scale * 0.5}px)`;
    ctx.globalAlpha = 0.7 + 0.3 * lit;
    ctx.drawImage(wispLayer, 0, 0);
    ctx.drawImage(wispLayer, 0, 0);
    ctx.filter = "none";
    ctx.globalAlpha = 1;
    ctx.drawImage(wispLayer, 0, 0);
    ctx.restore();
  }
  ctx.globalCompositeOperation = "source-over";

  // The sphere: white-hot when lit, a cooler pearl at idle.
  const body = ctx.createRadialGradient(-r * 0.1, -r * 0.08, 0, 0, 0, r);
  const bright = 0.5 + 0.5 * lit;
  body.addColorStop(0, `rgba(255, 255, 255, ${bright})`);
  body.addColorStop(0.7, `rgba(250, 253, 255, ${bright})`);
  body.addColorStop(
    0.92,
    `rgba(${Math.round(200 + 45 * lit)}, ${Math.round(228 + 22 * lit)}, 255, ${0.95 * bright})`,
  );
  body.addColorStop(1, `rgba(170, 215, 245, ${0.8 * bright})`);
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();

  // Veins inside, softly blurred and turning slowly.
  ctx.save();
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.clip();
  ctx.rotate(time * (level > 0.5 ? 0.1 : 0.035));
  ctx.filter = "blur(0.4px)";
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const vein of veins) {
    ctx.lineWidth = vein.width;
    ctx.strokeStyle = vein.dark
      ? `rgba(110, 135, 160, ${(0.16 + 0.22 * (1 - lit)).toFixed(3)})`
      : `rgba(255, 255, 255, ${(0.25 + 0.4 * lit).toFixed(3)})`;
    ctx.beginPath();
    vein.points.forEach(([x, y], index) =>
      index === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y),
    );
    ctx.stroke();
  }
  ctx.filter = "none";
  ctx.restore();

  // White-hot centre that washes out the veins when lit.
  const core = ctx.createRadialGradient(
    -r * 0.05,
    -r * 0.05,
    0,
    0,
    0,
    r * 0.85,
  );
  core.addColorStop(0, `rgba(255, 255, 255, ${0.25 + 0.75 * lit})`);
  core.addColorStop(0.55, `rgba(255, 255, 255, ${0.5 * lit})`);
  core.addColorStop(1, "rgba(255, 255, 255, 0)");
  ctx.fillStyle = core;
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.85, 0, Math.PI * 2);
  ctx.fill();

  // Bright, glowing rim.
  ctx.shadowColor = `rgba(170, 228, 255, ${0.5 + 0.5 * lit})`;
  ctx.shadowBlur = (4 + 14 * lit) * scale * 0.5;
  ctx.strokeStyle = `rgba(240, 250, 255, ${0.3 + 0.6 * lit})`;
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.arc(0, 0, r - 0.6, 0, Math.PI * 2);
  ctx.stroke();

  ctx.restore();
}

function reducedMotion(): boolean {
  return (
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

export function Orb({
  phase,
  x,
  y,
}: {
  phase: VoicePhase;
  x: number;
  y: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const redrawRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    // Draw sharp at the scaled-up canvas size on high-DPI screens.
    const scale = Math.min(4, Math.max(2, (window.devicePixelRatio || 1) * 2));
    canvas.width = ORB_BOX * scale;
    canvas.height = ORB_BOX * scale;
    ctx.setTransform(scale, 0, 0, scale, 0, 0);

    const random = seeded(4271);
    const filaments = makeFilaments(random);
    const veins = makeVeins(random);
    let level = ORB_LEVEL[phaseRef.current];

    if (reducedMotion()) {
      const still = () =>
        drawOrb(ctx, filaments, veins, 0, ORB_LEVEL[phaseRef.current], false);
      redrawRef.current = still;
      still();
      return () => {
        redrawRef.current = null;
      };
    }

    let frame = 0;
    let last = performance.now();
    let clock = 0;
    const tick = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const target = ORB_LEVEL[phaseRef.current];
      // Flare up quickly on the wake word, settle back slowly.
      const rate = target > level ? 7 : 1.6;
      level += (target - level) * Math.min(1, dt * rate);
      // Swirl faster while thinking, and calmer at idle.
      clock += dt * (phaseRef.current === "thinking" ? 2.2 : 0.8 + 0.7 * level);
      drawOrb(
        ctx,
        filaments,
        veins,
        clock,
        level,
        phaseRef.current === "speaking",
      );
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    redrawRef.current?.();
  }, [phase]);

  return (
    <foreignObject
      className={`plasma-orb phase-${phase}`}
      x={x - ORB_BOX / 2}
      y={y - ORB_BOX / 2}
      width={ORB_BOX}
      height={ORB_BOX}
    >
      <canvas
        ref={canvasRef}
        className="plasma-orb-canvas"
        width={ORB_BOX}
        height={ORB_BOX}
      />
    </foreignObject>
  );
}
