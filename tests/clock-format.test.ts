import { describe, expect, it } from "vitest";
import { formatClockParts, formatHudDate, formatMonthBanner } from "../src/renderer/hud/time";

describe("HUD clock", () => {
  const wednesday = new Date(2026, 10, 25, 8, 55);

  it("formats the date line and the day banner from the real date", () => {
    expect(formatHudDate(wednesday)).toBe("25-Nov., Wednesday");
    expect(formatMonthBanner(wednesday)).toEqual({ day: "25", month: "NOVEMBER", weekday: "WEDNESDAY" });
    expect(formatClockParts(wednesday)).toEqual({ hh: "08", mm: "55", ap: "AM" });
  });
});