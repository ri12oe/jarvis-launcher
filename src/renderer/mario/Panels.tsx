import iconUrl from "../../../assets/icon.png";
import { useRef, type PointerEvent, type RefObject } from "react";
import { formatBytes, formatRate, formatUptime } from "../../shared/stats";
import {
  formatTrackTime,
  mediaPosition,
  POWER_BUTTONS,
  SEARCH_LIMIT,
  type PowerAction,
  type SystemAction,
  type SystemState,
} from "../../shared/system";
import type { SystemStats, WeatherReport } from "../../shared/types";
import {
  formatClockParts,
  formatHudDate,
  formatMonthBanner,
  useNow,
} from "../hud/time";
import { arc, polar, range } from "./geometry";
import { useTicker, type Battery } from "./live";
import { G, Shift } from "./shift";

const DAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAY_LONG = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

/** Digital clock with the mirrored numerals under it. */
export function DesktopClock() {
  const now = useNow();
  const parts = formatClockParts(now);
  const digits = (
    <>
      <span className="pair">{parts.hh}</span>
      <span className="colon">:</span>
      <span className="pair">{parts.mm}</span>
    </>
  );
  return (
    <Shift fx={0} fy={0.2}>
      <div className="desk-clock">
        <p className="desk-date">{formatHudDate(now)}</p>
        <time className="desk-digits" dateTime={now.toISOString()}>
          {digits}
        </time>
        <span className="desk-ampm">{parts.ap}</span>
        <span className="desk-reflect" aria-hidden="true">
          {digits}
        </span>
      </div>
    </Shift>
  );
}

export function DayBlock() {
  const banner = formatMonthBanner(useNow());
  return (
    <Shift fx={1} fy={0}>
      <div className="day-block">
        <p className="day-number">{banner.day}</p>
        <p className="day-month">{banner.month}</p>
        <p className="day-weekday">{banner.weekday}</p>
      </div>
    </Shift>
  );
}

function dash(value: number | undefined | null, suffix = ""): string {
  return value == null || Number.isNaN(value) ? "--" : `${value}${suffix}`;
}

function dayLine(date: string, index: number): { name: string; short: string } {
  const parsed = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!parsed)
    return {
      name: index === 0 ? "Today" : index === 1 ? "Tomorrow" : "--",
      short: "",
    };
  const day = new Date(
    Number(parsed[1]),
    Number(parsed[2]) - 1,
    Number(parsed[3]),
  );
  const name =
    index === 0 ? "Today" : index === 1 ? "Tomorrow" : DAY_LONG[day.getDay()];
  return { name, short: `${DAY_SHORT[day.getDay()]} ${day.getDate()}` };
}

function updatedText(report: WeatherReport | null): string {
  if (!report) return "Updated --";
  const match = /T(\d{2}):(\d{2})/.exec(report.updated);
  if (!match) return "Updated --";
  const hour = Number(match[1]);
  return `Updated ${hour % 12 === 0 ? 12 : hour % 12}:${match[2]} ${hour >= 12 ? "PM" : "AM"}`;
}

export function WeatherPanel({ report }: { report: WeatherReport | null }) {
  const unit = report?.units ?? "F";
  const rows = [
    `Humidity: ${dash(report?.humidity, "%")}`,
    `Feels Like: ${dash(report?.feelsLike, "°")}`,
    `Precipitation: ${report ? `${report.precipitation}${unit === "F" ? " in" : " mm"}` : "--"}`,
    `Visibility: ${report ? `${(unit === "F" ? report.visibilityKm * 0.621 : report.visibilityKm).toFixed(1)} ${unit === "F" ? "mi" : "km"}` : "--"}`,
    `Wind: ${report ? `${report.windSpeed} ${report.windUnit}${report.windSpeed < 2 ? " (CALM)" : ""}` : "--"}`,
    `Pressure: ${report ? `${(report.pressureHpa * 0.02953).toFixed(2)} in (${report.pressureHpa} hPa)` : "--"}`,
    `Sunrise: ${report?.sunrise ?? "--"}`,
    `Sunset: ${report?.sunset ?? "--"}`,
    `UV Index: ${dash(report?.uvIndex)}`,
  ];
  const days = report?.days ?? [];
  return (
    <Shift fx={0.5} fy={0.5}>
      <div className="weather">
        <p className="w-place">{report?.label || "--"}</p>
        <p className="w-updated">{updatedText(report)}</p>
        <p className="w-temp">
          <span className="w-dot">·</span>
          {report ? `${report.temperature}°${unit}` : `--°${unit}`}
        </p>
        <p className="w-cond">{report?.condition ?? "--"}</p>
        <ul className="w-rows">
          {rows.map((row, index) => (
            <li key={index} style={{ left: index * 3.3, top: index * 10.3 }}>
              {row}
            </li>
          ))}
        </ul>
        {[0, 1, 2].map((index) => {
          const day = days[index];
          const line = dayLine(day?.date ?? "", index);
          return (
            <div key={index} className={`w-day w-day-${index}`}>
              <p className="w-day-name">{line.name}</p>
              {index > 0 ? (
                <p className="w-day-date">{line.short || "--"}</p>
              ) : null}
              <p className="w-day-temp">
                {day
                  ? index === 0
                    ? `${day.high}°`
                    : `${day.high}° / ${day.low}°`
                  : index === 0
                    ? "--°"
                    : "--° / --°"}
              </p>
              <p className="w-day-cond">{day?.condition ?? "--"}</p>
            </div>
          );
        })}
      </div>
    </Shift>
  );
}

export function AnalogClock() {
  const now = useNow();
  const parts = formatClockParts(now);
  const cx = 1083;
  const cy = 200;
  const minute = now.getMinutes() + now.getSeconds() / 60;
  const hour = (now.getHours() % 12) + minute / 60;
  const [hx, hy] = polar(cx, cy, 26, hour * 30);
  const [mx, my] = polar(cx, cy, 36, minute * 6);
  return (
    <Shift fx={1} fy={0.3}>
      <svg
        className="analog"
        viewBox="0 0 1192 670"
        width="1192"
        height="670"
        aria-hidden="true"
      >
        <path className="a-outer" d={arc(cx, cy, 62, -40, 128)} />
        <path className="a-outer" d={arc(cx, cy, 62, 142, 222)} />
        <path className="a-outer" d={arc(cx, cy, 62, 236, 310)} />
        <circle className="a-hair" cx={cx} cy={cy} r="56" />
        <circle className="a-gear" cx={cx} cy={cy} r="49" />
        {range(64).map((index) => {
          const [x0, y0] = polar(cx, cy, 46, index * 5.625);
          const [x1, y1] = polar(cx, cy, 50, index * 5.625);
          return (
            <line
              key={index}
              className="a-tooth"
              x1={x0}
              y1={y0}
              x2={x1}
              y2={y1}
            />
          );
        })}
        <circle className="a-white" cx={cx} cy={cy} r="43" />
        <circle className="a-face" cx={cx} cy={cy} r="40" />
        <path className="a-sweep" d={arc(cx, cy, 30, 270, 359)} />
        <path className="a-sweep grey" d={arc(cx, cy, 30, 200, 268)} />
        {[0, 60, 120, 180, 240, 300].map((deg) => {
          const [x0, y0] = polar(cx, cy, 14, deg);
          const [x1, y1] = polar(cx, cy, 39, deg);
          return (
            <line
              key={deg}
              className="a-spoke"
              x1={x0}
              y1={y0}
              x2={x1}
              y2={y1}
            />
          );
        })}
        <line className="a-hand" x1={cx} y1={cy} x2={hx} y2={hy} />
        <line className="a-hand" x1={cx} y1={cy} x2={mx} y2={my} />
      </svg>
      <p className="a-time">
        {Number(parts.hh)}:{parts.mm}
      </p>
      <p className="a-ampm">{parts.ap}</p>
    </Shift>
  );
}

export function RamBin({ stats }: { stats: SystemStats | null }) {
  const recycle = stats?.recycle ?? null;
  return (
    <Shift fx={1} fy={0.6}>
      <>
        <p className="ram-used">
          Used:{stats ? formatBytes(stats.ramUsedBytes) : "--"}
        </p>
        <p className="ram-free">
          Free:{stats ? formatBytes(stats.ramFreeBytes) : "--"}
        </p>
        <div className="round-btn ram-btn">RAM</div>
        <p className="bin-state">
          {recycle
            ? recycle.items === 0
              ? "Empty"
              : `${recycle.items} items`
            : "--"}
        </p>
        <p className="bin-size">
          {recycle ? formatBytes(recycle.bytes) : "--"}
        </p>
        <div className="round-btn bin-btn">BIN</div>
      </>
    </Shift>
  );
}

function Gauge({
  cx,
  cy,
  r,
  value,
  labels,
}: {
  cx: number;
  cy: number;
  r: number;
  value: number | null;
  labels: number[];
}) {
  const start = -135;
  const sweep = 270;
  const angle = start + (sweep * Math.max(0, Math.min(100, value ?? 0))) / 100;
  const [nx, ny] = polar(cx, cy, r * 0.8, angle);
  return (
    <g className="gauge">
      <circle cx={cx} cy={cy} r={r} className="gauge-face" />
      <circle cx={cx} cy={cy} r={r} className="gauge-rim" />
      <path className="gauge-band" d={arc(cx, cy, r * 0.88, 40, 78)} />
      {range(41).map((index) => {
        const deg = start + (sweep * index) / 40;
        const [x0, y0] = polar(
          cx,
          cy,
          r * (index % 5 === 0 ? 0.74 : 0.79),
          deg,
        );
        const [x1, y1] = polar(cx, cy, r * 0.84, deg);
        return (
          <line
            key={index}
            className="gauge-tick"
            x1={x0}
            y1={y0}
            x2={x1}
            y2={y1}
          />
        );
      })}
      {labels.map((label, index) => {
        const [x, y] = polar(
          cx,
          cy,
          r * 0.62,
          start + (sweep * index) / (labels.length - 1),
        );
        return (
          <text
            key={label}
            className="gauge-num"
            x={x}
            y={y}
            textAnchor="middle"
            dominantBaseline="central"
          >
            {label}
          </text>
        );
      })}
      {value == null ? null : (
        <line className="gauge-needle" x1={cx} y1={cy} x2={nx} y2={ny} />
      )}
      <circle cx={cx} cy={cy} r={r * 0.12} className="gauge-hub" />
    </g>
  );
}

export function Gauges({ stats }: { stats: SystemStats | null }) {
  return (
    <svg
      className="gauges"
      viewBox="0 0 1192 670"
      width="1192"
      height="670"
      aria-hidden="true"
    >
      <defs>
        <radialGradient id="g-face">
          <stop offset="0" stopColor="#0c2340" />
          <stop offset="0.8" stopColor="#061224" />
          <stop offset="1" stopColor="#0b2b55" />
        </radialGradient>
      </defs>
      <G fx={1} fy={0.75}>
        <Gauge
          cx={1040}
          cy={507}
          r={45}
          value={stats?.diskPct ?? null}
          labels={[0, 20, 40, 60, 80, 100]}
        />
        <Gauge
          cx={961}
          cy={507}
          r={67}
          value={stats?.cpuPct ?? null}
          labels={[0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100]}
        />
      </G>
    </svg>
  );
}

function Spark({
  values,
  x,
  width,
}: {
  values: number[];
  x: number;
  width: number;
}) {
  const peak = Math.max(1, ...values);
  const step = width / 24;
  return (
    <g className="spark">
      <line x1={x} y1="614" x2={x + width} y2="614" />
      {values.map((value, index) => {
        const height = Math.max(0.6, (value / peak) * 16);
        return (
          <rect
            key={index}
            x={x + index * step}
            y={614 - height}
            width={step * 0.7}
            height={height}
          />
        );
      })}
    </g>
  );
}

export function Telemetry({
  stats,
  down,
  up,
  battery,
}: {
  stats: SystemStats | null;
  down: number[];
  up: number[];
  battery: Battery | null;
}) {
  const wifi = stats?.wifi ?? null;
  const pct = wifi?.signalPct ?? 0;
  const level = battery ? Math.round(battery.level * 100) : null;
  return (
    <>
      <svg
        className="telemetry"
        viewBox="0 0 1192 670"
        width="1192"
        height="670"
        aria-hidden="true"
      >
        <G fx={0} fy={0.8}>
          {wifi ? (
            <path
              className="wifi-arc"
              d={arc(240, 551, 21, 95, 95 + Math.max(1, pct) * 2.95)}
            />
          ) : null}
        </G>
        <G fx={0} fy={1}>
          <Spark values={down} x={226} width={48} />
          <Spark values={up} x={306} width={46} />
          <rect
            className="bar-fill"
            x="178"
            y="628"
            width={128 * ((level ?? 0) / 100)}
            height="2.2"
          />
        </G>
      </svg>
      <Shift fx={0} fy={0.8}>
        <p className="wifi-text">wifi: {wifi ? `${pct}%` : "--"}</p>
        <p className="wifi-ssid">{wifi?.ssid || "--"}</p>
      </Shift>
      <Shift fx={0} fy={1}>
        <p className="net-down">
          {stats?.net ? formatRate(stats.net.downBytesPerSec) : "--"}
        </p>
        <p className="net-up">
          {stats?.net ? formatRate(stats.net.upBytesPerSec) : "--"}
        </p>
        <p className="wan">WAN</p>
        <p className="wan-pct">{wifi ? `${pct}%` : "--"}</p>
        <p className="battery-label">BATTERY BAR</p>
        <p className="ac-line">
          {battery ? (battery.charging ? "AC LINE" : "BATTERY") : "AC LINE"}
        </p>
        <p className="battery-pct">{level == null ? "--" : `${level}%`}</p>
        <p className="disk-pct">
          {stats?.diskPct == null ? "--" : `${stats.diskPct}%`}
        </p>
        <p className="uptime">{stats ? formatUptime(stats.uptimeSec) : "--"}</p>
        <p className="uptime-up">UP</p>
      </Shift>
    </>
  );
}

/** The tall meter by the rail. Battery charge when the PC has a battery, CPU load otherwise. */
export function LevelMeter({
  stats,
  battery,
}: {
  stats: SystemStats | null;
  battery: Battery | null;
}) {
  const pct =
    battery && !battery.charging ? battery.level * 100 : (stats?.cpuPct ?? 0);
  const count = 32;
  const lit = Math.round((pct / 100) * count);
  return (
    <svg
      className="level"
      viewBox="0 0 1192 670"
      width="1192"
      height="670"
      aria-hidden="true"
    >
      <G fx={0} fy={0.5}>
        {range(count).map((index) => {
          const y = 568 - index * 9.7;
          return (
            <rect
              key={index}
              className={index < lit ? "seg on" : "seg"}
              x="172"
              y={y}
              width="20"
              height="7.4"
            />
          );
        })}
      </G>
    </svg>
  );
}

export function LeftList() {
  const left = [
    "UALIRITED",
    "PLALIST",
    "-LAISTYRARBITTE",
    "PATEEJE",
    "RRHWETCR",
    "VOL NPHT",
  ];
  const lower = [
    "YOUTUBE",
    "NEEFLE",
    "CUSTOBER",
    "CUSTORS",
    "TORREOTE",
    "ERMETEPELETN",
  ];
  return (
    <Shift fx={0.25} fy={0.5}>
      <div className="left-list" aria-hidden="true">
        {left.map((line, index) => (
          <p key={line} style={{ top: 272 + index * 9.2 }}>
            {line}
          </p>
        ))}
        <p className="liriks" style={{ top: 327 }}>
          LIRIKS
        </p>
        {lower.map((line, index) => (
          <p key={line} style={{ top: 339 + index * 9.2 }}>
            {line}
          </p>
        ))}
        <span className="list-rule" />
        <span className="list-chip" />
        <p className="num" style={{ top: 299 }}>
          5.8 NG
        </p>
        <p className="num" style={{ top: 315 }}>
          4-S 395
        </p>
        <p className="num" style={{ top: 339 }}>
          887 ZH
        </p>
        <p className="num" style={{ top: 354 }}>
          2756 MB
        </p>
      </div>
    </Shift>
  );
}

export function Identity() {
  return (
    <Shift fx={0} fy={0}>
      <div className="identity">
        <p className="id-name">M.A.R.I.O OS</p>
        <p className="id-ver">Nr 4.3.6</p>
        <span className="id-badge">
          <img src={iconUrl} alt="" draggable={false} />
        </span>
        <p className="id-bar">NERIA MARGNY&nbsp;&nbsp;|&nbsp;&nbsp;BAEIAZ</p>
      </div>
    </Shift>
  );
}

const SYSTEM = ["OPRNLAIS", "NETUAT", "REFUET", "NRSAAET", "LCOOST"];

function SystemIcon({ index }: { index: number }) {
  if (index === 0) {
    return (
      <svg viewBox="0 0 20 20">
        <circle cx="10" cy="10" r="1.8" />
        {[0, 120, 240].map((deg) => (
          <path
            key={deg}
            d="M10 10 L6.2 3.6 A7.5 7.5 0 0 1 13.8 3.6 Z"
            transform={`rotate(${deg + 180} 10 10)`}
          />
        ))}
      </svg>
    );
  }
  if (index === 1) {
    return (
      <svg viewBox="0 0 20 20">
        {range(12).map((ray) => (
          <line
            key={ray}
            x1="10"
            y1="3"
            x2="10"
            y2="6.2"
            transform={`rotate(${ray * 30} 10 10)`}
            className="stroke"
          />
        ))}
      </svg>
    );
  }
  if (index === 2) {
    return (
      <svg viewBox="0 0 20 20">
        <path className="stroke wide" d="M6.2 6.4 A6 6 0 1 0 13.8 6.4" />
        <line className="stroke wide" x1="10" y1="3" x2="10" y2="10" />
      </svg>
    );
  }
  if (index === 3) {
    return (
      <svg viewBox="0 0 20 20">
        <path
          className="stroke wide"
          d="M3 7.5 H16 M12.5 4.5 L16 7.5 L12.5 10.5 M17 12.5 H4 M7.5 9.5 L4 12.5 L7.5 15.5"
        />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 20 20">
      <path
        className="stroke wide"
        d="M6.5 9 V6.5 A3.5 3.5 0 0 1 13.5 6.5 V9"
      />
      <rect x="5" y="9" width="10" height="8" rx="1" />
    </svg>
  );
}

/** Five power buttons and the brightness slider, in the design's top-right block. */
export function SystemButtons({
  pending,
  onPower,
  brightness,
  onBrightness,
}: {
  pending: PowerAction | null;
  onPower: (action: PowerAction) => void;
  brightness: number | null;
  onBrightness: (value: number) => void;
}) {
  const fromPointer = (event: PointerEvent<HTMLButtonElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    const fraction = 1 - (event.clientY - box.top) / box.height;
    onBrightness(Math.round(Math.max(0, Math.min(1, fraction)) * 100));
  };
  const knob = brightness == null ? 5 : 2 + (1 - brightness / 100) * 12;
  return (
    <Shift fx={0.8} fy={0}>
      <div className="sys">
        {SYSTEM.map((label, index) => {
          const button = POWER_BUTTONS[index];
          const armed = pending === button.action;
          return (
            <div
              key={label}
              className={armed ? "sys-col armed" : "sys-col"}
              style={{ left: 851 + index * 38 }}
            >
              <button
                type="button"
                className="sys-icon"
                aria-label={
                  armed ? `${button.name}: click again to confirm` : button.name
                }
                title={button.name}
                onClick={() => onPower(button.action)}
              >
                <SystemIcon index={index} />
              </button>
              <span className="sys-label" aria-hidden="true">
                {label}
              </span>
            </div>
          );
        })}
        <div className="sys-col narrow" style={{ left: 1041 }}>
          <button
            type="button"
            className="sys-icon"
            aria-label={
              brightness == null
                ? "Brightness: not available on this display"
                : `Brightness ${brightness}%`
            }
            title={
              brightness == null
                ? "Brightness: not available on this display"
                : `Brightness ${brightness}%`
            }
            disabled={brightness == null}
            onPointerDown={(event) => {
              event.currentTarget.setPointerCapture(event.pointerId);
              fromPointer(event);
            }}
            onPointerMove={(event) => {
              if (event.currentTarget.hasPointerCapture(event.pointerId))
                fromPointer(event);
            }}
            onWheel={(event) => {
              if (brightness != null)
                onBrightness(
                  Math.max(
                    0,
                    Math.min(100, brightness + (event.deltaY < 0 ? 5 : -5)),
                  ),
                );
            }}
            onKeyDown={(event) => {
              if (brightness == null) return;
              if (event.key === "ArrowUp" || event.key === "ArrowDown") {
                event.preventDefault();
                event.stopPropagation();
                onBrightness(
                  Math.max(
                    0,
                    Math.min(
                      100,
                      brightness + (event.key === "ArrowUp" ? 5 : -5),
                    ),
                  ),
                );
              }
            }}
          >
            <svg viewBox="0 0 10 20">
              <line className="stroke" x1="5" y1="2" x2="5" y2="18" />
              <rect x="3.2" y={knob} width="3.6" height="4" rx="0.6" />
            </svg>
          </button>
          <span className="sys-label" aria-hidden="true">
            <svg viewBox="0 0 10 12">
              <path className="stroke" d="M3 5.5 V4 A2 2 0 0 1 7 4 V5.5" />
              <rect x="2" y="5.5" width="6" height="5" rx="0.6" />
            </svg>
          </span>
        </div>
      </div>
    </Shift>
  );
}

function clampPercent(value: number): number {
  return Math.round(Math.max(0, Math.min(100, value)));
}

/** Track, time, transport, volume slider, volume dial, and mic dial, bottom right. */
export function MediaBar({
  system,
  onAction,
}: {
  system: SystemState;
  onAction: (action: SystemAction, value?: number) => void;
}) {
  const media = system.media;
  const now = useTicker(media?.status === "playing");
  const position = media ? mediaPosition(media, now) : 0;
  const progress = media && media.duration > 0 ? position / media.duration : 0;
  const volume = system.volume;
  const lastSent = useRef(0);
  const setVolume = (value: number, force = false) => {
    const time = Date.now();
    if (!force && time - lastSent.current < 80) return;
    lastSent.current = time;
    onAction("volume-set", clampPercent(value));
  };
  const volumeFromPointer = (
    event: PointerEvent<HTMLButtonElement>,
    force = false,
  ) => {
    const box = event.currentTarget.getBoundingClientRect();
    setVolume(((event.clientX - box.left) / box.width) * 100, force);
  };
  const nowPlaying = media
    ? [media.title, media.artist].filter(Boolean).join(" \u2014 ")
    : "";
  return (
    <Shift fx={1} fy={1}>
      <div className="media-bar">
        {nowPlaying ? (
          <p className="media-title" title={nowPlaying}>
            {nowPlaying}
          </p>
        ) : null}
        <p className="media-time">{formatTrackTime(position)}</p>
        <button
          type="button"
          className="media-progress"
          aria-label={
            media && media.duration > 0
              ? `Seek, ${formatTrackTime(position)} of ${formatTrackTime(media.duration)}`
              : "Track position"
          }
          disabled={!media || media.duration <= 0}
          onClick={(event) => {
            if (!media || media.duration <= 0) return;
            const box = event.currentTarget.getBoundingClientRect();
            onAction(
              "media-seek",
              ((event.clientX - box.left) / box.width) * media.duration,
            );
          }}
        >
          <span
            className="fill"
            style={{ width: `${Math.max(0, Math.min(1, progress)) * 100}%` }}
          />
        </button>
        <button
          type="button"
          className="media-btn"
          style={{ left: 855 }}
          aria-label="Previous track"
          title="Previous track"
          onClick={() => onAction("media-prev")}
        >
          <svg viewBox="0 0 16 10">
            <path d="M3 1 V9 M14 1 L8 5 L14 9 Z M9 1 L3.5 5 L9 9 Z" />
          </svg>
        </button>
        <button
          type="button"
          className={
            media?.status === "playing" ? "media-btn playing" : "media-btn"
          }
          style={{ left: 878 }}
          aria-label={media?.status === "playing" ? "Pause" : "Play"}
          title={media?.status === "playing" ? "Pause" : "Play"}
          onClick={() => onAction("media-toggle")}
        >
          <svg viewBox="0 0 16 10">
            <path d="M2.5 1 L8.5 5 L2.5 9 Z M10.5 1 V9 M13.5 1 V9" />
          </svg>
        </button>
        <button
          type="button"
          className="media-btn"
          style={{ left: 901 }}
          aria-label="Next track"
          title="Next track"
          onClick={() => onAction("media-next")}
        >
          <svg viewBox="0 0 16 10">
            <path d="M13 1 V9 M2 1 L8 5 L2 9 Z M7 1 L12.5 5 L7 9 Z" />
          </svg>
        </button>
        <button
          type="button"
          className="volume-track"
          aria-label={
            volume == null ? "Volume: no playback device" : `Volume ${volume}%`
          }
          title={
            volume == null ? "Volume: no playback device" : `Volume ${volume}%`
          }
          disabled={volume == null}
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
            volumeFromPointer(event, true);
          }}
          onPointerMove={(event) => {
            if (event.currentTarget.hasPointerCapture(event.pointerId))
              volumeFromPointer(event);
          }}
          onPointerUp={(event) => volumeFromPointer(event, true)}
          onWheel={(event) => {
            if (volume != null)
              setVolume(volume + (event.deltaY < 0 ? 2 : -2), true);
          }}
          onKeyDown={(event) => {
            if (volume == null) return;
            if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
              event.preventDefault();
              event.stopPropagation();
              setVolume(volume + (event.key === "ArrowRight" ? 5 : -5), true);
            }
          }}
        >
          <span className="fill" style={{ width: `${volume ?? 0}%` }} />
        </button>
        <button
          type="button"
          className={system.muted ? "volume-dial muted" : "volume-dial"}
          aria-label={system.muted ? "Unmute" : "Mute"}
          title={system.muted ? "Unmute" : "Mute"}
          disabled={volume == null}
          onClick={() => onAction("mute-toggle")}
        >
          <span className="volume-value">
            {volume == null ? "--" : system.muted ? "MUTE" : volume}
          </span>
        </button>
        <button
          type="button"
          className={system.micMuted ? "mic-dial muted" : "mic-dial"}
          aria-label={system.micMuted ? "Unmute microphone" : "Mute microphone"}
          title={system.micMuted ? "Microphone muted" : "Microphone on"}
          disabled={system.micMuted == null}
          onClick={() => onAction("mic-toggle")}
        />
      </div>
    </Shift>
  );
}

/** The (-) and (+) knobs by the identity panel step the volume. */
export function VolumeKnobs({ onStep }: { onStep: (delta: number) => void }) {
  return (
    <Shift fx={0} fy={0}>
      <button
        type="button"
        className="knob-btn"
        style={{ left: 288.5 }}
        aria-label="Volume down"
        title="Volume down"
        onClick={() => onStep(-5)}
      />
      <button
        type="button"
        className="knob-btn"
        style={{ left: 306.5 }}
        aria-label="Volume up"
        title="Volume up"
        onClick={() => onStep(5)}
      />
    </Shift>
  );
}

/** Quick icons under the search pill. Plain glyphs, not product logos. */
export function Dock({
  query,
  inputRef,
  onQuery,
  onSubmit,
  onCancel,
  dock,
  onDock,
  onSettings,
}: {
  /** Label of the tile in each of the four quick-launch slots, or null when empty. */
  dock: readonly (string | null)[];
  onDock: (index: number) => void;
  onSettings: () => void;
  query: string;
  inputRef: RefObject<HTMLInputElement>;
  onQuery: (value: string) => void;
  onSubmit: (value: string) => void;
  onCancel: () => void;
}) {
  return (
    <Shift fx={0.5} fy={1}>
      <div className="dock">
        <form
          className="search"
          role="search"
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit(query);
          }}
        >
          <svg viewBox="0 0 12 12" aria-hidden="true">
            <circle cx="5" cy="5" r="3.4" />
            <line x1="7.6" y1="7.6" x2="11" y2="11" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={query}
            placeholder="Google"
            aria-label="Search Google"
            maxLength={SEARCH_LIMIT}
            spellCheck={false}
            autoComplete="off"
            onChange={(event) => onQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                event.stopPropagation();
                onCancel();
              }
            }}
          />
        </form>
        <svg className="dock-icons" viewBox="0 0 200 30" aria-hidden="true">
          <g transform="translate(15 15)">
            <circle r="12" className="disc" />
            <path
              className="cut"
              d="M0 -7 V4 M-4.5 0 L0 4.5 L4.5 0 M-5.5 7 H5.5"
            />
          </g>
          <g transform="translate(58 15)">
            <circle r="12" className="ring" />
            <path
              className="line"
              d="M-8 6 L8 -6 M-2 -7 A2.2 2.2 0 1 1 -2 -6.9 M-4 -2 L-6 6 M-4 -2 L3 1 L5 7"
            />
          </g>
          <g transform="translate(103 15)">
            <path
              className="line"
              d="M0 -11 L-10 9 L10 9 Z M0 -11 L0 3 M-10 9 L0 3 L10 9"
            />
          </g>
          <g transform="translate(148 15)">
            <circle r="12" className="ring" />
            <path
              className="disc"
              d="M-7 4 A4 4 0 0 1 -4 -3 A5 5 0 0 1 5 -4 A4 4 0 0 1 7 4 Z"
            />
          </g>
          <g transform="translate(191 15)">
            <circle r="5" className="ring" />
            {range(8).map((index) => (
              <rect
                key={index}
                x="-2"
                y="-12"
                width="4"
                height="5"
                className="disc"
                transform={`rotate(${index * 45})`}
              />
            ))}
            <circle r="8" className="ring" />
          </g>
        </svg>
        {DOCK_CENTERS.map((x, index) => {
          const settings = index === DOCK_CENTERS.length - 1;
          const label = settings
            ? "Open config.json"
            : (dock[index] ??
              `Empty dock slot ${index + 1}: set "dock" in config.json`);
          return (
            <button
              key={x}
              type="button"
              className={
                settings || dock[index] ? "dock-btn" : "dock-btn empty"
              }
              style={{ left: x - 14 }}
              aria-label={label}
              title={label}
              onClick={() => (settings ? onSettings() : onDock(index))}
            />
          );
        })}
      </div>
    </Shift>
  );
}

/** Centres of the five dock icons, in design pixels. The last one is the gear. */
const DOCK_CENTERS = [632, 675, 720, 765, 808];
