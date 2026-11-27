import { useMemo } from "react";
import type { VoicePhase } from "../../shared/types";
import { REACTOR } from "../../shared/mario";
import { particles, type MotionMode } from "../../shared/motion";
import { G, Shift } from "./shift";

const { cx, cy } = REACTOR;

/** Light pulses that run around the reactor's orbit lines, like the wallpaper's traces. */
const COMETS = [
  { r: 236, duration: 11, delay: 0, reverse: false, length: 5 },
  { r: 236, duration: 11, delay: -5.5, reverse: false, length: 3 },
  { r: 226, duration: 17, delay: -3, reverse: true, length: 4 },
  { r: 300, duration: 23, delay: -9, reverse: false, length: 3 },
  { r: 150, duration: 7, delay: -1, reverse: true, length: 6 },
];

/**
 * The moving layer drawn over the HUD art: radar sweep, orbit pulses, voice
 * ripples, drifting particles, a slow scan line, and the boot-up scan. It
 * never takes clicks.
 */
export function Motion({ mode, phase, booting }: { mode: MotionMode; phase: VoicePhase; booting: boolean }) {
  const dots = useMemo(() => particles(34), []);
  if (mode === "off") return null;
  return (
    <div className={`motion motion-${mode} phase-${phase}`} aria-hidden="true">
      {mode === "full" ? (
        <div className="motion-particles">
          {dots.map((dot, index) => (
            <i
              key={index}
              style={{
                left: dot.x,
                top: dot.y,
                width: dot.size,
                height: dot.size,
                animationDuration: `${dot.duration}s`,
                animationDelay: `${dot.delay}s`,
                ["--drift" as string]: `${-dot.drift}px`,
              }}
            />
          ))}
        </div>
      ) : null}

      <svg className="motion-svg" width="1192" height="670" viewBox="0 0 1192 670">
        <defs>
          <radialGradient id="m-ripple">
            <stop offset="0.82" stopColor="#57d4ff" stopOpacity="0" />
            <stop offset="0.97" stopColor="#8fe6ff" stopOpacity="0.55" />
            <stop offset="1" stopColor="#8fe6ff" stopOpacity="0" />
          </radialGradient>
        </defs>
        <G fx={0.5} fy={0.5}>
          {COMETS.map((comet, index) => (
            <circle
              key={index}
              className={`comet${comet.reverse ? " reverse" : ""}`}
              cx={cx}
              cy={cy}
              r={comet.r}
              pathLength={100}
              strokeDasharray={`${comet.length} ${100 - comet.length}`}
              style={{ animationDuration: `${comet.duration}s`, animationDelay: `${comet.delay}s` }}
            />
          ))}
          {/* Voice ripples: slow while listening, quick while speaking. */}
          <circle className="ripple r1" cx={cx} cy={cy} r={112} fill="url(#m-ripple)" />
          <circle className="ripple r2" cx={cx} cy={cy} r={112} fill="url(#m-ripple)" />
        </G>
      </svg>

      {/* Radar sweep in the band between the light segments and the dotted ring. */}
      <Shift fx={0.5} fy={0.5}>
        <div className="motion-sweep" style={{ left: cx - 160, top: cy - 160 }} />
      </Shift>

      {mode === "full" ? <div className="motion-scan" /> : null}
      {booting ? <div className="motion-boot-scan" /> : null}
    </div>
  );
}
