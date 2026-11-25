import { describe, expect, it } from "vitest";
import { displayLabel, estimateWidth, labelFit, labelLines, labelsCollide, plateTexts, renderedLabel } from "../src/shared/labels";
import { measurePlateWidth } from "../src/renderer/measure";
import { layoutHud, type RingPlacement } from "../src/shared/ring";

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

  it("treats a cut-off label as the same name", () => {
    const shown = plateTexts([
      { label: "Microsoft Visual Studio 2022 Enterprise", width: 110, fontPx: 11 },
      { label: "Microsoft Visual Studio 2022 Professional", width: 100, fontPx: 10 },
      { label: "Visual Studio Code", width: 90, fontPx: 10 },
      { label: "Visual Studio Code - Insiders", width: 96, fontPx: 10 },
    ]).map(renderedLabel);
    const hits = shown.flatMap((text, index) =>
      shown.slice(index + 1).flatMap((other) => (labelsCollide(text, other) ? [`${text} ~ ${other}`] : [])),
    );
    expect(hits, hits.join(" | ")).toEqual([]);
    expect(shown.some((text) => text.includes("ENTERPRISE"))).toBe(true);
    expect(shown.some((text) => text.includes("PROFESSIONAL"))).toBe(true);
  });

  it("does not treat the 2 inside 2022 as a suffix", () => {
    const shown = plateTexts([
      { label: "Microsoft Visual Studio 2022 Enterprise", width: 100, fontPx: 10 },
      { label: "Microsoft Visual Studio 2022 Professional", width: 100, fontPx: 10 },
    ]).map((lines) => lines.join(" "));
    expect(new Set(shown).size).toBe(2);
    expect(shown.some((text) => /\bENTERPRISE\b/.test(text))).toBe(true);
    expect(shown.some((text) => /\bPROFESSIONAL\b/.test(text))).toBe(true);
    expect(shown.some((text) => /\b2\b/.test(text))).toBe(false);
  });

  it("keeps both Photoshop years instead of dropping the first", () => {
    const shown = plateTexts([
      { label: "Adobe Photoshop 2025", width: 80, fontPx: 10 },
      { label: "Adobe Photoshop 2026", width: 80, fontPx: 10 },
    ]).map((lines) => lines.join(" "));
    expect(shown.some((text) => text.includes("2025"))).toBe(true);
    expect(shown.some((text) => text.includes("2026"))).toBe(true);
    expect(shown.every((text) => text.includes("PHOTOSHOP") || text.includes("ADOBE"))).toBe(true);
  });

  it("measures a longer plate word as wider", () => {
    expect(measurePlateWidth("PHOTOSHOP", 12)).toBeGreaterThan(measurePlateWidth("WORD", 12));
  });

  it("marks a line when later words do not fit", () => {
    const text = labelLines("Teams (work or school)", 48, 10, 2).join(" ");
    expect(text.includes("…")).toBe(true);
  });

  it("keeps CJK and Cyrillic duplicates readable", () => {
    const shown = plateTexts([
      { label: "微信", width: 80, fontPx: 12 },
      { label: "微信", width: 80, fontPx: 12 },
      { label: "Привет Мир", width: 140, fontPx: 12 },
      { label: "Привет Мир 2", width: 140, fontPx: 12 },
    ]).map(renderedLabel);
    expect(shown[0]).toBe("微信");
    expect(shown[1]).toBe("微信 2");
    expect(shown[2]).toBe("ПРИВЕТ МИР");
    expect(shown[3]).toBe("ПРИВЕТ МИР 2");
  });

  it("does not invent words for names that only share a prefix", () => {
    const shown = plateTexts([
      { label: "Word", width: 160, fontPx: 12 },
      { label: "WordPad", width: 160, fontPx: 12 },
      { label: "OBS", width: 160, fontPx: 12 },
      { label: "Obsidian", width: 160, fontPx: 12 },
      { label: "Microsoft Store", width: 160, fontPx: 12 },
      { label: "Store 2", width: 160, fontPx: 12 },
    ]).map(renderedLabel);
    expect(shown).toEqual(["WORD", "WORDPAD", "OBS", "OBSIDIAN", "STORE", "STORE 2"]);
  });

  it("does not use a dash as a distinguisher", () => {
    const shown = renderedLabel(plateTexts([{ label: "Visual Studio Code - Insiders", width: 70, fontPx: 10 }])[0]);
    expect(shown.endsWith("-")).toBe(false);
    expect(shown).not.toBe("VISUAL … -");
  });

  it.each([
    [["Portal 2", "Portal 2"], 2],
    [["Tool 2", "Tool 2"], 2],
    [["App 3", "App 3", "App 3"], 2],
    [["Steam", "Steam", "Steam 2"], 1],
    [["2048", "2048", "Super 2048"], 1],
  ])("keeps %j distinct on %i line", (labels, maxLines) => {
    for (const width of [60, 90, 120]) {
      const texts = plateTexts(labels.map((label) => ({ label, width, fontPx: 10, maxLines })));
      const shown = texts.map(renderedLabel);
      const hits = shown.flatMap((text, index) =>
        shown.slice(index + 1).flatMap((other) => (labelsCollide(text, other) ? [`${text} ~ ${other}`] : [])),
      );
      expect(hits, `${width}: ${hits.join(" | ")}`).toEqual([]);
      expect(new Set(shown).size, `${width}: ${shown.join(" | ")}`).toBe(labels.length);
      if (labels.includes("Steam 2")) {
        const real = shown[labels.indexOf("Steam 2")];
        expect(real).toMatch(/\b2\b/);
        expect(real).not.toMatch(/\b3\b/);
        expect(shown.filter((text) => text === "STEAM 2").length).toBe(1);
      }
      for (const lines of texts) {
        for (const line of lines) {
          expect(estimateWidth(line, 10), line).toBeLessThanOrEqual(Math.max(8, width - 4) + 0.01);
        }
      }
    }
  });
});

const SWEEP = [
  "Microsoft Visual Studio 2022 Enterprise",
  "Microsoft Visual Studio 2022 Professional",
  "Visual Studio Code",
  "Visual Studio Code - Insiders",
  "Microsoft Word",
  "Microsoft Excel",
  "Microsoft Outlook",
  "Microsoft PowerPoint",
  "Microsoft OneNote",
  "Microsoft Teams",
  "Microsoft Teams (work or school)",
  "Microsoft 365",
  "Microsoft 365 Copilot",
  "Adobe Photoshop",
  "Adobe Photoshop 2024",
  "Adobe Photoshop 2025",
  "Adobe Photoshop 2026",
  "Python",
  "Python 3",
  "Python 3.11",
  "Python 3.12",
  "Portal 2",
  "Portal 2",
  "Tool 2",
  "Tool 2",
  "App 3",
  "App 3",
  "App 3",
  "Steam",
  "Steam",
  "Steam 2",
  "DaVinci Resolve 19",
  "ChatGPT",
  "Claude",
  "Cursor",
  "Grok",
  "Copilot",
  "Perplexity",
  "Ollama",
  "LM Studio",
  "微信",
  "微信",
  "Привет Мир",
  "Привет Мир 2",
  "WordPad",
  "OBS",
  "Obsidian",
  "Store 2",
];

function strayWords(label: string, shown: string): string[] {
  const source = displayLabel(label).toUpperCase().split(/\s+/).filter(Boolean);
  const rendered = shown.replace(/…/g, " ").split(/\s+/).filter(Boolean);
  const last = rendered[rendered.length - 1];
  const indexSuffix = Boolean(last && /^\d+$/.test(last) && !source.some((src) => src === last || src.startsWith(last)));
  const body = indexSuffix ? rendered.slice(0, -1) : rendered;
  return body.filter((word) => !source.some((src) => src === word || src.startsWith(word)));
}

function plateFit(place: RingPlacement, label: string) {
  return labelFit(label, place.zone, place.width ?? 40, place.height ?? 36);
}

describe("rendered label sweep", () => {
  it.each(
    [
      [853, 480],
      [911, 480],
      [1093, 614],
      [1280, 720],
      [1366, 768],
      [1920, 1080],
    ].flatMap(([width, height]) => [false, true].map((voice) => [width, height, voice] as const)),
  )("has no duplicate or overflowing labels at %ix%i voice %s", (width, height, voice) => {
    const tiles = SWEEP.map((label, index) => ({ id: `sweep-${index}`, label, kind: "app" as const }));
    const layout = layoutHud(tiles, { width, height }, undefined, { subtitle: voice });
    const entries = layout.segments.map((place) => ({
      label: tiles[place.index].label,
      ...plateFit(place, tiles[place.index].label),
    }));
    const texts = plateTexts(entries, estimateWidth);
    const shown = texts.map(renderedLabel);
    const hits = shown.flatMap((text, index) =>
      shown.slice(index + 1).flatMap((other) => (labelsCollide(text, other) ? [`${text} ~ ${other}`] : [])),
    );
    expect(hits, hits.join(" | ")).toEqual([]);
    const stray = texts.flatMap((lines, index) => strayWords(entries[index].label, renderedLabel(lines)).map((word) => `${entries[index].label}: ${word}`));
    expect(stray, stray.join(" | ")).toEqual([]);
    texts.forEach((lines, index) => {
      for (const line of lines) {
        expect(estimateWidth(line, entries[index].fontPx), `${entries[index].label}: ${line}`).toBeLessThanOrEqual(
          Math.max(8, entries[index].width - 4) + 0.01,
        );
      }
    });
  });
});
