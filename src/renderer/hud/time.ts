import { useEffect, useState } from "react";

const MONTHS_SHORT = ["Jan.", "Feb.", "Mar.", "Apr.", "May.", "Jun.", "Jul.", "Aug.", "Sep.", "Oct.", "Nov.", "Dec."];
const MONTHS = [
  "JANUARY",
  "FEBRUARY",
  "MARCH",
  "APRIL",
  "MAY",
  "JUNE",
  "JULY",
  "AUGUST",
  "SEPTEMBER",
  "OCTOBER",
  "NOVEMBER",
  "DECEMBER",
];
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function useNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  return now;
}

/** `25-Nov., Wednesday` */
export function formatHudDate(date: Date): string {
  return `${date.getDate()}-${MONTHS_SHORT[date.getMonth()]}, ${WEEKDAYS[date.getDay()]}`;
}

export function formatMonthBanner(date: Date): { day: string; month: string; weekday: string } {
  return {
    day: String(date.getDate()),
    month: MONTHS[date.getMonth()],
    weekday: WEEKDAYS[date.getDay()].toUpperCase(),
  };
}

export function formatClockParts(date: Date): { hh: string; mm: string; ap: "AM" | "PM" } {
  const ap = date.getHours() >= 12 ? "PM" : "AM";
  let hour = date.getHours() % 12;
  if (hour === 0) hour = 12;
  return {
    hh: String(hour).padStart(2, "0"),
    mm: String(date.getMinutes()).padStart(2, "0"),
    ap,
  };
}
