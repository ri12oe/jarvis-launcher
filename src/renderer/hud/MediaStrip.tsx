export function MediaStrip() {
  return (
    <div className="media" aria-hidden="true">
      <button type="button" disabled>
        ‹
      </button>
      <button type="button" disabled>
        ▶
      </button>
      <button type="button" disabled>
        ›
      </button>
      <span>--:--</span>
    </div>
  );
}
