import { formatMonthBanner, useNow } from "./time";

export function Calendar() {
  const now = useNow();
  const banner = formatMonthBanner(now);
  return (
    <div className="calendar">
      <p className="day-num">{banner.day}</p>
      <p className="month-banner">
        <span>{banner.month}</span>
        <span>{banner.weekday}</span>
      </p>
    </div>
  );
}
