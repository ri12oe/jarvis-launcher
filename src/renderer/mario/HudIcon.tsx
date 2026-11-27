import type { ReactNode } from "react";
import type { HudIconKind } from "../../shared/hud-icons";

/**
 * Futuristic HUD icons: a glowing chamfered frame with a neon line glyph.
 * One glyph per kind of app, drawn on a 48 unit grid, so every icon has the
 * same weight and they read as one set at 20 to 50 pixels.
 */

const G = "#c9fbff";

/** Glyphs, drawn with the shared stroke in the 13 to 35 box. */
const GLYPHS: Record<HudIconKind, ReactNode> = {
  browser: (
    <>
      <circle cx="24" cy="24" r="10" />
      <ellipse cx="24" cy="24" rx="4.4" ry="10" />
      <path d="M14.6 20.5h18.8M14.6 27.5h18.8" />
      <ellipse
        className="thin"
        cx="24"
        cy="24"
        rx="15"
        ry="5"
        transform="rotate(-28 24 24)"
      />
    </>
  ),
  files: (
    <>
      <path d="M12.5 17.5v13a2 2 0 0 0 2 2h19a2 2 0 0 0 2-2V21a2 2 0 0 0-2-2H24l-2.6-3.2h-7a2 2 0 0 0-1.9 1.7z" />
      <path className="thin" d="M16 24h16" />
    </>
  ),
  music: (
    <>
      <path d="M20.5 30.5V18l12-3v12.5" />
      <circle cx="18" cy="30.5" r="2.6" />
      <circle cx="30" cy="27.5" r="2.6" />
      <path className="thin" d="M20.5 21.8l12-3" />
    </>
  ),
  mail: (
    <>
      <rect x="12.5" y="16" width="23" height="16" rx="2" />
      <path d="M13 17.5l11 8 11-8" />
      <path className="thin" d="M13.5 31l8-6.5M34.5 31l-8-6.5" />
    </>
  ),
  repo: (
    <>
      <circle cx="18" cy="15.5" r="2.6" />
      <circle cx="18" cy="32.5" r="2.6" />
      <circle cx="30.5" cy="20" r="2.6" />
      <path d="M18 18.1v11.8M30.5 22.6c0 4.6-12.5 2.8-12.5 7.2" />
    </>
  ),
  social: (
    <>
      <circle cx="24" cy="24" r="10.5" />
      <path d="M21.2 18.5l-1.6 11M28.4 18.5l-1.6 11M18 21.6h12.6M17.4 26.4h12.6" />
    </>
  ),
  chat: (
    <>
      <path d="M13 17a2.5 2.5 0 0 1 2.5-2.5h17A2.5 2.5 0 0 1 35 17v10a2.5 2.5 0 0 1-2.5 2.5H21l-5.5 4.5v-4.5A2.5 2.5 0 0 1 13 27z" />
      <path className="dot" d="M19 22h.01M24 22h.01M29 22h.01" />
    </>
  ),
  "ai-spark": (
    <>
      <path d="M22 13.5c.9 5.6 2.9 7.6 8.5 8.5-5.6.9-7.6 2.9-8.5 8.5-.9-5.6-2.9-7.6-8.5-8.5 5.6-.9 7.6-2.9 8.5-8.5z" />
      <path d="M31 27.5c.4 2.4 1.2 3.2 3.6 3.6-2.4.4-3.2 1.2-3.6 3.6-.4-2.4-1.2-3.2-3.6-3.6 2.4-.4 3.2-1.2 3.6-3.6z" />
      <path className="dot" d="M32.5 15.5h.01" />
    </>
  ),
  "ai-chat": (
    <>
      <path d="M13 16.5a2.5 2.5 0 0 1 2.5-2.5h17a2.5 2.5 0 0 1 2.5 2.5v10a2.5 2.5 0 0 1-2.5 2.5H22l-5.5 4.5V29h-1A2.5 2.5 0 0 1 13 26.5z" />
      <path d="M24 16.8c.5 2.9 1.5 3.9 4.4 4.4-2.9.5-3.9 1.5-4.4 4.4-.5-2.9-1.5-3.9-4.4-4.4 2.9-.5 3.9-1.5 4.4-4.4z" />
    </>
  ),
  "ai-orbit": (
    <>
      <circle className="fill" cx="24" cy="24" r="2.8" />
      <ellipse
        cx="24"
        cy="24"
        rx="11.5"
        ry="4.6"
        transform="rotate(35 24 24)"
      />
      <ellipse
        cx="24"
        cy="24"
        rx="11.5"
        ry="4.6"
        transform="rotate(-35 24 24)"
      />
      <path className="dot" d="M33.5 17.2h.01" />
    </>
  ),
  "ai-neural": (
    <>
      <path d="M24 13.5l9.1 5.25v10.5L24 34.5l-9.1-5.25v-10.5z" />
      <path className="thin" d="M24 13.5V24m0 0l9.1 5.25M24 24l-9.1 5.25" />
      <circle className="fill" cx="24" cy="24" r="2.4" />
      <circle className="fill" cx="24" cy="13.5" r="1.6" />
      <circle className="fill" cx="33.1" cy="29.25" r="1.6" />
      <circle className="fill" cx="14.9" cy="29.25" r="1.6" />
    </>
  ),
  code: (
    <>
      <path d="M19 17.5L12.5 24l6.5 6.5M29 17.5l6.5 6.5-6.5 6.5M26 15l-4 18" />
    </>
  ),
  document: (
    <>
      <path d="M16 12.5h11l6 6v16a1.5 1.5 0 0 1-1.5 1.5h-15.5a1.5 1.5 0 0 1-1.5-1.5v-20.5a1.5 1.5 0 0 1 1.5-1.5z" />
      <path d="M27 12.5v6h6" />
      <path className="thin" d="M19 23.5h10M19 27.5h10M19 31.5h6" />
    </>
  ),
  spreadsheet: (
    <>
      <rect x="13" y="14" width="22" height="20" rx="2" />
      <path className="thin" d="M13 20.5h22M13 27h22M20.5 14v20M27.5 14v20" />
    </>
  ),
  slides: (
    <>
      <rect x="12.5" y="13.5" width="23" height="15" rx="1.5" />
      <path d="M24 28.5v5M19.5 35l4.5-2 4.5 2" />
      <path className="thin" d="M17 24l4-4 3 3 5-5.5" />
    </>
  ),
  notes: (
    <>
      <rect x="14" y="13.5" width="20" height="22" rx="2" />
      <path d="M19 11.5v4M24 11.5v4M29 11.5v4" />
      <path className="thin" d="M18 22h12M18 26.5h12M18 31h8" />
    </>
  ),
  pdf: (
    <>
      <path d="M16 12.5h11l6 6v16a1.5 1.5 0 0 1-1.5 1.5h-15.5a1.5 1.5 0 0 1-1.5-1.5v-20.5a1.5 1.5 0 0 1 1.5-1.5z" />
      <path d="M27 12.5v6h6" />
      <path
        className="thin"
        d="M18.5 31c3-5 5-9.5 4.5-11.5s-2.5-.5-1 3 5.5 6.5 9 6.5-1-2.5-7-1.5-5.5 3.5-5.5 3.5z"
      />
    </>
  ),
  design: (
    <>
      <path d="M24 13l7 11.5-7 11-7-11z" />
      <circle className="fill" cx="24" cy="25" r="2" />
      <path className="thin" d="M24 13v10M12 15.5h6M30 15.5h6" />
      <circle className="fill" cx="12" cy="15.5" r="1.4" />
      <circle className="fill" cx="36" cy="15.5" r="1.4" />
    </>
  ),
  video: (
    <>
      <rect x="12" y="15" width="24" height="18" rx="3" />
      <path className="fill" d="M21.5 19.8v8.4l7.2-4.2z" />
    </>
  ),
  call: (
    <>
      <rect x="11.5" y="17" width="17" height="14" rx="2.5" />
      <path d="M28.5 21.5l7-3.5v12l-7-3.5" />
      <circle className="thin" cx="20" cy="22.5" r="2.2" />
      <path className="thin" d="M16 28.5c1-2 2.4-2.8 4-2.8s3 .8 4 2.8" />
    </>
  ),
  game: (
    <>
      <path d="M17.5 17.5h13a5.5 5.5 0 0 1 5.4 4.5l1.1 6.5a3 3 0 0 1-5.3 2.4l-2.4-2.9h-10.6l-2.4 2.9a3 3 0 0 1-5.3-2.4l1.1-6.5a5.5 5.5 0 0 1 5.4-4.5z" />
      <path className="thin" d="M18 21v5M15.5 23.5h5" />
      <path className="dot" d="M29 22h.01M31.5 24.5h.01" />
    </>
  ),
  terminal: (
    <>
      <rect x="12" y="14" width="24" height="20" rx="2.5" />
      <path d="M16.5 21l4 3.5-4 3.5M23 29h8" />
    </>
  ),
  settings: (
    <>
      <circle cx="24" cy="24" r="4" />
      <path d="M24 12.5v3.5M24 32v3.5M12.5 24H16M32 24h3.5M15.9 15.9l2.5 2.5M29.6 29.6l2.5 2.5M15.9 32.1l2.5-2.5M29.6 18.4l2.5-2.5" />
      <circle className="thin" cx="24" cy="24" r="8.5" />
    </>
  ),
  store: (
    <>
      <path d="M14 19h20l-1.5 15.5h-17z" />
      <path d="M19.5 19v-2a4.5 4.5 0 0 1 9 0v2" />
      <path className="thin" d="M19 25h10" />
    </>
  ),
  photos: (
    <>
      <rect x="12" y="14" width="24" height="20" rx="2.5" />
      <path d="M13 31l7-7.5 5 5 3-3 7 6" />
      <circle cx="29" cy="20" r="2" />
    </>
  ),
  camera: (
    <>
      <path d="M12.5 19.5a2 2 0 0 1 2-2h4l2-3h7l2 3h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-19a2 2 0 0 1-2-2z" />
      <circle cx="24" cy="25" r="4.8" />
    </>
  ),
  calendar: (
    <>
      <rect x="13" y="15" width="22" height="20" rx="2.5" />
      <path d="M13 21h22M18.5 12.5v5M29.5 12.5v5" />
      <path
        className="dot"
        d="M18.5 26h.01M24 26h.01M29.5 26h.01M18.5 30.5h.01M24 30.5h.01"
      />
    </>
  ),
  calculator: (
    <>
      <rect x="15" y="12.5" width="18" height="23" rx="2.5" />
      <rect className="thin" x="18" y="15.5" width="12" height="5" rx="1" />
      <path
        className="dot"
        d="M19 25h.01M24 25h.01M29 25h.01M19 30h.01M24 30h.01M29 30h.01"
      />
    </>
  ),
  cloud: (
    <>
      <path d="M17.5 32a5.5 5.5 0 0 1-.7-10.95 7.5 7.5 0 0 1 14.6 1.2 4.9 4.9 0 0 1-.4 9.75z" />
      <path className="thin" d="M24 24.5v6M21.5 28l2.5 2.5 2.5-2.5" />
    </>
  ),
  maps: (
    <>
      <path d="M24 35s-8.5-8.2-8.5-14.5a8.5 8.5 0 0 1 17 0C32.5 26.8 24 35 24 35z" />
      <circle cx="24" cy="20.5" r="3" />
    </>
  ),
  security: (
    <>
      <path d="M24 12l10 3.8v7.2c0 6.2-4.2 10.6-10 13-5.8-2.4-10-6.8-10-13v-7.2z" />
      <path d="M19.5 24l3.2 3.2 5.8-6" />
    </>
  ),
  app: (
    <>
      <rect x="14" y="14" width="8" height="8" rx="1.5" />
      <rect x="26" y="14" width="8" height="8" rx="1.5" />
      <rect x="14" y="26" width="8" height="8" rx="1.5" />
      <rect x="26" y="26" width="8" height="8" rx="1.5" />
    </>
  ),
};

/** Chamfered octagon frame. */
const FRAME = "M10 2.5h28l7.5 7.5v28l-7.5 7.5H10L2.5 38V10z";
const INNER = "M11.5 6h25L42 11.5v25L36.5 42h-25L6 36.5v-25z";

export function HudIcon({
  kind,
  className,
}: {
  kind: HudIconKind;
  className?: string;
}) {
  return (
    <svg
      className={`hud-icon${className ? ` ${className}` : ""}`}
      viewBox="0 0 48 48"
      aria-hidden="true"
      data-kind={kind}
    >
      <defs>
        <radialGradient id="hud-icon-bg" cx="50%" cy="38%" r="70%">
          <stop offset="0" stopColor="#0f3b55" />
          <stop offset="0.6" stopColor="#071a28" />
          <stop offset="1" stopColor="#030b12" />
        </radialGradient>
        <linearGradient id="hud-icon-rim" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#8af3ff" />
          <stop offset="0.5" stopColor="#2aa8e0" />
          <stop offset="1" stopColor="#5ce1ff" />
        </linearGradient>
      </defs>
      <path
        className="hud-icon-frame"
        d={FRAME}
        fill="url(#hud-icon-bg)"
        stroke="url(#hud-icon-rim)"
      />
      <path className="hud-icon-inner" d={INNER} />
      <path className="hud-icon-ticks" d="M4 15v-5l6-6h5M44 33v5l-6 6h-5" />
      <g className="hud-icon-glyph" stroke={G}>
        {GLYPHS[kind]}
      </g>
    </svg>
  );
}
