import { useEffect, useState } from "react";

function formatClock(date: Date): string {
  return date.toLocaleTimeString("en-GB", { hour12: false });
}

function formatDate(date: Date): string {
  return date
    .toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
    .toUpperCase();
}

/** Clock and date. Its one-second tick does not re-render the ring. */
export function Clock() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <aside className="side">
      <p className="mark">JARVIS</p>
      <time dateTime={now.toISOString()}>
        <span className="clock">{formatClock(now)}</span>
        <span className="date">{formatDate(now)}</span>
      </time>
    </aside>
  );
}
