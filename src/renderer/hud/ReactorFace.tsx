import type { VoicePhase } from "../../shared/types";
import type { HudFrame } from "../../shared/ring";

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
  return (
    <div
      className="reactor"
      style={{ width: size, height: size, left: frame.cx - size / 2, top: frame.cy - size / 2 }}
      aria-hidden="true"
    >
      <svg className="reactor-svg" viewBox="0 0 200 200">
        <circle className="metal" cx="100" cy="100" r="98" />
        <circle className="hairline" cx="100" cy="100" r="92" />
        {Array.from({ length: 72 }, (_, index) => {
          const angle = (index / 72) * Math.PI * 2;
          const inner = index % 6 === 0 ? 86 : 89;
          return (
            <line
              key={index}
              className={index % 6 === 0 ? "tick major" : "tick"}
              x1={100 + Math.sin(angle) * inner}
              y1={100 - Math.cos(angle) * inner}
              x2={100 + Math.sin(angle) * 96}
              y2={100 - Math.cos(angle) * 96}
            />
          );
        })}
        {[0, 40, 90, 140, 180, 220, 270, 320].map((degree) => {
          const angle = (degree * Math.PI) / 180;
          return (
            <circle
              key={degree}
              className="node"
              cx={100 + Math.sin(angle) * 96}
              cy={100 - Math.cos(angle) * 96}
              r="1.7"
            />
          );
        })}
        <path className="sweep" d={arc(84, 210, 330)} />
        <path className="sweep dim" d={arc(84, 30, 150)} />
        <circle className="medal" cx="100" cy="8" r="6" />
        <text className="medal-letter" x="100" y="10.2" textAnchor="middle">
          J
        </text>
        <circle className="medal" cx="100" cy="192" r="6" />
        <circle className="medal-core" cx="100" cy="192" r="1.6" />
      </svg>
      <div className="ring dashed orbit spin" />
      <div className="ring stripes spin" />
      <div className="ring stripes inner spin-rev" />
      <div className="core">
        <div className="voice" data-voice={mark} />
      </div>
    </div>
  );
}
