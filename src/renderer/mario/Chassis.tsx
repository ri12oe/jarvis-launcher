import { memo } from "react";
import { arc, polar, range } from "./geometry";
import { G, useSpareRoom } from "./shift";

/** Metal panels, frames and dials that never change. Drawn once. */
export const Chassis = memo(function Chassis() {
  const room = useSpareRoom();
  return (
    <svg
      className="chassis"
      viewBox="0 0 1192 670"
      width="1192"
      height="670"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="c-metal" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3b3f43" />
          <stop offset="0.5" stopColor="#25282b" />
          <stop offset="1" stopColor="#17191b" />
        </linearGradient>
        <linearGradient id="c-dark" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#1c1f22" />
          <stop offset="1" stopColor="#0d0f10" />
        </linearGradient>
        <linearGradient id="c-light" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#a4a8ac" />
          <stop offset="1" stopColor="#6d7175" />
        </linearGradient>
        <linearGradient id="c-steel" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#2b2e31" />
          <stop offset="0.45" stopColor="#4c5054" />
          <stop offset="1" stopColor="#24272a" />
        </linearGradient>
        <radialGradient
          id="c-emblem"
          cx="50"
          cy="49"
          r="46"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0" stopColor="#05080a" />
          <stop offset="0.78" stopColor="#081016" />
          <stop offset="0.9" stopColor="#0f3644" />
          <stop offset="1" stopColor="#05080a" />
        </radialGradient>
        <radialGradient
          id="c-dial"
          cx="1135"
          cy="613"
          r="40"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0" stopColor="#4a6a86" />
          <stop offset="1" stopColor="#1f3346" />
        </radialGradient>
        <filter id="c-glow" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="2.4" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <G fx={0} fy={0}>
        {/* Emblem */}
        <circle cx="50" cy="49" r="46" fill="url(#c-emblem)" />
        <path className="em-seg" d={arc(50, 49, 46, -80, 80)} />
        <path className="em-seg" d={arc(50, 49, 46, 100, 260)} />
        <circle
          className="em-ring"
          cx="50"
          cy="49"
          r="39"
          filter="url(#c-glow)"
        />
        <circle className="em-inner" cx="50" cy="49" r="34" />

        {/* Identity panel */}
        <path
          className="panel"
          d="M104 10 L114 4 L240 4 L246 10 L246 62 L238 70 L110 70 L100 62 L100 14 Z"
          fill="url(#c-metal)"
        />
        {[110, 136, 162, 188, 214].map((x) => (
          <rect
            key={x}
            className="id-strip"
            x={x}
            y="7"
            width={x === 214 ? 22 : 23}
            height="3.2"
          />
        ))}
        <rect
          x="107"
          y="53"
          width="129"
          height="12"
          rx="1"
          fill="url(#c-light)"
        />

        {/* Upper chassis between the identity panel and the tabs */}
        <path className="frame" d="M246 14 L262 14 L270 6 L366 6" />
        <path className="frame" d="M246 40 L330 40 L340 32 L366 32" />
        <circle className="knob" cx="296" cy="24" r="7.5" />
        <circle className="knob" cx="314" cy="24" r="7.5" />
        <path className="knob-mark" d="M292 24 H300 M310 24 H318 M314 20 V28" />
      </G>

      <G fx={1} fy={0}>
        {/* Date chassis */}
        <path className="frame" d="M1036 24 L1056 6 L1192 6" />
        <path className="frame" d="M1036 24 L1036 112 L1050 126 L1192 126" />
        <path className="frame dim" d="M1152 126 L1170 144 L1192 144" />
      </G>

      <G fx={1} fy={0.3}>
        {/* Analog clock frame */}
        <path
          className="frame dim"
          d="M1000 140 L1012 128 L1150 128 L1172 150 L1172 250 L1150 272"
        />
        <path className="frame dim" d="M1000 140 L1000 236" />
      </G>

      <G fx={0} fy={0.75}>
        {/* Left lower chassis */}
        <path
          className="panel soft"
          d="M6 376 L120 376 L132 388 L132 616 L112 636 L60 636 L44 620 L6 620 Z"
          fill="url(#c-dark)"
        />
        <path
          className="cut"
          d="M20 392 L58 392 L70 404 L70 502 L58 514 L20 514 Z"
        />
        <path
          className="cut"
          d="M80 402 L118 402 L118 588 L80 588 L74 580 L74 410 Z"
        />
        <path className="frame dim" d="M20 530 L60 530 L70 540 L70 606" />
      </G>

      <G fx={0} fy={0.5}>
        {/* Rail with page arrows */}
        <path
          className="panel"
          d="M141 332 L160 316 L160 500 L141 484 Z"
          fill="url(#c-steel)"
        />

        {/* Level meter frame */}
        <path
          className="panel"
          d="M180 240 L197 240 L197 576 L188 586 L168 576 L168 256 Z"
          fill="url(#c-metal)"
        />
      </G>

      <G fx={0} fy={1}>
        {/* Bottom-left arcs */}
        {[62, 82, 102, 121].map((r) => (
          <path key={r} className="arc-white" d={arc(2, 672, r, 2, 88)} />
        ))}
        <rect
          className="status-frame"
          x="55"
          y="647"
          width="72"
          height="17"
          rx="3"
        />
        <circle className="status-dot" cx="64" cy="655.5" r="3" />
        <circle className="ring-grey" cx="141" cy="655" r="12" />

        {/* Network row orbs */}
        <ellipse className="orb" cx="186" cy="603" rx="8" ry="10.5" />
        <ellipse className="orb" cx="400" cy="603" rx="8" ry="10.5" />
        <path
          className="orb-eye"
          d="M181 601 Q184 603 185 606 M191 601 Q188 603 187 606"
        />
        <path
          className="orb-eye"
          d="M395 601 Q398 603 399 606 M405 601 Q402 603 401 606"
        />

        {/* Battery bar */}
        <rect className="bar-track" x="178" y="628" width="128" height="2.2" />
        {[180, 192, 204, 216].map((x) => (
          <rect
            key={x}
            className="bar-dash"
            x={x}
            y="635"
            width="8"
            height="1.6"
          />
        ))}

        {/* Command tray */}
        <path
          className="panel"
          d="M316 628 L418 628 L418 655 L322 655 L316 649 Z"
          fill="url(#c-dark)"
        />
      </G>

      <G fx={0.5} fy={0.5}>
        {/* Weather arc tick */}
        <path className="frame white" d="M832 158 L845 166" />
        <path className="tri" d="M853 165 L860 165 L856.5 170 Z" />
      </G>

      <G fx={1} fy={0.6}>
        {/* Right chassis */}
        <path className="frame dim" d="M1090 440 L1192 440" />
      </G>
      <G fx={1} fy={0.75}>
        <path
          className="panel soft"
          d="M1094 502 L1176 502 L1180 506 L1180 528 L1176 532 L1094 532 Z"
          fill="url(#c-steel)"
        />
        <path className="divider" d="M1137 504 V530" />
        <path className="check" d="M1108 517 L1114 523 L1124 511" />
        <path className="cross" d="M1152 512 L1162 522 M1162 512 L1152 522" />
      </G>

      <G fx={1} fy={1}>
        {/* Bottom-right chassis */}
        <path
          className="panel soft"
          d="M838 600 L860 576 L1076 576 L1096 556 L1192 556 L1192 668 L838 668 Z"
          fill="url(#c-dark)"
        />
        <rect className="track" x="872" y="606" width="216" height="8" rx="4" />
        <rect className="track" x="931" y="620" width="152" height="8" rx="4" />

        {/* Big dial */}
        <circle cx="1135" cy="613" r="42" className="dial-ring" />
        <circle cx="1135" cy="613" r="38" fill="url(#c-dial)" />
        {range(60).map((index) => {
          const [x0, y0] = polar(
            1135,
            613,
            index % 5 === 0 ? 30 : 33,
            index * 6,
          );
          const [x1, y1] = polar(1135, 613, 36, index * 6);
          return (
            <line
              key={index}
              className="dial-tick"
              x1={x0}
              y1={y0}
              x2={x1}
              y2={y1}
            />
          );
        })}
        <rect
          className="dial-chip"
          x="1124"
          y="608"
          width="22"
          height="10"
          rx="1.5"
        />
        <path
          className="dial-hand"
          d="M1135 613 L1110 633 M1135 613 L1160 633"
        />
        <circle cx="1073" cy="637" r="25" className="dial-ring small" />
        <circle cx="1073" cy="637" r="22" className="dial-face" />
        <circle cx="1073" cy="637" r="13" className="dial-red" />
      </G>

      <G fx={0.5} fy={1}>
        {/* Bottom centre dock */}
        <path
          className="panel soft"
          d="M600 668 L640 602 L838 602 L838 668 Z"
          fill="url(#c-dark)"
        />
      </G>

      <G fx={1} fy={0.3}>
        {/* Crescent marks by the analog clock */}
        <path className="crescent" d={arc(1163, 271, 7, 30, 300)} />
        <path className="crescent" d={arc(1140, 297, 8, 30, 300)} />
        <circle className="ring-grey" cx="1086" cy="252" r="6" />
      </G>

      <G fx={0} fy={1}>
        {/* Bottom edge */}
        <path className="edge" d={`M0 667.5 H${1192 + room.extraX}`} />
      </G>
    </svg>
  );
});
