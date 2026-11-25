import { describe, expect, it } from "vitest";
import {
  acceptsCloudAudio,
  createWakeGate,
  initialVoiceHud,
  reduceVoice,
  stepWakeGate,
  voiceControlLabel,
} from "../src/shared/voice-state";

describe("voice state machine", () => {
  it("walks idle, listening, thinking, and speaking", () => {
    let hud = initialVoiceHud();
    expect(acceptsCloudAudio(hud.phase)).toBe(false);
    hud = reduceVoice(hud, { type: "wake" });
    expect(hud).toEqual({ phase: "listening", heard: "", reply: "" });
    expect(acceptsCloudAudio(hud.phase)).toBe(true);
    hud = reduceVoice(hud, { type: "working" });
    expect(hud.phase).toBe("thinking");
    expect(acceptsCloudAudio(hud.phase)).toBe(false);
    hud = reduceVoice(hud, { type: "heard", text: "open edge" });
    hud = reduceVoice(hud, { type: "reply", text: "Opening Microsoft Edge." });
    expect(hud).toEqual({ phase: "speaking", heard: "open edge", reply: "Opening Microsoft Edge." });
    hud = reduceVoice(hud, { type: "played" });
    expect(hud).toEqual({ phase: "idle", heard: "open edge", reply: "Opening Microsoft Edge." });
  });

  it("ignores a wake word unless it is idle, and stop clears the line", () => {
    const listening = reduceVoice(initialVoiceHud(), { type: "wake" });
    expect(reduceVoice(listening, { type: "wake" })).toEqual(listening);
    expect(reduceVoice(listening, { type: "transcript", text: "  " })).toEqual(initialVoiceHud());
    const speaking = reduceVoice(
      reduceVoice(reduceVoice(initialVoiceHud(), { type: "wake" }), { type: "transcript", text: "hello" }),
      { type: "reply", text: "Yes." },
    );
    expect(reduceVoice(speaking, { type: "wake" })).toEqual(speaking);
    expect(reduceVoice(speaking, { type: "stop" })).toEqual(initialVoiceHud());
    expect(reduceVoice(speaking, { type: "fail" })).toEqual({ phase: "idle", heard: "hello", reply: "Yes." });
    expect(reduceVoice(listening, { type: "reply", text: "no" })).toEqual(listening);
  });

  it("fires the wake gate on a rising edge and then waits", () => {
    let gate = createWakeGate();
    const quiet = stepWakeGate(gate, 0.2, 1000);
    expect(quiet.hit).toBe(false);
    gate = quiet.gate;
    const hit = stepWakeGate(gate, 0.8, 1100);
    expect(hit.hit).toBe(true);
    const held = stepWakeGate(hit.gate, 0.9, 1500);
    expect(held.hit).toBe(false);
    const again = stepWakeGate({ armed: true, cooldownUntil: 2000 }, 0.9, 4000);
    expect(again.hit).toBe(true);
  });

  it("labels the footer toggle", () => {
    expect(voiceControlLabel({ hasKey: false, enabled: true })).toBe("VOICE: NO KEY");
    expect(voiceControlLabel({ hasKey: true, enabled: true })).toBe("VOICE ON");
    expect(voiceControlLabel({ hasKey: true, enabled: false })).toBe("VOICE OFF");
  });
});
