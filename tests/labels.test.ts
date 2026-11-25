import { describe, expect, it } from "vitest";
import { displayLabel, labelLines, plateTexts } from "../src/shared/labels";
import { layoutHud } from "../src/shared/ring";

const NAMES = [
  "Microsoft Word",
  "Microsoft Excel",
  "Microsoft Outlook",
  "Microsoft Teams",
  "Microsoft PowerPoint",
  "Microsoft OneNote",
  "Visual Studio Code",
  "Adobe Photoshop",
  "Blender",
  "Notepad++",
  "File Explorer",
];

describe("plate labels", () => {
  it("strips a leading Microsoft prefix and keeps the product names distinct", () => {
    const shown = NAMES.map(displayLabel);
    expect(shown).toContain("Word");
    expect(shown).toContain("File Explorer");
    expect(new Set(shown.map((label) => label.toUpperCase())).size).toBe(NAMES.length);
  });

  it.each([
    [1920, 1080],
    [853, 480],
  ])("keeps real app names distinguishable at %ix%i", (width, height) => {
    const tiles = NAMES.map((label, index) => ({
      id: `app-${index}`,
      label,
      kind: label === "File Explorer" ? "system" : "app",
    }));
    const layout = layoutHud(tiles, { width, height });
    const visible = layout.segments.map((place) => {
      const lines = labelLines(tiles[place.index].label, place.width ?? 40, place.zone === "segment" ? 10 : 11);
      return lines.join(" ");
    });
    expect(new Set(visible).size).toBe(tiles.length);
    for (const text of visible) expect(text.startsWith("MICROSOFT")).toBe(false);
  });

  it("keeps a year or index on labels that would otherwise match", () => {
    const entries = [
      { label: "Adobe Photoshop", width: 70 },
      { label: "Adobe Photoshop 2024", width: 70 },
      { label: "To Do", width: 80 },
      { label: "To Do", width: 80 },
      { label: "Microsoft Store", width: 80 },
      { label: "Microsoft Store", width: 80 },
    ];
    const shown = plateTexts(entries).map((lines) => lines.join(" "));
    expect(new Set(shown).size).toBe(entries.length);
    expect(shown.some((text) => text.includes("2024"))).toBe(true);
  });
});
