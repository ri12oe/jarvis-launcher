import fs from "node:fs";
import { describe, expect, it } from "vitest";

describe("reduced motion", () => {
  it("turns off the reactor spin and voice pulses", () => {
    const css = fs.readFileSync("src/renderer/mario.css", "utf8");
    const mediaAt = css.indexOf("@media (prefers-reduced-motion: reduce)");
    expect(mediaAt).toBeGreaterThan(css.indexOf(".reactor-art .dash-ring {"));
    const media = css.slice(mediaAt);
    expect(media).toContain(".reactor-art .dash-ring");
    expect(media).toContain(".reactor-art.phase-listening .tick-ring line");
    expect(media).toContain(".reactor-art.phase-speaking .blue-ring");
    expect(media).toMatch(/animation:\s*none/);
  });
});
