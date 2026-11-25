import type { VoicePhase } from "../../shared/types";
import { reactorSlots, type HudFrame } from "../../shared/ring";

function arc(radius: number, start: number, end: number): string {
  const a = ((start - 90) * Math.PI) / 180;
  const b = ((end - 90) * Math.PI) / 180;
  const x1 = 100 + radius * Math.cos(a);
  const y1 = 100 + radius * Math.sin(a);
  const x2 = 100 + radius * Math.cos(b);
  const y2 = 100 + radius * Math.sin(b);
  const large = end - start > 180 ? 1 : 0;
  return `M ${x1} ${y1} A ${radius} ${radius} 0 ${large} 1 ${x2} ${y2}`;
}

export function ReactorFace({ frame, phase }: { frame: HudFrame; phase: VoicePhase }) {
  const mark = phase === "idle" ? "standby" : phase;
  const size = frame.reactor;
  const slots = reactorSlots(frame);
  return (
    <div
      className="reactor"
      style={{ width: size, height: size, left: frame.cx - size / 2, top: frame.cy - size / 2 }}
    >
      {slots.map((slot, index) => (
        <span
          key={index}
          className="plate-btn"
          style={{
            left: slot.x - frame.cx + size / 2,
            top: slot.y - frame.cy + size / 2,
            width: slot.width,
            height: slot.height,
            transform: `translate(-50%, -50%) rotate(${slot.rotation}deg)`,
          }}
        />
      ))}
      <svg className="reactor-svg" viewBox="0 0 200 200">
        <circle className="glow-ring" cx="100" cy="100" r="97" />
        <circle className="hairline" cx="100" cy="100" r="93" />
        <circle className="hairline dim" cx="100" cy="100" r="78" />
        {Array.from({ length: 120 }, (_, index) => {
          const angle = (index / 120) * Math.PI * 2;
          const inner = index % 10 === 0 ? 88 : index % 5 === 0 ? 90 : 91.4;
          return (
            <line
              key={index}
              className={index % 10 === 0 ? "tick major" : "tick"}
              x1={100 + Math.sin(angle) * inner}
              y1={100 - Math.cos(angle) * inner}
              x2={100 + Math.sin(angle) * 96.2}
              y2={100 - Math.cos(angle) * 96.2}
            />
          );
        })}
        <path className="sweep" d={arc(97, 200, 340)} />
        <path className="sweep" d={arc(97, 20, 160)} />
        {[
          { label: "G", degree: 0 },
          { label: "C", degree: 90 },
        ].map((medal) => {
          const angle = (medal.degree * Math.PI) / 180;
          const x = 100 + Math.sin(angle) * 97;
          const y = 100 - Math.cos(angle) * 97;
          return (
            <g key={medal.label}>
              <circle className="medal" cx={x} cy={y} r="4.4" />
              <text className="medal-letter" x={x} y={y + 1.5} textAnchor="middle">
                {medal.label}
              </text>
            </g>
          );
        })}
        {[180, 270].map((degree) => {
          const angle = (degree * Math.PI) / 180;
          return (
            <circle
              key={degree}
              className="node"
              cx={100 + Math.sin(angle) * 97}
              cy={100 - Math.cos(angle) * 97}
              r="2.3"
            />
          );
        })}
        {[40, 140, 220, 320].map((degree) => {
          const angle = (degree * Math.PI) / 180;
          return (
            <circle
              key={degree}
              className="node small"
              cx={100 + Math.sin(angle) * 93}
              cy={100 - Math.cos(angle) * 93}
              r="1.15"
            />
          );
        })}
      </svg>
      <div className="ring dashed orbit spin" />
      <div className="ring solid" />
      <div className="ring hatch spin" />
      <div className="ring hatch inner spin-rev" />
      <div className="core">
        <svg className="core-ticks" viewBox="0 0 100 100">
          {Array.from({ length: 28 }, (_, index) => {
            const angle = Math.PI * (1.15 - (index / 27) * 1.3);
            const inner = index % 2 === 0 ? 30 : 34;
            return (
              <line
                key={index}
                x1={50 + Math.cos(angle) * inner}
                y1={58 - Math.sin(angle) * inner}
                x2={50 + Math.cos(angle) * 42}
                y2={58 - Math.sin(angle) * 42}
              />
            );
          })}
          <path d="M14 62 A 38 38 0 1 1 86 62" />
        </svg>
        <div className="voice" data-voice={mark}>
          <span className="gauge-readout">--</span>
        </div>
      </div>
    </div>
  );
}
