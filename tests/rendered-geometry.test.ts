import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium, type Browser } from "playwright";
import { build, preview, type PreviewServer } from "vite";

const PORT = 4179;
const LABELS = [
  "Microsoft Word",
  "Microsoft Excel",
  "Microsoft Outlook",
  "Microsoft Teams",
  "Microsoft PowerPoint",
  "Microsoft OneNote",
  "Visual Studio Code",
  "Adobe Photoshop",
  "Adobe Photoshop 2024",
  "Blender",
  "Notepad++",
  "Microsoft Store",
  "Microsoft Store",
  "To Do",
  "To Do",
  "File Explorer",
  ...Array.from({ length: 12 }, (_, index) => `Module ${index + 1}`),
].join("|");

const VIEWPORTS = [
  { width: 853, height: 480 },
  { width: 1366, height: 768 },
  { width: 1920, height: 1080 },
];

describe("rendered geometry", () => {
  let browser: Browser;
  let server: PreviewServer;

  beforeAll(async () => {
    await build();
    server = await preview({
      preview: { host: "127.0.0.1", port: PORT, strictPort: true },
    });
    browser = await chromium.launch({ headless: true });
  }, 180_000);

  afterAll(async () => {
    await browser?.close();
    await server?.close();
  });

  it.each(
    VIEWPORTS.flatMap((viewport) =>
      [false, true].flatMap((voice) =>
        [1, 1.5].map((dpr) => [viewport, voice, dpr] as const),
      ),
    ),
  )(
    "keeps widgets, plates, and footer text on screen at %j voice %s dpr %s",
    async (viewport, voice, dpr) => {
      const page = await browser.newPage({ viewport, deviceScaleFactor: dpr });
      const query = voice ? `voice=speaking&labels=${encodeURIComponent(LABELS)}` : `nokey=1&labels=${encodeURIComponent(LABELS)}`;
      await page.goto(`http://127.0.0.1:${PORT}/?${query}`);
      await page.waitForSelector(".tile-segment .label-line");
      const report = await page.evaluate(() => {
        const viewW = window.innerWidth;
        const viewH = window.innerHeight;
        const nodes = [
          ...document.querySelectorAll(
            "button, .label-line, .hint, .search-pill, .uptime, .media > span, .gauge, .round-meter, .meter-name, .meter-value, .day-num, .month-banner span, .wifi, .wifi-ring, .analog, .analog p, .subtitle, .corner-dial, .plate-face, .voice, .weather",
          ),
        ].filter((node): node is HTMLElement => node instanceof HTMLElement);
        const boxOf = (node: HTMLElement) => {
          const rect = node.getBoundingClientRect();
          return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height };
        };
        const nameOf = (node: HTMLElement) => {
          const text = (node.innerText || node.getAttribute("aria-label") || node.className || node.tagName).toString().replace(/\s+/g, " ").slice(0, 40);
          return `${node.className || node.tagName}: ${text}`;
        };
        const visible = nodes
          .map((node) => ({ node, box: boxOf(node), name: nameOf(node) }))
          .filter((entry) => entry.box.width > 1 && entry.box.height > 1);
        const problems: string[] = [];
        for (const entry of visible) {
          const { box, name } = entry;
          if (box.left < -1 || box.top < -1 || box.right > viewW + 1 || box.bottom > viewH + 1) {
            problems.push(`offscreen ${name} @ ${Math.round(box.left)},${Math.round(box.top)} ${Math.round(box.right)}x${Math.round(box.bottom)}`);
          }
          if (entry.node.scrollWidth > entry.node.clientWidth + 1) {
            problems.push(`overflow ${name} ${entry.node.scrollWidth}>${entry.node.clientWidth}`);
          }
        }
        const contains = (a: (typeof visible)[number]["box"], b: (typeof visible)[number]["box"]) =>
          a.left <= b.left + 1 && a.top <= b.top + 1 && a.right >= b.right - 1 && a.bottom >= b.bottom - 1;
        const gaugeOf = (node: HTMLElement) => node.closest(".gauge");
        for (let i = 0; i < visible.length; i++) {
          for (let j = i + 1; j < visible.length; j++) {
            const a = visible[i];
            const b = visible[j];
            if (a.node.contains(b.node) || b.node.contains(a.node)) continue;
            const tileA = a.node.closest(".tile");
            if (tileA && tileA === b.node.closest(".tile")) continue;
            const ringNode = (node: HTMLElement) =>
              node.classList.contains("tile-segment") ||
              node.classList.contains("plate-face") ||
              node.closest(".tile-segment") != null;
            if (ringNode(a.node) && ringNode(b.node)) continue;
            const coreNode = (node: HTMLElement) => node.classList.contains("voice") || node.closest(".voice") != null;
            if ((coreNode(a.node) && ringNode(b.node)) || (coreNode(b.node) && ringNode(a.node))) continue;
            if (contains(a.box, b.box) || contains(b.box, a.box)) continue;
            const gaugeA = gaugeOf(a.node);
            const gaugeB = gaugeOf(b.node);
            if (gaugeA && gaugeB && gaugeA !== gaugeB) continue;
            const w = Math.min(a.box.right, b.box.right) - Math.max(a.box.left, b.box.left);
            const h = Math.min(a.box.bottom, b.box.bottom) - Math.max(a.box.top, b.box.top);
            if (w > 1 && h > 1) problems.push(`overlap ${a.name} | ${b.name}`);
          }
        }
        const plates = [...document.querySelectorAll(".tile")].map((node) => ({
          shown: (node.querySelector(".label")?.textContent ?? "").replace(/\s+/g, " ").trim(),
          full: (node.getAttribute("aria-label") ?? "").replace(/^microsoft\s+/i, "").trim(),
        }));
        const dupes = plates.map((plate) => plate.shown).filter((label, index, all) => all.indexOf(label) !== index);
        const unreadable = plates.flatMap((plate) => {
          const text = plate.shown.replace(/…/g, "").trim();
          const first = plate.full.toUpperCase().split(/\s+/).filter(Boolean)[0] ?? "";
          if (/^[A-Z]$/.test(text) || /^\d+$/.test(text)) return [`replaced ${plate.full} -> ${plate.shown}`];
          if (first && text.includes(first)) return [];
          const letters = text.replace(/[^A-Z0-9]/g, "");
          if (letters.length >= 4 && first.startsWith(letters.slice(0, 4))) return [];
          return [`short ${plate.full} -> ${plate.shown}`];
        });
        const misses: string[] = [];
        for (const button of document.querySelectorAll<HTMLButtonElement>(".tile-segment")) {
          const angle = Number((button.style.transform.match(/rotate\(([-\d.]+)deg\)/) ?? [])[1] ?? 0) * (Math.PI / 180);
          const rect = button.getBoundingClientRect();
          const cx = rect.left + rect.width / 2;
          const cy = rect.top + rect.height / 2;
          for (const u of [0.3, 0.5, 0.7]) {
            for (const v of [0.35, 0.5, 0.65]) {
              const lx = (u - 0.5) * button.clientWidth;
              const ly = (v - 0.5) * button.clientHeight;
              const x = cx + lx * Math.cos(angle) - ly * Math.sin(angle);
              const y = cy + lx * Math.sin(angle) + ly * Math.cos(angle);
              const hit = document.elementFromPoint(x, y);
              if (hit !== button && !button.contains(hit)) {
                misses.push(`${button.getAttribute("aria-label")} @ ${u},${v}`);
              }
            }
          }
        }
        return {
          problems: problems.slice(0, 16),
          plates: plates.map((plate) => plate.shown),
          dupes: [...new Set(dupes)],
          unreadable: unreadable.slice(0, 12),
          misses: misses.slice(0, 8),
          count: plates.length,
        };
      });
      expect(report.dupes, JSON.stringify(report.plates)).toEqual([]);
      expect(report.unreadable, report.unreadable.join("\n")).toEqual([]);
      expect(report.misses, report.misses.join("\n")).toEqual([]);
      expect(report.count).toBeGreaterThan(0);
      expect(report.problems, report.problems.join("\n")).toEqual([]);
      await page.close();
    },
    60_000,
  );
});
