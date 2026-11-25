import { describe, expect, it } from "vitest";
import { columnCountFromOffsets, filterTiles, footerHint, nextGridIndex } from "../src/shared/grid";

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

describe("grid navigation", () => {
  it("counts the tiles that share the first row's offset", () => {
    expect(columnCountFromOffsets([])).toBe(1);
    expect(columnCountFromOffsets([10, 10, 10, 80, 80])).toBe(3);
    expect(columnCountFromOffsets([0])).toBe(1);
  });

  it("moves by one tile horizontally and by a row vertically", () => {
    expect(nextGridIndex(-1, 8, 3, "ArrowRight")).toBe(0);
    expect(nextGridIndex(0, 8, 3, "ArrowRight")).toBe(1);
    expect(nextGridIndex(1, 8, 3, "ArrowLeft")).toBe(0);
    expect(nextGridIndex(0, 8, 3, "ArrowLeft")).toBe(0);
    expect(nextGridIndex(0, 8, 3, "ArrowDown")).toBe(3);
    expect(nextGridIndex(3, 8, 3, "ArrowUp")).toBe(0);
    expect(nextGridIndex(5, 8, 3, "ArrowDown")).toBe(5);
    expect(nextGridIndex(7, 8, 3, "ArrowRight")).toBe(7);
    expect(nextGridIndex(0, 0, 3, "ArrowDown")).toBe(-1);
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
});
