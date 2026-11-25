export function MediaStrip() {
  return (
    <div className="media" aria-hidden="true">
      <span className="icon-row">
        {Array.from({ length: 5 }, (_, index) => (
          <span key={index} />
        ))}
      </span>
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
      <span className="dial" />
    </div>
  );
}
