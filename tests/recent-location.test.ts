import { describe, expect, it } from "vitest";
import { parseConfig } from "../src/shared/config";
import { pickRecent, recentLabel, recentName } from "../src/shared/recent";
import { checkSettings, mergeSettings, parseIpLocation, settingsFromConfig } from "../src/shared/settings";
import { cloneDefaultConfig } from "../src/shared/config";

describe("recent files", () => {
  it("keeps the newest existing targets, one each, up to the limit", () => {
    const picked = pickRecent(
      [
        { name: "Old.docx.lnk", mtimeMs: 1, target: "C:\\a\\Old.docx", exists: true },
        { name: "New.pdf.lnk", mtimeMs: 9, target: "C:\\a\\New.pdf", exists: true },
        { name: "Gone.txt.lnk", mtimeMs: 8, target: "C:\\a\\Gone.txt", exists: false },
        { name: "Copy of New.lnk", mtimeMs: 7, target: "c:\\A\\new.pdf", exists: true },
        { name: "Broken.lnk", mtimeMs: 6, target: "", exists: false },
        { name: "Mid.xlsx.lnk", mtimeMs: 5, target: "C:\\a\\Mid.xlsx", exists: true },
      ],
      2,
    );
    expect(picked).toEqual([
      { name: "New.pdf", target: "C:\\a\\New.pdf" },
      { name: "Mid.xlsx", target: "C:\\a\\Mid.xlsx" },
    ]);
    expect(recentName("Report.docx.LNK")).toBe("Report.docx");
    expect(recentLabel("Screenshot 2026-11-25 120000.png")).toBe("SCREENSHOT 2026-11-25 1\u2026");
    expect(recentLabel("notes.txt")).toBe("NOTES.TXT");
  });
});

describe("left list setting", () => {
  it("defaults to recent files and accepts the design text", () => {
    expect(parseConfig({}).config.leftList).toBe("recent");
    expect(parseConfig({ leftList: "design" }).config.leftList).toBe("design");
    const bad = parseConfig({ leftList: "music" });
    expect(bad.config.leftList).toBe("recent");
    expect(bad.warnings.join(" ")).toContain("leftList");
    const values = { ...settingsFromConfig(cloneDefaultConfig()), leftList: "design" as const };
    expect(checkSettings(values)).toBeNull();
    expect(mergeSettings({}, values).leftList).toBe("design");
    expect(checkSettings({ ...values, leftList: "nope" })).toBe("Left list choice is missing");
  });
});

describe("location from the IP address", () => {
  it("reads an ipapi.co reply and refuses an error reply", () => {
    expect(
      parseIpLocation({ city: "Indianapolis", region_code: "IN", country_code: "US", latitude: 39.7684, longitude: -86.158 }),
    ).toEqual({ label: "Indianapolis, IN, US", latitude: 39.77, longitude: -86.16 });
    expect(parseIpLocation({ error: true, reason: "RateLimited" })).toBeNull();
    expect(parseIpLocation({ city: "X" })).toBeNull();
    expect(parseIpLocation({ latitude: 1, longitude: 2 })).toEqual({ label: "My location", latitude: 1, longitude: 2 });
  });
});
