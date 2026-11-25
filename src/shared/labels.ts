/** Drop a leading "Microsoft " so plate text is the product name. */
export function displayLabel(label: string): string {
  return label.replace(/^microsoft\s+/i, "").trim();
}

/**
 * Lines a plate or rail button can show. The last line keeps a mark when the
 * name still does not fit, so two products do not collapse to the same text.
 */
export function labelLines(label: string, width: number, fontPx: number, maxLines = 2): string[] {
  const text = displayLabel(label).toUpperCase();
  const chars = Math.max(1, Math.floor(Math.max(8, width - 10) / Math.max(5, fontPx * 0.62)));
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
