import {
  LABEL_FONT,
  LABEL_LINE,
  LABEL_MAX_WIDTH,
  LABEL_TRACKING_EM,
  measureLabel,
  type LabelMetrics,
} from "../shared/ring";

const HUD_FONT = `${LABEL_FONT}px "Cascadia Mono", "DejaVu Sans Mono", Consolas, ui-monospace, monospace`;

const cache = new Map<string, LabelMetrics>();
let context: CanvasRenderingContext2D | null | undefined;

function canvasMetrics(text: string): LabelMetrics | null {
  if (typeof document === "undefined") return null;
  if (context === undefined) {
    const canvas = document.createElement("canvas");
    context = canvas.getContext("2d");
  }
  if (!context) return null;
  context.font = HUD_FONT;
  const chars = [...text.toUpperCase()];
  const count = Math.max(1, chars.length);
  const tracking = LABEL_FONT * LABEL_TRACKING_EM;
  const measured = context.measureText(chars.join("")).width;
  if (!Number.isFinite(measured) || measured <= 0) return null;
  const raw = measured + Math.max(0, count - 1) * tracking;
  return {
    width: Math.min(raw, LABEL_MAX_WIDTH),
    height: LABEL_LINE,
    ellipsis: raw > LABEL_MAX_WIDTH + 0.5,
  };
}

/** Canvas measurement of the HUD font. Falls back to the pure monospace estimate. */
export function measureHudLabel(text: string): LabelMetrics {
  const cached = cache.get(text);
  if (cached) return cached;
  const metrics = canvasMetrics(text) ?? measureLabel(text);
  cache.set(text, metrics);
  return metrics;
}
