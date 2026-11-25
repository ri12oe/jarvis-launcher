/** Drop a leading "Microsoft " so plate text is the product name. */
export function displayLabel(label: string): string {
  return label.replace(/^microsoft\s+/i, "").trim();
}

function trailingMark(label: string): string | null {
  return label.match(/(\d{2,4}(?:\.\d+)?)\s*$/)?.[1] ?? null;
}

/**
 * Lines a plate or rail button can show. The last line keeps a mark when the
 * name still does not fit, so two products do not collapse to the same text.
 */
function charsFor(width: number, fontPx: number): number {
  return Math.max(1, Math.floor(Math.max(8, width - 16) / Math.max(7, fontPx * 1.05)));
}

export function labelLines(label: string, width: number, fontPx: number, maxLines = 2): string[] {
  const text = displayLabel(label).toUpperCase();
  const chars = charsFor(width, fontPx);
  const lines: string[] = [];
  let rest = text;
  for (let line = 0; line < maxLines && rest.length > 0; line++) {
    const last = line === maxLines - 1;
    if (rest.length <= chars) {
      lines.push(rest);
      rest = "";
    } else if (last) {
      lines.push(`${rest.slice(0, Math.max(1, chars - 1))}…`);
      rest = "";
    } else {
      lines.push(rest.slice(0, chars));
      rest = rest.slice(chars).trimStart();
    }
  }
  return lines;
}

function keepMark(lines: string[], mark: string, width: number, fontPx: number): string[] {
  const chars = charsFor(width, fontPx);
  const next = lines.length > 0 ? [...lines] : [""];
  const room = Math.max(1, chars);
  const short = mark.length < room ? mark : mark.slice(-Math.max(1, room - 1));
  const last = next[next.length - 1].replace(/…$/, "");
  const joined = `${last} ${short}`;
  if (joined.length <= room) next[next.length - 1] = joined;
  else {
    const head = room - short.length - 1;
    next[next.length - 1] = head > 0 ? `${last.slice(0, head)}…${short}` : short.slice(0, room);
  }
  return next;
}

/** Visible lines for every tile. Colliding lines keep a year, version, or index. */
export function plateTexts(
  entries: readonly { label: string; width: number; fontPx?: number; maxLines?: number }[],
): string[][] {
  const font = (index: number) => entries[index].fontPx ?? 10;
  const lines = entries.map((entry) => labelLines(entry.label, entry.width, entry.fontPx ?? 10, entry.maxLines ?? 2));
  const key = (row: string[]) => row.join("\n");
  const groups = new Map<string, number[]>();
  lines.forEach((row, index) => {
    const id = key(row);
    groups.set(id, [...(groups.get(id) ?? []), index]);
  });
  for (const indexes of groups.values()) {
    if (indexes.length < 2) continue;
    for (const [nth, index] of indexes.entries()) {
      const mark = trailingMark(entries[index].label) ?? String(nth + 1);
      lines[index] = keepMark(lines[index], mark, entries[index].width, font(index));
    }
  }
  const used = new Set<string>();
  const marks = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  lines.forEach((row, index) => {
    if (!used.has(key(row))) {
      used.add(key(row));
      return;
    }
    for (const mark of marks) {
      const next = keepMark(row, mark, entries[index].width, font(index));
      if (!used.has(key(next))) {
        lines[index] = next;
        used.add(key(next));
        return;
      }
    }
  });
  return lines;
}
