import { describe, expect, it } from "vitest";
import { boxesOverlap, chromeLayout, layoutHud, pageControlBoxes, placedTileBoxes, subtitlePanelBox, type Aabb } from "../src/shared/ring";

const VIEWPORTS = [
  { width: 853, height: 480 },
  { width: 1366, height: 768 },
];

function pairs(entries: Array<{ name: string; box: Aabb }>): string | null {
  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      if (boxesOverlap(entries[i].box, entries[j].box)) return `${entries[i].name} overlaps ${entries[j].name}`;
    }
  }
  return null;
}

describe("chrome geometry", () => {
  it.each(VIEWPORTS.flatMap((viewport) => [false, true].map((voice) => [viewport.width, viewport.height, voice] as const)))(
    "keeps widgets, the subtitle, and the page controls apart at %ix%i voice %s",
    (width, height, voice) => {
      const viewport = { width, height };
      const chrome = chromeLayout(viewport, { subtitle: voice, pages: 2 });
      const entries: Array<{ name: string; box: Aabb }> = [
        { name: "calendar", box: chrome.calendar },
        { name: "ram", box: chrome.ram },
        { name: "bin", box: chrome.bin },
        { name: "hint", box: chrome.hint },
        { name: "commands", box: chrome.commands },
        { name: "search", box: chrome.search },
        { name: "media", box: chrome.media },
        { name: "uptime", box: chrome.uptime },
        ...chrome.gauges.map((box, index) => ({ name: `gauge-${index}`, box })),
        ...chrome.pager.map((box, index) => ({ name: `pager-${index}`, box })),
      ];
      entries.push({ name: "wifi", box: chrome.wifi });
      if (chrome.analog) entries.push({ name: "analog", box: chrome.analog });
      if (chrome.dial) entries.push({ name: "dial", box: chrome.dial });
      if (voice) entries.push({ name: "subtitle", box: subtitlePanelBox(viewport) });
      const separated = entries.filter((entry) => !entry.name.startsWith("gauge-"));
      expect(pairs(separated), `${width}x${height} voice ${voice}`).toBeNull();
      for (const gauge of chrome.gauges) {
        for (const entry of separated) {
          expect(boxesOverlap(gauge, entry.box), `${entry.name} vs gauge`).toBe(false);
        }
      }
      for (const entry of [...separated, ...chrome.gauges.map((box) => ({ box }))]) {
        expect(entry.box.left, "left").toBeGreaterThanOrEqual(-1);
        expect(entry.box.top, "top").toBeGreaterThanOrEqual(-1);
        expect(entry.box.right, "right").toBeLessThanOrEqual(width + 1);
        expect(entry.box.bottom, "bottom").toBeLessThanOrEqual(height + 1);
      }
      if (width === 853) {
        expect(chrome.compact).toBe(true);
        expect(chrome.analog).toBeUndefined();
        expect(chrome.gauges).toHaveLength(1);
      }
      const tiles = Array.from({ length: 24 }, (_, index) => ({ label: `Project ${index}` }));
      const layout = layoutHud(tiles, viewport, undefined, { subtitle: voice });
      const controls = pageControlBoxes(viewport, 2);
      for (const tile of placedTileBoxes(layout)) {
        for (const control of controls) expect(boxesOverlap(tile, control)).toBe(false);
        for (const gauge of chrome.gauges) expect(boxesOverlap(tile, gauge)).toBe(false);
      }
    },
  );

  it("gives the footer strings enough width at 853", () => {
    const chrome = chromeLayout({ width: 853, height: 480 }, { pages: 2 });
    const commandW = (chrome.commands.right - chrome.commands.left - 8) / 3;
    expect(commandW).toBeGreaterThanOrEqual("REFRESH".length * 6);
    expect(chrome.media.right - chrome.media.left).toBeGreaterThanOrEqual("--:--".length * 7);
    expect(chrome.search.right - chrome.search.left).toBeGreaterThanOrEqual(72);
  });
});
