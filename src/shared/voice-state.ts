import type { VoicePhase } from "./types";

export interface VoiceHud {
  phase: VoicePhase;
  heard: string;
  reply: string;
}

export type VoiceEvent =
  | { type: "wake" }
  | { type: "working" }
  | { type: "heard"; text: string }
  | { type: "transcript"; text: string }
  | { type: "reply"; text: string }
  | { type: "played" }
  | { type: "stop" }
  | { type: "fail" };

export function initialVoiceHud(): VoiceHud {
  return { phase: "idle", heard: "", reply: "" };
}

/**
 * Idle listens for the wake word on device.
 * Listening is the utterance after the wake word. That is the only phase whose audio may be uploaded.
 * Thinking waits on Grok. Speaking waits until playback ends.
 */
export function reduceVoice(hud: VoiceHud, event: VoiceEvent): VoiceHud {
  if (event.type === "stop") return { phase: "idle", heard: "", reply: "" };
  if (event.type === "fail") return { phase: "idle", heard: hud.heard, reply: hud.reply };
  if (event.type === "heard") return { ...hud, heard: event.text };
  switch (hud.phase) {
    case "idle":
      if (event.type === "wake") return { phase: "listening", heard: "", reply: "" };
      return hud;
    case "listening":
      if (event.type === "working") return { phase: "thinking", heard: hud.heard, reply: "" };
      if (event.type === "transcript") {
        const text = event.text.trim();
        if (!text) return { phase: "idle", heard: "", reply: "" };
        return { phase: "thinking", heard: text, reply: "" };
      }
      return hud;
    case "thinking":
      if (event.type === "reply") {
        const text = event.text.trim();
        if (!text) return { phase: "idle", heard: hud.heard, reply: "" };
        return { phase: "speaking", heard: hud.heard, reply: text };
      }
      return hud;
    case "speaking":
      if (event.type === "played") return { phase: "idle", heard: hud.heard, reply: hud.reply };
      return hud;
    default:
      return hud;
  }
}

/** Cloud audio is the utterance captured after the wake word, and nothing before it. */
export function acceptsCloudAudio(phase: VoicePhase): boolean {
  return phase === "listening";
}

export interface WakeGate {
  armed: boolean;
  cooldownUntil: number;
}

export function createWakeGate(): WakeGate {
  return { armed: true, cooldownUntil: 0 };
}

/**
 * A hit is a rising edge through the threshold.
 * The cooldown keeps one "hey jarvis" from firing on every 80 ms frame.
 */
export function stepWakeGate(
  gate: WakeGate,
  score: number,
  now: number,
  threshold = 0.5,
  cooldownMs = 2000,
): { gate: WakeGate; hit: boolean } {
  if (now < gate.cooldownUntil) {
    return { gate: { armed: score < threshold, cooldownUntil: gate.cooldownUntil }, hit: false };
  }
  if (gate.armed && score >= threshold) {
    return { gate: { armed: false, cooldownUntil: now + cooldownMs }, hit: true };
  }
  return { gate: { armed: score < threshold, cooldownUntil: gate.cooldownUntil }, hit: false };
}

export function voiceControlLabel(input: { hasKey: boolean; enabled: boolean }): string {
  if (!input.hasKey) return "VOICE: NO KEY";
  return input.enabled ? "VOICE ON" : "VOICE OFF";
}
