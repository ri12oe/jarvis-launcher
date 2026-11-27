import { memo } from "react";
import { REACTOR, RING_COUNT, RING_PLATES } from "../../shared/mario";
import type { VoicePhase } from "../../shared/types";
import { arc, band, plate, polar, range } from "./geometry";
import { Orb } from "./Orb";
import { G } from "./shift";

const { cx, cy, plateInner, plateOuter } = REACTOR;
const STEP = 360 / RING_COUNT;
const GAP = 0.9;

export interface PlateState {
  slot: number;
  active: boolean;
  dim: boolean;
  lit: boolean;
  pressed: boolean;
}

function Glyph({ slot }: { slot: number }) {
  const mid = (slot + 0.5) * STEP;
  const [x, y] = polar(cx, cy, (plateInner + plateOuter) / 2, mid);
  return (
    <g
      transform={`translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${(mid - 30).toFixed(1)})`}
      className="plate-glyph"
    >
      <line x1="-7" y1="-3" x2="7" y2="-3" />
      <line x1="-7" y1="3" x2="7" y2="3" />
      <rect x="-4" y="-5.2" width="3" height="4.4" rx="0.6" />
      <rect x="2" y="0.8" width="3" height="4.4" rx="0.6" />
    </g>
  );
}

/** Static reactor art. Re-renders only when the plate states, phase, or CPU reading change. */
export const Reactor = memo(function Reactor({
  phase,
  cpu,
  plates,
}: {
  phase: VoicePhase;
  cpu: number | null;
  plates: readonly PlateState[];
}) {
  const state = new Map(plates.map((entry) => [entry.slot, entry]));
  return (
    <svg
      className={`reactor-art phase-${phase}`}
      viewBox="0 0 1192 670"
      width="1192"
      height="670"
      aria-hidden="true"
    >
      <defs>
        <radialGradient
          id="r-glow"
          cx={cx}
          cy={cy}
          r="175"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0" stopColor="#0b2633" stopOpacity="0.9" />
          <stop offset="0.55" stopColor="#0e4561" stopOpacity="0.85" />
          <stop offset="0.78" stopColor="#1d86b8" stopOpacity="0.55" />
          <stop offset="0.9" stopColor="#0f4058" stopOpacity="0.25" />
          <stop offset="1" stopColor="#000" stopOpacity="0" />
        </radialGradient>
        <radialGradient
          id="r-core"
          cx={cx}
          cy={cy}
          r="100"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0" stopColor="#0d1418" />
          <stop offset="0.8" stopColor="#0a1820" />
          <stop offset="1" stopColor="#0c2836" />
        </radialGradient>
        <linearGradient id="r-dash" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#c8f4ff" />
          <stop offset="1" stopColor="#5fd2f6" />
        </linearGradient>
        <filter id="r-bloom" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="2.2" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <G fx={0.5} fy={0.5}>
        {/* Outer orbit */}
        <path className="orbit-heavy" d={arc(cx, cy, 293, -122, 36)} />
        <path className="orbit-chip" d={band(cx, cy, 289, 298, -21, -17)} />
        <path className="orbit-thin" d={arc(cx, cy, 296, 50, 150)} />
        <path className="orbit-thin" d={arc(cx, cy, 296, 208, 238)} />
        <path className="orbit-thin" d={arc(cx, cy, 300, 152, 196)} />
        <circle className="orbit-hair" cx={cx} cy={cy} r="236" />
        <circle className="orbit-dark" cx={cx} cy={cy} r="226" />
        {range(72).map((index) => {
          const deg = index * 5;
          const [x0, y0] = polar(cx, cy, 229, deg);
          const [x1, y1] = polar(cx, cy, index % 3 === 0 ? 236 : 233, deg);
          return (
            <line
              key={index}
              className="orbit-tick"
              x1={x0}
              y1={y0}
              x2={x1}
              y2={y1}
            />
          );
        })}

        {/* Side brackets and labels */}
        <path className="bracket" d={arc(cx, cy, 214, 240, 300)} />
        <path className="bracket" d={arc(cx, cy, 214, 60, 120)} />
        <path className="bracket-accent" d={arc(cx, cy, 223, 84, 102)} />
        <text className="micro" x="395" y="250">
          LP
        </text>
        <text className="micro" x="390" y="427">
          OIT
        </text>
        <text className="micro" x="790" y="249">
          RPEE
        </text>
        <text className="micro" x="787" y="427">
          VIBETT
        </text>

        {/* Plates */}
        {RING_PLATES.map((kind, slot) => {
          const entry = state.get(slot);
          const className = [
            "plate",
            entry?.active ? "active" : "",
            entry?.dim ? "dim" : "",
            entry?.lit ? "lit" : "",
            entry?.pressed ? "pressed" : "",
          ]
            .filter(Boolean)
            .join(" ");
          const mid = (slot + 0.5) * STEP;
          const [tx, ty] = polar(cx, cy, (plateInner + plateOuter) / 2, mid);
          return (
            <g
              key={slot}
              className="plate-wrap"
              // The chase light reaches each plate in turn around the ring.
              style={{ animationDelay: `${((slot / RING_PLATES.length) * 2.4 - 12).toFixed(2)}s` }}
            >
              <path
                className={className}
                d={plate(
                  cx,
                  cy,
                  plateInner,
                  plateOuter,
                  slot * STEP + GAP,
                  (slot + 1) * STEP - GAP,
                )}
              />
              {kind.kind === "text" ? (
                <text
                  className="plate-text"
                  x={tx}
                  y={ty}
                  textAnchor="middle"
                  dominantBaseline="central"
                >
                  {kind.lines.length === 1
                    ? kind.lines[0]
                    : kind.lines.map((line, index) => (
                        <tspan
                          key={index}
                          x={tx}
                          dy={index === 0 ? "-0.55em" : "1.1em"}
                        >
                          {line}
                        </tspan>
                      ))}
                </text>
              ) : null}
              {kind.kind === "glyph" ? <Glyph slot={slot} /> : null}
            </g>
          );
        })}

        {/* Glow field */}
        <circle cx={cx} cy={cy} r="168" fill="url(#r-glow)" />
        <path className="inner-bracket" d={arc(cx, cy, 163, -62, -14)} />
        <path className="inner-bracket" d={arc(cx, cy, 163, 14, 62)} />
        <path className="inner-bracket" d={arc(cx, cy, 163, 118, 166)} />
        <path className="inner-bracket" d={arc(cx, cy, 163, 194, 242)} />
        <rect className="tag" x="565" y="160" width="70" height="12" rx="2" />
        <text className="micro tag-text" x="582" y="168.5">
          8.85
        </text>
        <text className="micro tag-text" x="608" y="168.5">
          FIO
        </text>
        <rect className="tag" x="565" y="484" width="70" height="12" rx="2" />
        <text className="micro tag-text" x="579" y="492.5">
          PRTH
        </text>
        <text className="micro tag-text" x="606" y="492.5">
          SET
        </text>

        {/* Tick ring */}
        <g className="tick-ring" filter="url(#r-bloom)">
          {range(150).map((index) => {
            const deg = index * 2.4;
            const long = index % 5 === 0;
            const [x0, y0] = polar(cx, cy, long ? 141 : 146, deg);
            const [x1, y1] = polar(cx, cy, long ? 158 : 154, deg);
            return <line key={index} x1={x0} y1={y0} x2={x1} y2={y1} />;
          })}
        </g>
        <circle className="dotted" cx={cx} cy={cy} r="150" />

        {/* Slanted dashes */}
        <g className="dash-ring" filter="url(#r-bloom)">
          {range(36).map((index) => {
            const a = index * 10;
            const p = [
              polar(cx, cy, 123, a),
              polar(cx, cy, 137, a + 3),
              polar(cx, cy, 137, a + 8),
              polar(cx, cy, 123, a + 5),
            ];
            return (
              <path
                key={index}
                d={`M${p.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join("L")}Z`}
                fill="url(#r-dash)"
              />
            );
          })}
        </g>
        <circle className="dash-hair" cx={cx} cy={cy} r="118" />
        <circle className="dot-ring" cx={cx} cy={cy} r="111" />

        {/* Blue ring and core */}
        <circle
          className="blue-ring"
          cx={cx}
          cy={cy}
          r="103"
          filter="url(#r-bloom)"
        />
        <circle cx={cx} cy={cy} r="99" fill="url(#r-core)" />

        {/* Plasma orb. It glows up when the wake word is heard. */}
        <Orb phase={phase} x={cx} y={cy} />
        <path className="warn" d="M597 433 L602 442 L592 442 Z" />
        <text className="micro tiny" x="592.5" y="449">
          ALL
        </text>

        {/* Satellite dials. The bottom one shows the CPU reading that used to sit in the centre. */}
        <circle className="sat" cx="348" cy="232" r="13" />
        <circle className="sat" cx="350" cy="427" r="13" />
        <circle className="sat" cx="845" cy="235" r="13" />
        <circle className="sat cpu-dial" cx="600" cy="598" r="15" />
        <text
          className="core-value"
          x="600"
          y="598.5"
          textAnchor="middle"
          dominantBaseline="central"
        >
          {cpu == null ? "--" : String(cpu)}
        </text>
        <text className="micro cpu-label" x="600" y="622" textAnchor="middle">
          CPU %
        </text>
        <circle className="g-dial" cx="600" cy="72" r="15" />
        <circle className="g-dial-inner" cx="600" cy="72" r="11" />
        <text
          className="g-text"
          x="600"
          y="72.5"
          textAnchor="middle"
          dominantBaseline="central"
        >
          G
        </text>
        <text className="micro" x="572" y="75">
          DB
        </text>
        <text className="micro" x="620" y="75">
          BB
        </text>
        <circle className="e-dial" cx="845" cy="430" r="14" />
        <circle className="e-dial-inner" cx="845" cy="430" r="10" />
        <text
          className="g-text e"
          x="845"
          y="430.5"
          textAnchor="middle"
          dominantBaseline="central"
        >
          E
        </text>
        <text className="micro" x="838" y="413">
          LEIR
        </text>
        <text className="micro" x="832" y="459">
          SOLIYS
        </text>
        <text className="micro" x="818" y="304">
          EPAC
        </text>
        <text className="micro" x="818" y="329">
          SAIE 1L
        </text>
        <text className="micro" x="818" y="352">
          E3 3BC
        </text>

        {/* Chips scattered on the orbit */}
        {[-42, -30, 24, 33, 44, 128, 141, 156, 168, 204, 216, 231].map(
          (deg, index) => {
            const [x, y] = polar(cx, cy, index % 2 === 0 ? 262 : 274, deg);
            return (
              <g
                key={deg}
                className="chip"
                transform={`translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${deg + 90})`}
              >
                <rect x="-5" y="-2.6" width="4" height="5.2" />
                <rect x="1" y="-2.6" width="4" height="5.2" />
                <line x1="-6" y1="0" x2="6" y2="0" />
              </g>
            );
          },
        )}
      </G>
    </svg>
  );
});
