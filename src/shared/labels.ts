/** Drop a leading "Microsoft " so plate text is the product name. */
export function displayLabel(label: string): string {
  return label.replace(/^microsoft\s+/i, "").trim();
}

export function firstWord(label: string): string {
  return displayLabel(label).toUpperCase().split(/\s+/).filter(Boolean)[0] ?? "";
}

/** Width of uppercase plate text. The fallback matches Segoe UI, not a full em. */
export type MeasureWidth = (text: string, fontPx: number) => number;

export function estimateWidth(text: string, fontPx: number): number {
  let width = 0;
  for (const char of text) width += char === " " ? fontPx * 0.33 : fontPx * 0.68;
  return width;
}

function fits(text: string, width: number, fontPx: number, measure: MeasureWidth): boolean {
  return measure(text, fontPx) <= Math.max(8, width - 4);
}

function ellipsizeWord(word: string, width: number, fontPx: number, measure: MeasureWidth): string {
  if (fits(word, width, fontPx, measure)) return word;
  let cut = word;
  while (cut.length > 1 && !fits(`${cut}…`, width, fontPx, measure)) cut = cut.slice(0, -1);
  if (cut.length > 0 && fits(`${cut}…`, width, fontPx, measure)) return `${cut}…`;
  return fits(cut, width, fontPx, measure) ? cut : "…";
}

/** Keep a cut line from looking finished when later words were dropped. */
function finishLine(current: string, rest: readonly string[], width: number, fontPx: number, measure: MeasureWidth): string {
  const year = [...rest].reverse().find((word) => /^\d{2,4}(?:\.\d+)?$/.test(word));
  if (year) {
    let cut = current;
    while (cut.length > 0 && !fits(`${cut}… ${year}`, width, fontPx, measure)) cut = cut.slice(0, -1);
    if (cut.length > 0) return `${cut}… ${year}`;
    if (fits(year, width, fontPx, measure)) return year;
  }
  return markCut(current, width, fontPx, measure);
}

function markCut(text: string, width: number, fontPx: number, measure: MeasureWidth): string {
  let cut = text.replace(/…/g, "");
  while (cut.length > 0 && !fits(`${cut}…`, width, fontPx, measure)) cut = cut.slice(0, -1);
  return cut.length > 0 ? `${cut}…` : "…";
}

/**
 * Wrap a plate or rail label on word boundaries. A single word that is wider
 * than the plate keeps its start and an ellipsis, never a mid-word break.
 */
export function labelLines(
  label: string,
  width: number,
  fontPx: number,
  maxLines = 2,
  measure: MeasureWidth = estimateWidth,
): string[] {
  const words = displayLabel(label).toUpperCase().split(/\s+/).filter(Boolean);
  if (words.length === 0 || maxLines < 1) return [];
  const lines: string[] = [];
  let index = 0;
  while (index < words.length && lines.length < maxLines) {
    if (!fits(words[index], width, fontPx, measure)) {
      lines.push(ellipsizeWord(words[index], width, fontPx, measure));
      index += 1;
      continue;
    }
    let current = words[index];
    let taken = 1;
    while (index + taken < words.length && fits(`${current} ${words[index + taken]}`, width, fontPx, measure)) {
      current = `${current} ${words[index + taken]}`;
      taken += 1;
    }
    const more = index + taken < words.length;
    const rest = words.slice(index + taken);
    lines.push(more && lines.length === maxLines - 1 ? finishLine(current, rest, width, fontPx, measure) : current);
    index += taken;
    if (more && lines.length === maxLines) break;
  }
  if (index < words.length && lines.length > 0 && !lines[lines.length - 1].includes("…")) {
    lines[lines.length - 1] = markCut(lines[lines.length - 1], width, fontPx, measure);
  }
  return lines.slice(0, maxLines);
}

function wordsOf(label: string): string[] {
  return displayLabel(label).toUpperCase().split(/\s+/).filter(Boolean);
}

/** What a reader sees: the lines joined, with the gap between lines kept. */
export function renderedLabel(lines: readonly string[]): string {
  return lines.join(" ").replace(/\s+/g, " ").trim();
}

function hasToken(word: string): boolean {
  return /[A-Z0-9]/.test(word);
}

/** A word this label has that the others do not. A dash is not a word. */
function distinguisher(label: string, others: readonly string[]): string | null {
  const mine = wordsOf(label).filter(hasToken);
  const unique = mine.filter((word) => !others.every((other) => wordsOf(other).filter(hasToken).includes(word)));
  return unique.find((word) => !/^\d/.test(word)) ?? unique.find((word) => /^\d/.test(word)) ?? null;
}

function withSuffix(
  label: string,
  suffix: string,
  width: number,
  fontPx: number,
  maxLines: number,
  measure: MeasureWidth,
): string[] {
  const words = wordsOf(label).filter((word) => word !== suffix);
  const lines: string[] = [];
  let index = 0;
  const bodyLines = Math.max(0, maxLines - 1);
  while (index < words.length && lines.length < bodyLines) {
    if (!fits(words[index], width, fontPx, measure)) break;
    let current = words[index];
    let taken = 1;
    while (index + taken < words.length && fits(`${current} ${words[index + taken]}`, width, fontPx, measure)) {
      current = `${current} ${words[index + taken]}`;
      taken += 1;
    }
    lines.push(current);
    index += taken;
  }
  const kept: string[] = [];
  while (index < words.length && fits([...kept, words[index], suffix].join(" "), width, fontPx, measure)) {
    kept.push(words[index]);
    index += 1;
  }
  const dropped = index < words.length;
  const fitted = fits(suffix, width, fontPx, measure) ? suffix : ellipsizeWord(suffix, width, fontPx, measure);
  if (!dropped) {
    lines.push(kept.length > 0 ? `${kept.join(" ")} ${fitted}` : fitted);
    return lines.slice(0, maxLines);
  }
  while (kept.length > 0 && !fits(`${kept.join(" ")}… ${fitted}`, width, fontPx, measure)) kept.pop();
  const tail = kept.length > 0 ? `${kept.join(" ")}… ${fitted}` : fits(`… ${fitted}`, width, fontPx, measure) ? `… ${fitted}` : fitted;
  lines.push(tail);
  return lines.slice(0, maxLines);
}

function specOf(entry: { width: number; fontPx?: number; maxLines?: number }): { width: number; fontPx: number; maxLines: number } {
  return { width: entry.width, fontPx: entry.fontPx ?? 10, maxLines: entry.maxLines ?? 2 };
}

/**
 * Visible lines for every tile. Dedupe compares the final rendered string,
 * at each plate's own font, and retries until those strings are unique.
 */
export function plateTexts(
  entries: readonly { label: string; width: number; fontPx?: number; maxLines?: number }[],
  measure: MeasureWidth = estimateWidth,
): string[][] {
  const lines = entries.map((entry) => {
    const spec = specOf(entry);
    return labelLines(entry.label, spec.width, spec.fontPx, spec.maxLines, measure);
  });
  for (let round = 0; round < 6; round++) {
    const keys = lines.map(renderedLabel);
    const groups = new Map<string, number[]>();
    keys.forEach((id, index) => groups.set(id, [...(groups.get(id) ?? []), index]));
    let changed = false;
    for (const indexes of groups.values()) {
      if (indexes.length < 2) continue;
      indexes.forEach((index, nth) => {
        const others = indexes.filter((other) => other !== index).map((other) => entries[other].label);
        const token = distinguisher(entries[index].label, others);
        if (!token && nth === 0) return;
        const fallback = String(nth + 1 + round);
        const { width, fontPx, maxLines } = specOf(entries[index]);
        let next = withSuffix(entries[index].label, token ?? fallback, width, fontPx, maxLines, measure);
        if (renderedLabel(next) === keys[index]) {
          next = labelLines(`${renderedLabel(lines[index])} ${fallback}`, width, fontPx, maxLines, measure);
        }
        if (renderedLabel(next) !== keys[index]) {
          lines[index] = next;
          changed = true;
        }
      });
    }
    if (!changed) break;
  }
  return lines;
}
