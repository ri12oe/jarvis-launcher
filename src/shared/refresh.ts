/** Footer label. `REFRESHING` is only shown while a refresh is in flight. */
export function refreshControlLabel(running: boolean): "REFRESH" | "REFRESHING" {
  return running ? "REFRESHING" : "REFRESH";
}

/** A click starts a refresh only when one is not already running. */
export function acceptRefreshClick(running: boolean): boolean {
  return !running;
}
