import { describe, expect, it } from "vitest";
import { greetingLine, localDay, shouldGreet } from "../src/shared/greeting";
import { parseConfig } from "../src/shared/config";
import type { WeatherReport } from "../src/shared/types";

const weather: WeatherReport = {
  label: "Indianapolis, Indiana, US",
  units: "F",
  updated: "2026-11-27T10:15:00",
  temperature: 38.4,
  condition: "Cloudy",
  humidity: 93,
  feelsLike: 31,
  precipitation: 0,
  visibilityKm: 40,
  windSpeed: 9,
  windUnit: "mph",
  pressureHpa: 975,
  sunrise: "07:42",
  sunset: "17:21",
  uvIndex: 0.2,
  days: [{ date: "2026-11-27", high: 39.2, low: 30, condition: "Snow" }],
};

describe("startup greeting", () => {
  it("greets by time of day, with the date and the weather", () => {
    const morning = new Date(2026, 10, 27, 8, 5);
    expect(greetingLine({ now: morning, name: "Rio", weather })).toBe(
      "Good morning, Rio. It's Friday, November 27. It's 38 degrees and cloudy in Indianapolis, with a high of 39. All systems online.",
    );
    expect(greetingLine({ now: new Date(2026, 10, 27, 14, 0) })).toBe(
      "Good afternoon. It's Friday, November 27. All systems online.",
    );
    expect(greetingLine({ now: new Date(2026, 10, 27, 19, 0), name: "Rio" })).toMatch(/^Good evening, Rio\./);
    expect(greetingLine({ now: new Date(2026, 10, 28, 1, 0), name: "Rio" })).toMatch(/^Working late, Rio\./);
  });

  it("greets once a day by default, every start, or never", () => {
    const now = new Date(2026, 10, 27, 9, 0);
    expect(localDay(now)).toBe("2026-11-27");
    expect(shouldGreet("daily", undefined, now)).toBe(true);
    expect(shouldGreet("daily", "2026-11-27", now)).toBe(false);
    expect(shouldGreet("daily", "2026-11-26", now)).toBe(true);
    expect(shouldGreet("launch", "2026-11-27", now)).toBe(true);
    expect(shouldGreet("off", undefined, now)).toBe(false);
  });

  it("reads the greeting from config.json", () => {
    expect(parseConfig({ greeting: { mode: "launch", name: " Rio " } }).config.greeting).toEqual({ mode: "launch", name: "Rio" });
    expect(parseConfig({}).config.greeting).toBeUndefined();
    const bad = parseConfig({ greeting: { mode: "always" } });
    expect(bad.config.greeting?.mode).toBe("daily");
    expect(bad.warnings.join(" ")).toMatch(/greeting.mode/);
  });
});
