import { useLayoutEffect, useRef } from "react";

/**
 * Slot text drawn in whatever font the machine has. The design font is narrow; a wider fallback
 * (Linux has neither Roboto Condensed nor Bahnschrift) would run past the slot's right edge, or
 * the slanted edge of a tab, so squeeze the text horizontally until it fits. Text that already fits is left alone.
 */
export function FitText({ text, slanted = false }: { text: string; slanted?: boolean }) {
  const ref = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const node = ref.current;
    const button = node?.parentElement;
    if (!node || !button) return;
    let cancelled = false;

    const fit = () => {
      if (cancelled) return;
      node.style.transform = "";
      const box = button.getBoundingClientRect();
      const inner = node.getBoundingClientRect();
      if (!box.width || !inner.width) return;
      // Tabs are clipped on a slant: 85% of the width at the top, 100% at the bottom.
      const mid = (inner.top + inner.bottom) / 2;
      const slant = slanted ? 0.85 + 0.15 * Math.max(0, Math.min(1, (mid - box.top) / box.height)) : 1;
      const limit = box.left + box.width * slant - 1;
      if (inner.right > limit) {
        node.style.transform = `scaleX(${Math.max(0.5, (limit - inner.left) / inner.width)})`;
      }
    };

    fit();
    void document.fonts?.ready.then(fit);
    window.addEventListener("resize", fit);
    return () => {
      cancelled = true;
      window.removeEventListener("resize", fit);
    };
  }, [text, slanted]);

  return (
    <span ref={ref} className="slot-text" style={{ transformOrigin: "left center" }}>
      {text}
    </span>
  );
}
