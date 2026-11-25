import type { CSSProperties } from "react";

/** Non-functional. Typing still filters tiles from the keyboard. */
export function SearchPill({ style }: { style?: CSSProperties }) {
  return (
    <div className="search-pill" style={style} aria-hidden="true">
      <span className="search-mark" aria-hidden="true" />
      <span>Search</span>
    </div>
  );
}
