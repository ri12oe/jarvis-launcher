import type { CSSProperties } from "react";
import { formatMonthBanner, useNow } from "./time";

export function Calendar({ style }: { style?: CSSProperties }) {
  const now = useNow();
  const banner = formatMonthBanner(now);
  return (
    <div className="calendar" style={style}>
      <p className="day-num">{banner.day}</p>
      <p className="month-banner">
        <span>{banner.month}</span>
        <span>{banner.weekday}</span>
      </p>
    </div>
  );
}
