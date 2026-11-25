import type { CSSProperties } from "react";

export function MediaStrip({ style }: { style?: CSSProperties }) {
  return (
    <div className="media" style={style} aria-hidden="true">
      <span className="icon-row">
        {Array.from({ length: 5 }, (_, index) => (
          <span key={index} />
        ))}
      </span>
      <button type="button" disabled>
        ‹
      </button>
      <button type="button" disabled>
        ▶
      </button>
      <button type="button" disabled>
        ›
      </button>
      <span>--:--</span>
      <span className="dial" />
    </div>
  );
}
