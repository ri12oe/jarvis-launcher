import { describe, expect, it } from "vitest";
import {
  DESIGN_H,
  DESIGN_W,
  fitCanvas,
  shift,
  firstFocus,
  layoutMario,
  OPEN_PLATES,
  RING_COUNT,
  RING_PLATES,
  slotMatches,
  stepMario,
  TAB_SLOTS,
  LEFT_SLOTS,
} from "../src/shared/mario";

const t = (id: string, label: string) => ({ id, label });

const tiles = [
  t("chatgpt", "ChatGPT"),
  t("claude", "Claude"),
  t("copilot", "Copilot"),
  t("grok", "Grok"),
  t("edge", "Microsoft Edge"),
  t("explorer", "File Explorer"),
  t("desktop", "Desktop"),
  t("documents", "Documents"),
  t("downloads", "Downloads"),
  t("pictures", "Pictures"),
  t("gemini-web", "Gemini"),
  t("github-web", "GitHub"),
  t("x", "X"),
  ...Array.from({ length: 6 }, (_, index) => t(`m${index}`, `Module ${index}`)),
];

describe("MARIO OS slots", () => {
  it("keeps the design text and has one plate per 15 degrees", () => {
    expect(TAB_SLOTS.map((slot) => slot.text)).toEqual(["Claude", "Copiiolt", "Grok", "Gemmi", "V3 Code", "Mircosoft Doc"]);
    expect(LEFT_SLOTS.map((slot) => slot.text)).toEqual(["Microsoft Edge", "File Explorer", "Spoftiy", "Outlook", "GitHub", "x"]);
    expect(RING_PLATES).toHaveLength(RING_COUNT);
    for (const slot of OPEN_PLATES) expect(RING_PLATES[slot].kind).toBe("open");
    expect(new Set(OPEN_PLATES).size).toBe(OPEN_PLATES.length);
  });

  it("fills named slots by id, leaves missing apps empty, and puts the rest on open plates", () => {
    const layout = layoutMario(tiles, 0);
    const name = (index: number) => (index < 0 ? null : tiles[index].id);
    expect(layout.tabs.map((slot) => name(slot.tile))).toEqual(["claude", "copilot", "grok", "gemini-web", null, null]);
    expect(layout.left.map((slot) => name(slot.tile))).toEqual(["edge", "explorer", null, null, "github-web", "x"]);
    expect(layout.ring.map((slot) => name(slot.tile))).toEqual([
      "chatgpt",
      "desktop",
      "documents",
      "downloads",
      "pictures",
      "m0",
      "m1",
      "m2",
    ]);
    expect(layout.ring.map((slot) => slot.slot)).toEqual([...OPEN_PLATES]);
    expect(layout.pageCount).toBe(2);
    expect(layoutMario(tiles, 1).ring.map((slot) => name(slot.tile))).toEqual(["m3", "m4", "m5"]);
    expect(layout.ringPage.get(tiles.findIndex((tile) => tile.id === "m5"))).toBe(1);
  });

  it("matches a filter on the design text and on the real name", () => {
    const layout = layoutMario(tiles, 0);
    const copilot = layout.tabs[1];
    expect(slotMatches(copilot, tiles, "copiiolt")).toBe(true);
    expect(slotMatches(copilot, tiles, "copilot")).toBe(true);
    expect(slotMatches(copilot, tiles, "grok")).toBe(false);
    expect(slotMatches(layout.left[2], tiles, "spotify")).toBe(true);
  });

  it("starts on Microsoft Edge and steps through zones", () => {
    const layout = layoutMario(tiles, 0);
    const all = () => true;
    const first = firstFocus(layout, all);
    expect(first).toEqual({ zone: "left", slot: 0 });
    expect(stepMario(layout, first!, "ArrowDown", all)).toEqual({ zone: "left", slot: 1 });
    expect(stepMario(layout, { zone: "left", slot: 5 }, "ArrowDown", all)).toEqual({ zone: "ring", slot: 3 });
    expect(stepMario(layout, { zone: "left", slot: 0 }, "ArrowUp", all)).toEqual({ zone: "tab", slot: 0 });
    expect(stepMario(layout, { zone: "tab", slot: 5 }, "ArrowRight", all)).toEqual({ zone: "tab", slot: 0 });
    expect(stepMario(layout, { zone: "tab", slot: 0 }, "ArrowLeft", all)).toEqual({ zone: "tab", slot: 5 });
    const onlyFilled = (slot: { tile: number }) => slot.tile >= 0;
    expect(stepMario(layout, { zone: "tab", slot: 3 }, "ArrowRight", onlyFilled)).toEqual({ zone: "tab", slot: 0 });
  });

  it("scales without stretching and hands the spare room to one axis", () => {
    const wide = fitCanvas(1920, 1080);
    expect(wide.scale).toBeCloseTo(Math.min(1920 / DESIGN_W, 1080 / DESIGN_H), 5);
    const surface = fitCanvas(1504, 1003);
    expect(surface.scale).toBeCloseTo(1504 / DESIGN_W, 5);
    expect(surface.extraX).toBe(0);
    expect(surface.extraY).toBeCloseTo(1003 / surface.scale - DESIGN_H, 5);
    expect(surface.extraY).toBeGreaterThan(100);
    const ultra = fitCanvas(2560, 1080);
    expect(ultra.extraY).toBe(0);
    expect((DESIGN_W + ultra.extraX) * ultra.scale).toBeCloseTo(2560, 3);
    expect(shift(surface, 0, 0)).toEqual({ x: 0, y: 0 });
    expect(shift(surface, 0.5, 1).y).toBeCloseTo(surface.extraY, 5);
    expect(shift(surface, 0.5, 0.5).y).toBeCloseTo(surface.extraY / 2, 5);
  });
});
