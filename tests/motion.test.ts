import { describe, expect, it } from "vitest";
import { bootDelay, bootOffset, isMotionMode, particles } from "../src/shared/motion";
import { parseConfig } from "../src/shared/config";

describe("HUD motion", () => {
  it("boots the centre first, then outward", () => {
    expect(bootDelay(0.5, 0.5)).toBeLessThan(bootDelay(0, 0.5));
    expect(bootDelay(0, 0)).toBeLessThan(bootDelay(0, 1));
    expect(bootOffset(0, 0.5)).toEqual({ x: -24, y: 0 });
    expect(bootOffset(1, 1)).toEqual({ x: 24, y: 12 });
  });

  it("scatters the same particles every time, inside the canvas", () => {
    const a = particles(34);
    expect(a).toEqual(particles(34));
    expect(a).toHaveLength(34);
    for (const dot of a) {
      expect(dot.x).toBeGreaterThanOrEqual(0);
      expect(dot.x).toBeLessThanOrEqual(1192);
      expect(dot.y).toBeLessThanOrEqual(670);
      expect(dot.delay).toBeLessThanOrEqual(0);
    }
  });

  it("reads config.json motion", () => {
    expect(isMotionMode("calm")).toBe(true);
    expect(parseConfig({ motion: "off" }).config.motion).toBe("off");
    const bad = parseConfig({ motion: "wild" });
    expect(bad.config.motion).toBeUndefined();
    expect(bad.warnings.join(" ")).toContain("motion");
  });
});
