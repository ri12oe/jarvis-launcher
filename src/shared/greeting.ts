import type { WeatherReport } from "./types";

/**
 * The startup greeting Jarvis speaks: time of day, the date, and the weather
 * when it is known. "daily" greets on the first start of each day, "launch"
 * on every start, and "off" never.
 */
export type GreetingMode = "daily" | "launch" | "off";

export interface GreetingConfig {
  mode: GreetingMode;
  /** How Jarvis addresses you, for example "Rio". Empty leaves the name out. */
  name: string;
}

export const DEFAULT_GREETING: GreetingConfig = { mode: "daily", name: "" };

/** Local date as YYYY-MM-DD. */
export function localDay(now: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function shouldGreet(mode: GreetingMode, lastDay: string | undefined, now: Date): boolean {
  if (mode === "off") return false;
  if (mode === "launch") return true;
  return lastDay !== localDay(now);
}

function partOfDay(hour: number): string {
  if (hour >= 5 && hour < 12) return "Good morning";
  if (hour >= 12 && hour < 17) return "Good afternoon";
  if (hour >= 17 && hour < 22) return "Good evening";
  return "Working late";
}

/** "Cloudy" -> "cloudy", "Light rain showers" -> "light rain showers". */
function spokenCondition(condition: string): string {
  const text = condition.trim().replace(/\s+/g, " ");
  return text ? text.charAt(0).toLowerCase() + text.slice(1) : "";
}

export function greetingLine(input: { now: Date; name?: string; weather?: WeatherReport | null }): string {
  const { now, weather } = input;
  const name = input.name?.trim().replace(/[^\p{L}\p{N} .'-]/gu, "").slice(0, 40);
  const opening = `${partOfDay(now.getHours())}${name ? `, ${name}` : ""}.`;
  const date = now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
  const parts = [opening, `It's ${date}.`];
  if (weather && Number.isFinite(weather.temperature)) {
    const place = weather.label.split(",")[0]?.trim();
    const condition = spokenCondition(weather.condition);
    let line = `It's ${Math.round(weather.temperature)} degrees${condition ? ` and ${condition}` : ""}${place ? ` in ${place}` : ""}`;
    const today = weather.days.find((day) => day.date === localDay(now));
    if (today && Number.isFinite(today.high)) line += `, with a high of ${Math.round(today.high)}`;
    parts.push(`${line}.`);
  }
  parts.push("All systems online.");
  return parts.join(" ");
}
