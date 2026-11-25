import { formatClockParts, useNow } from "./time";

export function AnalogClock() {
  const now = useNow();
  const parts = formatClockParts(now);
  const seconds = now.getSeconds();
  const minutes = now.getMinutes() + seconds / 60;
  const hours = (now.getHours() % 12) + minutes / 60;
  return (
    <div className="analog" aria-hidden="true">
      <div className="analog-face">
        <span className="hand hour" style={{ transform: `rotate(${hours * 30}deg)` }} />
        <span className="hand minute" style={{ transform: `rotate(${minutes * 6}deg)` }} />
        <span className="cap" />
      </div>
      <p>
        {parts.hh}:{parts.mm} {parts.ap}
      </p>
    </div>
  );
}
