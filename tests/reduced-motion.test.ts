import fs from "node:fs";
import { describe, expect, it } from "vitest";

describe("reduced motion", () => {
  it("stops the listening pulse with a selector that wins over the base rule", () => {
    const css = fs.readFileSync("src/renderer/styles.css", "utf8");
    const mediaAt = css.indexOf("@media (prefers-reduced-motion: reduce)");
    expect(mediaAt).toBeGreaterThan(css.indexOf('.voice[data-voice="listening"]'));
    const media = css.slice(mediaAt);
    const rule = /\.voice\[data-voice="listening"\]\s*\{([^}]*)\}/.exec(media);
    expect(rule?.[1]).toMatch(/animation:\s*none/);
  });
});