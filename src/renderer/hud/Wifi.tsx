import type { CSSProperties } from "react";

export function Wifi({ style }: { style?: CSSProperties }) {
  return (
    <div className="wifi" aria-hidden="true" style={style}>
      <div className="wifi-ring">
        <span>--</span>
      </div>
      <p>wifi</p>
    </div>
  );
}
