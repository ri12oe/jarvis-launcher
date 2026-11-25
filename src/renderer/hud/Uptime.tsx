import type { CSSProperties } from "react";

export function Uptime({ style }: { style?: CSSProperties }) {
  return (
    <p className="uptime" style={style} aria-hidden="true">
      -- UP
    </p>
  );
}
