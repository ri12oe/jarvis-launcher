export interface LogEntry {
  at: number;
  text: string;
  warn: boolean;
}

function clock(at: number): string {
  const time = new Date(at);
  const hours = time.getHours() % 12 || 12;
  return `${hours}:${String(time.getMinutes()).padStart(2, "0")}`;
}

/**
 * Opens above the status bar when it is clicked: this session's messages,
 * newest first, and the warnings from reading config.json.
 */
export function MessageLog({
  entries,
  warnings,
  onClose,
  onClear,
}: {
  entries: readonly LogEntry[];
  warnings: readonly string[];
  onClose: () => void;
  onClear: () => void;
}) {
  return (
    <div className="message-log" role="dialog" aria-label="Messages">
      <header>
        <h2>MESSAGES</h2>
        {entries.length > 0 ? (
          <button type="button" className="log-clear" onClick={onClear}>
            CLEAR
          </button>
        ) : null}
        <button type="button" className="log-x" aria-label="Close messages" onClick={onClose}>
          ✕
        </button>
      </header>
      <div className="log-body">
        {warnings.length > 0 ? (
          <section>
            <h3>CONFIG WARNINGS</h3>
            <ul>
              {warnings.map((warning, index) => (
                <li key={index} className="warn">
                  {warning}
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        <section>
          {warnings.length > 0 ? <h3>THIS SESSION</h3> : null}
          {entries.length === 0 ? (
            <p className="log-empty">No messages yet.</p>
          ) : (
            <ul>
              {entries.map((entry, index) => (
                <li key={`${entry.at}-${index}`} className={entry.warn ? "warn" : undefined}>
                  <time>{clock(entry.at)}</time>
                  <span>{entry.text}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
