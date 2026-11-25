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

function trailingMark(label: string): string | null {
  return label.match(/(\d{2,4}(?:\.\d+)?)\s*$/)?.[1] ?? null;
}

function fits(text: string, width: number, fontPx: number, measure: MeasureWidth): boolean {
  return measure(text, fontPx) <= Math.max(8, width - 8);
}

function ellipsizeWord(word: string, width: number, fontPx: number, measure: MeasureWidth): string {
  if (fits(word, width, fontPx, measure)) return word;
  let cut = word;
  while (cut.length > 4 && !fits(`${cut}…`, width, fontPx, measure)) cut = cut.slice(0, -1);
  return cut.length < word.length ? `${cut}…` : cut;
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
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (fits(next, width, fontPx, measure)) {
      current = next;
      continue;
    }
    if (current) {
      lines.push(current);
      current = "";
      if (lines.length === maxLines) break;
    }
    if (lines.length === maxLines - 1) {
      current = word;
      break;
    }
    if (fits(word, width, fontPx, measure)) current = word;
    else {
      lines.push(ellipsizeWord(word, width, fontPx, measure));
      current = "";
      if (lines.length === maxLines) break;
    }
  }
  if (current && lines.length < maxLines) {
    lines.push(fits(current, width, fontPx, measure) ? current : ellipsizeWord(current, width, fontPx, measure));
  }
  return lines.slice(0, maxLines);
}

function withSuffix(
  label: string,
  suffix: string,
  width: number,
  fontPx: number,
  maxLines: number,
  measure: MeasureWidth,
): string[] {
  const base = displayLabel(label).replace(/\s+\d{2,4}(?:\.\d+)?\s*$/, "").trim();
  const lines = labelLines(`${base} ${suffix}`, width, fontPx, maxLines, measure);
  const shown = lines.join(" ");
  if (shown.includes(suffix)) return lines;
  if (lines.length === 0) return [suffix];
  const next = [...lines];
  const words = next[next.length - 1].replace(/…$/, "").split(" ").filter(Boolean);
  while (words.length > 0 && !fits(`${words.join(" ")} ${suffix}`, width, fontPx, measure)) words.pop();
  next[next.length - 1] = words.length > 0 ? `${words.join(" ")} ${suffix}` : suffix;
  return next;
}

/** Visible lines for every tile. A duplicate keeps its name and gains a suffix. */
export function plateTexts(
  entries: readonly { label: string; width: number; fontPx?: number; maxLines?: number }[],
  measure: MeasureWidth = estimateWidth,
): string[][] {
  const font = (index: number) => entries[index].fontPx ?? 10;
  const lines = entries.map((entry) =>
    labelLines(entry.label, entry.width, entry.fontPx ?? 10, entry.maxLines ?? 2, measure),
  );
  const key = (row: string[]) => row.join("\n");
  const groups = new Map<string, number[]>();
  lines.forEach((row, index) => {
    const id = key(row);
    groups.set(id, [...(groups.get(id) ?? []), index]);
  });
  for (const indexes of groups.values()) {
    if (indexes.length < 2) continue;
    indexes.forEach((index, nth) => {
      if (nth === 0) return;
      const suffix = trailingMark(entries[index].label) ?? String(nth + 1);
      lines[index] = withSuffix(entries[index].label, suffix, entries[index].width, font(index), entries[index].maxLines ?? 2, measure);
    });
  }
  return lines;
}
