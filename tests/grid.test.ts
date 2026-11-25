import { describe, expect, it } from "vitest";
import {
  clampIndex,
  clearLaunchStatus,
  footerHint,
  launchStatusText,
  statusAfterPublish,
  tileMatches,
} from "../src/shared/grid";

const hint = {
  status: "",
  refreshing: false,
  scanning: false,
  refreshFailed: false,
  query: "",
  warning: "",
};

describe("tile filter", () => {
  it("matches a case-insensitive substring, and an empty query matches everything", () => {
    expect(tileMatches("Microsoft Edge", "")).toBe(true);
    expect(tileMatches("Microsoft Edge", "   ")).toBe(true);
    expect(tileMatches("Microsoft Edge", "edge")).toBe(true);
    expect(tileMatches("File Explorer", "EXPL")).toBe(true);
    expect(tileMatches("Downloads", "load")).toBe(true);
    expect(tileMatches("Desktop", "zzz")).toBe(false);
  });
});

describe("focus index", () => {
  it("clamps the focused index when the list shrinks", () => {
    expect(clampIndex(5, 2)).toBe(1);
    expect(clampIndex(0, 4)).toBe(0);
    expect(clampIndex(-1, 4)).toBe(0);
    expect(clampIndex(3, 0)).toBe(0);
  });
});

describe("footer hint", () => {
  it("shows SCANNING while the list is still being read", () => {
    expect(footerHint({ ...hint, scanning: true })).toBe("SCANNING");
  });

  it("shows REFRESH FAILED after a failed reload", () => {
    expect(footerHint({ ...hint, refreshFailed: true, warning: "Could not list Start menu apps" })).toBe(
      "REFRESH FAILED",
    );
    expect(footerHint({ ...hint, status: "REFRESH FAILED" })).toBe("REFRESH FAILED");
  });

  it("shows the typed filter ahead of the idle hint, and NO MATCH when nothing hits", () => {
    expect(footerHint({ ...hint, query: "ed", matchCount: 1, warning: "Could not register hotkey" })).toBe("FILTER  ED");
    expect(footerHint({ ...hint, query: "zzz", matchCount: 0 })).toBe("NO MATCH");
    expect(footerHint({ ...hint, query: "zzz", matchCount: 0, status: "LAUNCH FAILED" })).toBe("LAUNCH FAILED");
    expect(footerHint(hint)).toBe("SELECT A SYSTEM");
  });

  it("keeps a click's REFRESHING label ahead of the scan flag", () => {
    expect(footerHint({ ...hint, refreshing: true, scanning: true })).toBe("REFRESHING");
  });

  it("shows LAUNCH FAILED with the reason and keeps it across a state publish", () => {
    const explorer = launchStatusText("spawn C:\\Windows\\explorer.exe ENOENT");
    const unknown = launchStatusText("Unknown tile");
    expect(explorer).toBe("LAUNCH FAILED  spawn C:\\Windows\\explorer.exe ENOENT");
    expect(unknown).toBe("LAUNCH FAILED  Unknown tile");
    expect(launchStatusText(undefined)).toBe("LAUNCH FAILED");
    expect(footerHint({ ...hint, status: explorer, scanning: true, query: "edge" })).toBe(explorer);
    expect(footerHint({ ...hint, status: unknown })).toBe(unknown);
    expect(statusAfterPublish(explorer, false)).toBe(explorer);
    expect(statusAfterPublish(unknown, false)).toBe(unknown);
    expect(statusAfterPublish("SELECT A SYSTEM", false)).toBe("");
  });

  it("clears a launch failure on click and on hide", () => {
    const failed = launchStatusText("spawn C:\\Windows\\explorer.exe ENOENT");
    expect(clearLaunchStatus(failed)).toBe("");
    expect(clearLaunchStatus("LAUNCH FAILED")).toBe("");
    expect(clearLaunchStatus("LINK LOST")).toBe("LINK LOST");
    expect(clearLaunchStatus("REFRESH FAILED")).toBe("REFRESH FAILED");
    expect(clearLaunchStatus("")).toBe("");
    expect(clearLaunchStatus("VOICE FAILED  Could not speak")).toBe("");
    expect(statusAfterPublish("VOICE FAILED  Could not reach Grok", false)).toBe("VOICE FAILED  Could not reach Grok");
    expect(footerHint({ ...hint, status: "VOICE FAILED  Could not transcribe", query: "edge" })).toBe(
      "VOICE FAILED  Could not transcribe",
    );
  });
});
