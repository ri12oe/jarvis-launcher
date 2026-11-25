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

function stemOf(text: string): string {
  return text.replace(/…/g, "").replace(/\s+/g, " ").trim();
}

/** True when the reader cannot tell the two labels apart, including a cut-off prefix. */
export function labelsCollide(a: string, b: string): boolean {
  const left = stemOf(a);
  const right = stemOf(b);
  if (!left || !right) return false;
  return left === right || left.startsWith(right) || right.startsWith(left);
}

/** Font size that lets the longest word fit the plate. Shared by the HUD and the tests. */
export function fitLabelFont(
  label: string,
  width: number,
  maxPx: number,
  minPx: number,
  measure: MeasureWidth = estimateWidth,
): number {
  const words = wordsOf(label);
  const longest = words.reduce((best, word) => (word.length > best.length ? word : best), words[0] ?? "");
  let px = maxPx;
  while (px > minPx && longest && measure(longest, px) > Math.max(8, width - 4)) px -= 0.5;
  return px;
}

/** Width, font, and line count for one placed tile. */
export function labelFit(
  label: string,
  zone: string | undefined,
  buttonWidth: number,
  buttonHeight: number,
  measure: MeasureWidth = estimateWidth,
): { width: number; fontPx: number; maxLines: number } {
  const width =
    zone === "segment" ? Math.max(48, buttonWidth - 12) : zone === "tab" ? Math.max(24, buttonWidth) : Math.max(40, buttonWidth - 34);
  const maxPx = zone === "segment" ? Math.min(13, Math.max(10, buttonHeight * 0.28)) : 12;
  const minPx = zone === "tab" ? 8 : 9;
  return { width, fontPx: fitLabelFont(label, width, maxPx, minPx, measure), maxLines: 2 };
}

/** A word this label has that the others do not. A dash is not a word. */
function distinguisher(label: string, others: readonly string[]): string | null {
  const mine = wordsOf(label).filter(hasToken);
  const unique = mine.filter((word) => !others.every((other) => wordsOf(other).filter(hasToken).includes(word)));
  return unique.find((word) => !/^\d/.test(word)) ?? unique.find((word) => /^\d/.test(word)) ?? null;
}

function specOf(entry: { width: number; fontPx?: number; maxLines?: number }): { width: number; fontPx: number; maxLines: number } {
  return { width: entry.width, fontPx: entry.fontPx ?? 10, maxLines: entry.maxLines ?? 2 };
}

function showsToken(lines: readonly string[], token: string): boolean {
  return stemOf(renderedLabel(lines)).split(" ").includes(token);
}

/** Drop leading words until `token` is actually visible. */
function showToken(
  label: string,
  token: string,
  width: number,
  fontPx: number,
  maxLines: number,
  measure: MeasureWidth,
): string[] {
  const words = wordsOf(label).filter(hasToken);
  let fallback = labelLines(token, width, fontPx, maxLines, measure);
  for (let drop = 0; drop <= words.length; drop++) {
    const rest = words.slice(drop);
    const seq = rest.includes(token) ? rest : [...rest, token];
    if (seq.length === 0) continue;
    const lines = labelLines(seq.join(" "), width, fontPx, maxLines, measure);
    if (showsToken(lines, token)) return lines;
    fallback = lines;
  }
  return fallback;
}

function collisionGroups(texts: readonly string[]): number[][] {
  const parent = texts.map((_, index) => index);
  const find = (index: number): number => (parent[index] === index ? index : (parent[index] = find(parent[index])));
  const unite = (left: number, right: number) => {
    parent[find(left)] = find(right);
  };
  for (let i = 0; i < texts.length; i++) {
    for (let j = i + 1; j < texts.length; j++) {
      if (labelsCollide(texts[i], texts[j])) unite(i, j);
    }
  }
  const groups = new Map<number, number[]>();
  texts.forEach((_, index) => {
    const root = find(index);
    groups.set(root, [...(groups.get(root) ?? []), index]);
  });
  return [...groups.values()].filter((group) => group.length > 1);
}

const FRESH = ["ALT", "ALSO", "COPY", "EXTRA", "OTHER", "MORE", "NEXT", "PLUS", "MARK", "NOTE"];

function takeFresh(used: Set<string>): string {
  for (const word of FRESH) {
    if (!used.has(word)) {
      used.add(word);
      return word;
    }
  }
  for (let n = 2; n < 80; n++) {
    const word = `ALT${n}`;
    if (!used.has(word)) {
      used.add(word);
      return word;
    }
  }
  const word = `ALT${used.size}`;
  used.add(word);
  return word;
}

/**
 * Visible lines for every tile. Two labels collide when the reader sees the
 * same text, or one is only a cut-off prefix of the other.
 */
export function plateTexts(
  entries: readonly { label: string; width: number; fontPx?: number; maxLines?: number }[],
  measure: MeasureWidth = estimateWidth,
): string[][] {
  const lines = entries.map((entry) => {
    const spec = specOf(entry);
    return labelLines(entry.label, spec.width, spec.fontPx, spec.maxLines, measure);
  });
  const used = new Set<string>();
  for (const entry of entries) {
    for (const word of wordsOf(entry.label)) if (hasToken(word)) used.add(word);
  }
  for (let round = 0; round < 8; round++) {
    const groups = collisionGroups(lines.map(renderedLabel));
    if (groups.length === 0) break;
    let changed = false;
    for (const indexes of groups) {
      indexes.forEach((index) => {
        const others = indexes.filter((other) => other !== index).map((other) => entries[other].label);
        const { width, fontPx, maxLines } = specOf(entries[index]);
        let token = distinguisher(entries[index].label, others) ?? takeFresh(used);
        let next = showToken(entries[index].label, token, width, fontPx, maxLines, measure);
        const siblings = indexes
          .filter((other) => other !== index)
          .map((other) => renderedLabel(lines[other]));
        if (siblings.some((text) => labelsCollide(renderedLabel(next), text))) {
          token = takeFresh(used);
          next = showToken(entries[index].label, token, width, fontPx, maxLines, measure);
        }
        if (renderedLabel(next) !== renderedLabel(lines[index])) {
          lines[index] = next;
          changed = true;
        }
      });
    }
    if (!changed) break;
  }
  return lines;
}
