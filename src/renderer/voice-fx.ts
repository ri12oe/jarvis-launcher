import type { VoiceEffect } from "../shared/types";

/**
 * The "jarvis" effect: an original AI-in-the-suit sound on top of the Windows
 * voice, not a copy of any actor. A band-pass EQ gives it a clean comms tone,
 * a short comb delay adds a metallic sheen, and a faint echo adds room.
 *
 *   source ─ highpass ─ presence ─┬─ dry ────────────────┬─ compressor ─ speakers
 *                                 ├─ comb (11 ms, fb) ─ wet ┤
 *                                 └─ echo (70 ms) ─ room ──┘
 */
export const JARVIS_FX = {
  highpassHz: 160,
  presenceHz: 2800,
  presenceDb: 4,
  dry: 0.85,
  combSeconds: 0.011,
  combFeedback: 0.4,
  combWet: 0.3,
  echoSeconds: 0.07,
  echoWet: 0.12,
} as const;

let context: AudioContext | null = null;

function audioContext(): AudioContext | null {
  if (context) return context;
  const Ctor = (globalThis as { AudioContext?: typeof AudioContext })
    .AudioContext;
  if (!Ctor) return null;
  try {
    context = new Ctor();
  } catch {
    context = null;
  }
  return context;
}

/**
 * Plays the element through the effect. Call before play(). With "none", or
 * where Web Audio is missing, the element plays the plain voice.
 */
export function routeVoice(
  element: HTMLAudioElement,
  effect: VoiceEffect,
): void {
  if (effect === "none") return;
  const ctx = audioContext();
  if (!ctx) return;
  try {
    const fx = JARVIS_FX;
    const source = ctx.createMediaElementSource(element);
    const highpass = ctx.createBiquadFilter();
    highpass.type = "highpass";
    highpass.frequency.value = fx.highpassHz;
    const presence = ctx.createBiquadFilter();
    presence.type = "peaking";
    presence.frequency.value = fx.presenceHz;
    presence.Q.value = 1;
    presence.gain.value = fx.presenceDb;
    const out = ctx.createDynamicsCompressor();
    out.threshold.value = -18;
    out.ratio.value = 3;

    source.connect(highpass);
    highpass.connect(presence);

    const dry = ctx.createGain();
    dry.gain.value = fx.dry;
    presence.connect(dry);
    dry.connect(out);

    const comb = ctx.createDelay(0.1);
    comb.delayTime.value = fx.combSeconds;
    const feedback = ctx.createGain();
    feedback.gain.value = fx.combFeedback;
    const wet = ctx.createGain();
    wet.gain.value = fx.combWet;
    presence.connect(comb);
    comb.connect(feedback);
    feedback.connect(comb);
    comb.connect(wet);
    wet.connect(out);

    const echo = ctx.createDelay(0.5);
    echo.delayTime.value = fx.echoSeconds;
    const room = ctx.createGain();
    room.gain.value = fx.echoWet;
    presence.connect(echo);
    echo.connect(room);
    room.connect(out);

    out.connect(ctx.destination);
    if (ctx.state === "suspended") void ctx.resume().catch(() => undefined);
  } catch {
    // The element still plays the plain voice.
  }
}
