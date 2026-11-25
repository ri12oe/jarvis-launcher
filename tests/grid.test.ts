import { describe, expect, it } from "vitest";
import {
  clampIndex,
  filterTiles,
  footerHint,
  launchStatusText,
  nextVisibleTile,
  statusAfterPublish,
  type TilePoint,
} from "../src/shared/grid";

const tiles = [
  { id: "edge", label: "Microsoft Edge" },
  { id: "explorer", label: "File Explorer" },
  { id: "downloads", label: "Downloads" },
  { id: "desktop", label: "Desktop" },
];

const hint = {
  status: "",
  refreshing: false,
  scanning: false,
  refreshFailed: false,
  query: "",
  warning: "",
};

describe("tile filter", () => {
  it("returns every tile when the query is empty", () => {
    expect(filterTiles(tiles, "").map((tile) => tile.id)).toEqual(["edge", "explorer", "downloads", "desktop"]);
    expect(filterTiles(tiles, "   ").map((tile) => tile.id)).toEqual(["edge", "explorer", "downloads", "desktop"]);
  });

  it("matches a case-insensitive substring of the label", () => {
    expect(filterTiles(tiles, "edge").map((tile) => tile.id)).toEqual(["edge"]);
    expect(filterTiles(tiles, "EXPL").map((tile) => tile.id)).toEqual(["explorer"]);
    expect(filterTiles(tiles, "load").map((tile) => tile.id)).toEqual(["downloads"]);
    expect(filterTiles(tiles, "zzz")).toEqual([]);
  });
});

function row(xs: number[], y: number): TilePoint[] {
  return xs.map((x) => ({ x, y }));
}

describe("grid navigation", () => {
  const wide = [
    ...row([0, 100, 200, 300, 400, 500], 0),
    ...row([200, 300], 100),
  ];
  const gapped = [...row([0, 100, 200], 0), ...row([0, 100], 100)];

  it("clamps the focused index when the list shrinks", () => {
    expect(clampIndex(5, 2)).toBe(1);
    expect(clampIndex(0, 4)).toBe(0);
    expect(clampIndex(-1, 4)).toBe(0);
    expect(clampIndex(3, 0)).toBe(0);
  });

  it("follows the centered last row and stays on a gap", () => {
    expect(nextVisibleTile(2, wide, "ArrowDown")).toBe(6);
    expect(nextVisibleTile(3, wide, "ArrowDown")).toBe(7);
    expect(nextVisibleTile(0, wide, "ArrowDown")).toBe(0);
    expect(nextVisibleTile(5, wide, "ArrowDown")).toBe(5);
    expect(nextVisibleTile(6, wide, "ArrowUp")).toBe(2);
    expect(nextVisibleTile(6, wide, "ArrowRight")).toBe(7);
    expect(nextVisibleTile(7, wide, "ArrowRight")).toBe(7);
    expect(nextVisibleTile(5, wide, "ArrowRight")).toBe(5);
    expect(nextVisibleTile(0, wide, "ArrowRight")).toBe(1);
    expect(nextVisibleTile(2, gapped, "ArrowDown")).toBe(2);
    expect(nextVisibleTile(0, gapped, "ArrowDown")).toBe(3);
    expect(nextVisibleTile(-1, wide, "ArrowDown")).toBe(0);
    expect(nextVisibleTile(0, [], "ArrowDown")).toBe(-1);
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

  it("shows the typed filter ahead of the idle hint", () => {
    expect(footerHint({ ...hint, query: "ed", warning: "Could not register hotkey" })).toBe("FILTER  ED");
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
});
