import { describe, expect, it } from "vitest";
import { boxesOverlap, layoutHud, placedTileBoxes, subtitlePanelBox, viewportAboveSubtitle } from "../src/shared/ring";

const labels = [
  "ChatGPT",
  "Claude",
  "Cursor",
  "Grok",
  "Copilot",
  "Perplexity",
  "Ollama",
  "LM Studio",
  "Microsoft Edge",
  "File Explorer",
  "Desktop",
  "Documents",
  "Downloads",
  "Pictures",
  "Module 1",
  "Module 2",
  "Module 3",
  "Module 4",
  "Module 5",
  "Module 6",
  "Module 7",
  "Module 8",
  "Module 9",
  "Module 10",
];

describe("voice subtitle panel", () => {
  it("stays clear of every tile at 10 and 24 tiles", () => {
    const viewports = [
      { width: 1366, height: 768 },
      { width: 1920, height: 1080 },
    ];
    for (const count of [10, 24]) {
      const tiles = labels.slice(0, count).map((label) => ({ label }));
      for (const viewport of viewports) {
        const layoutViewport = viewportAboveSubtitle(viewport);
        const layout = layoutHud(tiles, layoutViewport);
        const panel = subtitlePanelBox(viewport);
        expect(layout.segments).toHaveLength(count);
        for (const box of placedTileBoxes(layout, layoutViewport)) {
          expect(boxesOverlap(box, panel)).toBe(false);
        }
        expect(panel.bottom).toBeLessThanOrEqual(viewport.height - 72);
        expect(panel.right - panel.left).toBeGreaterThan(160);
      }
    }
  });
});
