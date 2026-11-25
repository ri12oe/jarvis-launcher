/** Placeholder speedometer. The needle stays at rest and the reading is "--". */
export function Gauge() {
  return (
    <div className="gauge" aria-hidden="true">
      <svg viewBox="0 0 120 78">
        <path className="gauge-arc" d="M12 66 A 48 48 0 0 1 108 66" />
        {Array.from({ length: 9 }, (_, index) => {
          const angle = Math.PI - (index / 8) * Math.PI;
          const inner = index % 2 === 0 ? 36 : 40;
          const x1 = 60 + Math.cos(angle) * inner;
          const y1 = 66 - Math.sin(angle) * inner;
          const x2 = 60 + Math.cos(angle) * 46;
          const y2 = 66 - Math.sin(angle) * 46;
          return <line key={index} x1={x1} y1={y1} x2={x2} y2={y2} />;
        })}
        <line className="needle" x1="60" y1="66" x2="28" y2="58" />
        <circle cx="60" cy="66" r="3.5" />
      </svg>
      <span>--</span>
    </div>
  );
}
