/** Footer label. `REFRESHING` is only shown while a refresh is in flight. */
export function refreshControlLabel(running: boolean): "REFRESH" | "REFRESHING" {
  return running ? "REFRESHING" : "REFRESH";
}

/** A click starts a refresh only when one is not already running. */
export function acceptRefreshClick(running: boolean): boolean {
  return !running;
}

/** True when the IPC event came from the launcher window's main frame. */
export function isMainFrameSender(senderFrame: unknown, mainFrame: unknown): boolean {
  return senderFrame != null && mainFrame != null && senderFrame === mainFrame;
}

export interface RefreshGate {
  /** Starts a refresh, or joins the one already running. */
  requestRefresh(): Promise<void>;
  /**
   * A config edit. A running refresh queues exactly one follow-up.
   * Further edits before that follow-up starts do not add more runs.
   */
  queueConfigEdit(): void;
}

/** One discovery at a time. A config edit during that run queues one more. */
export function createRefreshGate(run: () => Promise<void>): RefreshGate {
  let task: Promise<void> | null = null;
  let queued = false;

  function requestRefresh(): Promise<void> {
    if (task) return task;
    let started: Promise<void>;
    try {
      started = Promise.resolve(run());
    } catch (error) {
      started = Promise.reject(error);
    }
    const current = started.finally(() => {
      task = null;
      if (!queued) return;
      queued = false;
      void requestRefresh().catch(() => {
        // The follow-up run records its own failure. Nothing is awaiting it.
      });
    });
    task = current;
    return current;
  }

  return {
    requestRefresh,
    queueConfigEdit() {
      if (task) {
        queued = true;
        return;
      }
      void requestRefresh().catch(() => {
        // The file watch has no caller to surface the rejection.
      });
    },
  };
}
