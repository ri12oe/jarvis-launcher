import { describe, expect, it } from "vitest";
import { allowMediaPermission } from "../src/shared/media-permission";
import { createEndpoint, encodeWavPcm16, rmsInt16, stepEndpoint } from "../src/shared/voice-audio";

describe("media permission", () => {
  it("grants media only for our own origin", () => {
    const dev = "http://127.0.0.1:5173";
    expect(
      allowMediaPermission({ permission: "media", requestingUrl: `${dev}/`, devServerUrl: dev, mainFrame: true }),
    ).toBe(true);
    expect(
      allowMediaPermission({
        permission: "media",
        requestingUrl: "https://example.com",
        devServerUrl: dev,
        mainFrame: true,
      }),
    ).toBe(false);
    expect(
      allowMediaPermission({ permission: "geolocation", requestingUrl: `${dev}/`, devServerUrl: dev }),
    ).toBe(false);
    expect(allowMediaPermission({ permission: "media", requestingUrl: `${dev}/index.html`, devServerUrl: dev, mainFrame: false })).toBe(
      false,
    );
    expect(allowMediaPermission({ permission: "media", requestingUrl: "file:///app/index.html" })).toBe(true);
    expect(allowMediaPermission({ permission: "media", requestingUrl: "null" })).toBe(true);
    expect(allowMediaPermission({ permission: "display-capture", requestingUrl: "file:///app/index.html" })).toBe(false);
  });
});

describe("utterance audio", () => {
  it("ends a silent listen without calling it speech, and keeps a spoken phrase", () => {
    let state = createEndpoint();
    let result = { state, done: false, speech: false };
    const silence = new Int16Array(1600);
    for (let i = 0; i < 50 && !result.done; i++) result = stepEndpoint(result.state, silence);
    expect(result.done).toBe(true);
    expect(result.speech).toBe(false);

    state = createEndpoint();
    const loud = new Int16Array(1600);
    loud.fill(4000);
    result = stepEndpoint(state, loud);
    result = stepEndpoint(result.state, loud);
    result = stepEndpoint(result.state, loud);
    expect(result.speech).toBe(true);
    expect(result.done).toBe(false);
    const quiet = new Int16Array(27200);
    result = stepEndpoint(result.state, quiet);
    expect(result.done).toBe(true);
    expect(result.speech).toBe(true);
    expect(rmsInt16(loud)).toBeGreaterThan(rmsInt16(silence));
  });

  it("writes a mono pcm wav header", () => {
    const wav = encodeWavPcm16(Int16Array.from([1, -2, 3]), 16000);
    expect(String.fromCharCode(...wav.slice(0, 4))).toBe("RIFF");
    expect(String.fromCharCode(...wav.slice(8, 12))).toBe("WAVE");
    expect(wav.length).toBe(44 + 6);
  });
});
