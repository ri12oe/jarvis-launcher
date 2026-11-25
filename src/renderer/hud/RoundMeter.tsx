import type { CSSProperties } from "react";

/** Placeholder disk for RAM or BIN. The reading stays "--". */
export function RoundMeter({ name, style }: { name: string; style?: CSSProperties }) {
  return (
    <div className="round-meter" style={style} aria-hidden="true">
      <span className="meter-ring">
        <span className="meter-value">--</span>
      </span>
      <span className="meter-name">{name}</span>
    </div>
  );
}
