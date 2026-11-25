/** Placeholder disk for RAM or BIN. The reading stays "--". */
export function RoundMeter({ name }: { name: string }) {
  return (
    <div className="round-meter" aria-hidden="true">
      <span className="meter-ring">
        <span className="meter-value">--</span>
      </span>
      <span className="meter-name">{name}</span>
    </div>
  );
}
