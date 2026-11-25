export function Emblem() {
  return (
    <div className="emblem">
      <svg className="badge" viewBox="0 0 64 64" aria-hidden="true">
        <circle cx="32" cy="32" r="30" />
        <circle cx="32" cy="32" r="22" />
        <path d="M32 14 L44 38 H36 L32 30 L28 38 H20 Z" />
      </svg>
      <div className="title-card">
        <p className="title">JARVIS</p>
        <p className="version">Ver 0.1.0</p>
      </div>
    </div>
  );
}
