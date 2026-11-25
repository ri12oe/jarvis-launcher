import type { CSSProperties } from "react";
import type { Aabb } from "../shared/ring";
import { formatClockParts, formatHudDate, useNow } from "./hud/time";

function boxStyle(box: Aabb): CSSProperties {
  return {
    left: box.left,
    top: box.top,
    width: box.right - box.left,
    height: box.bottom - box.top,
  };
}

/** Digital clock with a dim reflection. One-second ticks stay in this component. */
export function Clock({ box }: { box: Aabb }) {
  const now = useNow();
  const parts = formatClockParts(now);
  const face = `${parts.hh}:${parts.mm}`;
  return (
    <aside className="clock-block" style={boxStyle(box)}>
      <p className="clock-date">{formatHudDate(now)}</p>
      <time className="clock-face" dateTime={now.toISOString()}>
        <span className="clock-digits">
          {face}
          <span className="ampm">{parts.ap}</span>
        </span>
        <span className="clock-reflect" aria-hidden="true">
          {face}
        </span>
      </time>
    </aside>
  );
}
