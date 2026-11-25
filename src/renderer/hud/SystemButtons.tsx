const CONTROLS = [
  { id: "down", label: "DOWNT" },
  { id: "restart", label: "RESTRT" },
  { id: "hibernate", label: "HIBER" },
  { id: "logoff", label: "LOGOUT" },
  { id: "lock", label: "LOCK" },
] as const;

/** Visual only. These controls do not shut down, restart, hibernate, log off, or lock. */
export function SystemButtons() {
  return (
    <div className="sys-buttons">
      {CONTROLS.map((control) => (
        <button key={control.id} type="button" className="sys-btn" disabled>
          <svg className="sys-icon" viewBox="0 0 24 24" aria-hidden="true">
            {control.id === "down" ? <path d="M12 3 v10 M8 11 l4 5 4-5 M6 20 h12" /> : null}
            {control.id === "restart" ? <path d="M18 8 a7 7 0 1 1-2 5 M18 4 v5 h-5" /> : null}
            {control.id === "hibernate" ? <path d="M4 16 h16 M7 16 v2 M12 16 v3 M17 16 v2 M8 13 a4 4 0 0 1 8 0" /> : null}
            {control.id === "logoff" ? <path d="M10 5 H6 v14 h4 M10 12 h8 M15 9 l3 3-3 3" /> : null}
            {control.id === "lock" ? <path d="M8 11 V8 a4 4 0 0 1 8 0 v3 M7 11 h10 v8 H7 z" /> : null}
          </svg>
          <span>{control.label}</span>
        </button>
      ))}
    </div>
  );
}
