import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("../src/renderer/styles.css", import.meta.url), "utf8");

function keyframe(name: string): string {
  const match = css.match(new RegExp(`@keyframes ${name} \\{[^}]*\\}`, "s"));
  return match?.[0] ?? "";
}

/**
 * A running keyframe that translates by a percentage keeps the percentage from
 * the size at animation start. After the reactor grows, that offset is no
 * longer half the box, so the ring leaves the core.
 */
export function spinDrift(keyframeText: string, startSize: number, nextSize: number): number {
  if (!/translate\(\s*-50%/.test(keyframeText)) return 0;
  return (nextSize - startSize) / 2;
}

describe("reactor spin", () => {
  it("rotates without a translate, so a resize keeps the ring on the core", () => {
    const spin = keyframe("spin");
    expect(spin).toMatch(/rotate:\s*360deg/);
    expect(spin).not.toMatch(/translate/);
    expect(keyframe("orbit-spin")).toBe("");
    expect(keyframe("tick-spin")).toBe("");
    expect(css).toMatch(/\.reactor\s*\{[^}]*display:\s*grid/s);
    expect(css).toMatch(/\.reactor\s*\{[^}]*place-items:\s*center/s);

    // The reported failure: 96px on the first paint, then 178–297px.
    expect(spinDrift(spin, 96, 178)).toBe(0);
    expect(spinDrift(spin, 96, 297)).toBe(0);
    expect(spinDrift("to { transform: translate(-50%, -50%) rotate(360deg); }", 96, 240)).toBe(72);
  });
});
