import { describe, expect, it } from "vitest";
import { cloneDefaultConfig, parseConfig, plateKey } from "../src/shared/config";
import { layoutMario, PLATE_SLOTS, resolveHudSlots } from "../src/shared/mario";

describe("dock and plate config", () => {
  it("defaults the dock to Downloads plus three empty slots, and no plates", () => {
    const config = cloneDefaultConfig();
    expect(config.dock).toEqual(["downloads", null, null, null]);
    expect(config.plates).toEqual({});
    expect(parseConfig({}).config.dock).toEqual(["downloads", null, null, null]);
  });

  it("reads four dock slots and warns about extras and bad ids", () => {
    const parsed = parseConfig({ dock: ["spotify", null, "bad id!", "documents", "extra"] });
    expect(parsed.config.dock).toEqual(["spotify", null, null, "documents"]);
    expect(parsed.warnings.join(" | ")).toContain("dock has 4 slots");
    expect(parsed.warnings.join(" | ")).toContain("dock slot 3 is not a valid tile id");
    expect(parseConfig({ dock: ["spotify"] }).config.dock).toEqual(["spotify", null, null, null]);
    expect(parseConfig({ dock: "spotify" }).config.dock).toEqual(["downloads", null, null, null]);
  });

  it("matches plate text in any case and spacing, and skips unknown plates", () => {
    const parsed = parseConfig({ plates: { "ten  opf": "chatgpt", CCRP: "cursor", "NOT A PLATE": "x", SEPA: 3 } });
    expect(parsed.config.plates).toEqual({ "TEN OPF": "chatgpt", CCRP: "cursor" });
    expect(parsed.warnings.join(" | ")).toContain('no plate reads "NOT A PLATE"');
    expect(parsed.warnings.join(" | ")).toContain('"SEPA" needs a tile id');
    expect(plateKey(" edae   tieue ")).toBe("EDAE TIEUE");
    expect(PLATE_SLOTS.get("EDAE TIEUE")).toBe(23);
    expect(PLATE_SLOTS.size).toBe(12);
  });

  it("drops ids that have no tile and duplicate plate assignments", () => {
    const hud = resolveHudSlots(
      { dock: ["downloads", "ghost", null, "spotify"], plates: { "TEN OPF": "cursor", CCRP: "cursor", SEPA: "nope" } },
      ["downloads", "cursor", "spotify"],
    );
    expect(hud.dock).toEqual(["downloads", null, null, "spotify"]);
    expect(hud.plates).toEqual([{ slot: PLATE_SLOTS.get("TEN OPF"), tileId: "cursor" }]);
    expect(hud.warnings).toHaveLength(3);
  });
});

describe("labelled plates in the layout", () => {
  const tiles = ["edge", "chatgpt", "cursor", "desktop", "claude"].map((id) => ({ id, label: id }));

  it("puts an assigned tile on its labelled plate on every page and takes it off the open plates", () => {
    const tenOpf = PLATE_SLOTS.get("TEN OPF")!;
    const layout = layoutMario(tiles, 0, [{ slot: tenOpf, tileId: "chatgpt" }]);
    const labelled = layout.ring.find((slot) => slot.slot === tenOpf);
    expect(labelled).toMatchObject({ zone: "ring", text: "TEN OPF", tile: 1 });
    const open = layout.ring.filter((slot) => slot.text === "").map((slot) => tiles[slot.tile].id);
    expect(open).toEqual(["cursor", "desktop"]);
  });

  it("leaves a tile that already has a named slot where it is", () => {
    const layout = layoutMario(tiles, 0, [{ slot: PLATE_SLOTS.get("CCRP")!, tileId: "claude" }]);
    expect(layout.tabs[0].tile).toBe(4);
    expect(layout.ring.some((slot) => slot.text === "CCRP")).toBe(false);
  });
});

describe("reactor dials", () => {
  it("defaults G to Google and E to File Explorer and reads overrides", () => {
    expect(parseConfig({}).config.dials).toEqual({ G: "google", E: "explorer" });
    const parsed = parseConfig({ dials: { g: "chatgpt", E: null, Q: "x" } });
    expect(parsed.config.dials).toEqual({ G: "chatgpt", E: null });
    expect(parsed.warnings.join(" | ")).toContain('there is no "Q" dial');
    expect(parseConfig({ dials: "google" }).config.dials).toEqual({ G: "google", E: "explorer" });
  });

  it("drops a dial id with no tile and keeps dial tiles off the open plates", () => {
    const hud = resolveHudSlots({ dock: [], plates: {}, dials: { G: "google", E: "ghost" } }, ["google", "explorer"]);
    expect(hud.dials).toEqual({ G: "google", E: null });
    expect(hud.warnings).toEqual(['dials: no tile with id "ghost" for E']);
    const tiles = ["edge", "google", "desktop"].map((id) => ({ id, label: id }));
    const layout = layoutMario(tiles, 0, [], ["google"]);
    expect(layout.ring.map((slot) => tiles[slot.tile].id)).toEqual(["desktop"]);
  });
});
