export interface VoiceTile {
  id: string;
  label: string;
}

export type VoiceCommand =
  | { type: "open"; tileId: string; label: string }
  | { type: "hide" }
  | { type: "refresh" }
  | { type: "stop" }
  | { type: "chat"; text: string };

export type VoiceAction =
  | { type: "hide" }
  | { type: "refresh" }
  | { type: "stop" }
  | { type: "ignore" }
  | { type: "open"; tileId: string; label: string; say: string }
  | { type: "chat"; text: string };

/** Below this, an "open" phrase is chat instead of a launch. */
export const TILE_MATCH_THRESHOLD = 0.72;

const FILLER = new Set(["the", "a", "an", "my", "folder", "app", "application", "program", "please"]);

const HIDE = new Set(["hide", "hide jarvis", "hide the window", "hide the launcher", "hide yourself"]);

const REFRESH = new Set([
  "refresh",
  "refresh tiles",
  "refresh apps",
  "refresh the list",
  "reload",
  "reload tiles",
  "reload the list",
]);

const STOP = new Set(["stop", "cancel", "stop listening", "never mind", "nevermind"]);

export function normalizeSpeech(text: string): string {
  return text
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/** Drop filler words so "the projects folder" matches the Projects tile. */
export function cleanTarget(text: string): string {
  return normalizeSpeech(text)
    .split(" ")
    .filter((token) => token.length > 0 && !FILLER.has(token))
    .join(" ");
}

function levenshtein(left: string, right: string): number {
  const rows = left.length + 1;
  const cols = right.length + 1;
  const grid: number[] = new Array(rows * cols);
  for (let row = 0; row < rows; row++) grid[row * cols] = row;
  for (let col = 0; col < cols; col++) grid[col] = col;
  for (let row = 1; row < rows; row++) {
    for (let col = 1; col < cols; col++) {
      const cost = left.charCodeAt(row - 1) === right.charCodeAt(col - 1) ? 0 : 1;
      const insert = grid[row * cols + (col - 1)] + 1;
      const remove = grid[(row - 1) * cols + col] + 1;
      const replace = grid[(row - 1) * cols + (col - 1)] + cost;
      grid[row * cols + col] = Math.min(insert, remove, replace);
    }
  }
  return grid[rows * cols - 1];
}

function similarity(left: string, right: string): number {
  if (!left || !right) return 0;
  if (left === right) return 1;
  return 1 - levenshtein(left, right) / Math.max(left.length, right.length);
}

/** 1 is an exact label. Short fragments have to match a whole word. */
export function scoreTileLabel(query: string, label: string): number {
  const needle = cleanTarget(query);
  const hay = cleanTarget(label);
  if (needle.length < 2 || !hay) return 0;
  if (needle === hay) return 1;
  const needleTokens = needle.split(" ");
  const hayTokens = hay.split(" ");
  if (needleTokens.every((token) => hayTokens.includes(token))) {
    return 0.9 + 0.08 * (needleTokens.length / hayTokens.length);
  }
  if (needleTokens.length === 1 && needle.length < 4) return 0;
  if (hay.includes(needle)) return 0.86;
  if (needleTokens.length === 1) {
    let best = similarity(needle, hay);
    for (const token of hayTokens) best = Math.max(best, similarity(needle, token));
    return best;
  }
  let total = 0;
  for (const token of needleTokens) {
    let best = 0;
    for (const other of hayTokens) best = Math.max(best, similarity(token, other));
    if (best < 0.75) return Math.max(similarity(needle, hay), 0);
    total += best;
  }
  return total / needleTokens.length;
}

export function matchTile(query: string, tiles: readonly VoiceTile[]): VoiceTile | undefined {
  let best: VoiceTile | undefined;
  let bestScore = TILE_MATCH_THRESHOLD;
  for (const tile of tiles) {
    const score = scoreTileLabel(query, tile.label);
    if (score < bestScore) continue;
    if (score === bestScore && best) {
      const nextGap = Math.abs(cleanTarget(tile.label).length - cleanTarget(query).length);
      const currentGap = Math.abs(cleanTarget(best.label).length - cleanTarget(query).length);
      if (nextGap > currentGap || (nextGap === currentGap && tile.id >= best.id)) continue;
    }
    best = tile;
    bestScore = score;
  }
  return best;
}

export function openingLine(label: string): string {
  return `Opening ${label}.`;
}

/** Local commands win. Anything else is chat text, still after the wake word. */
export function parseVoiceCommand(transcript: string, tiles: readonly VoiceTile[]): VoiceCommand {
  const speech = normalizeSpeech(transcript);
  if (!speech) return { type: "chat", text: "" };
  if (HIDE.has(speech)) return { type: "hide" };
  if (REFRESH.has(speech)) return { type: "refresh" };
  if (STOP.has(speech)) return { type: "stop" };
  const open = /^(?:please )?(?:open|launch|start) (.+)$/.exec(speech);
  if (open) {
    const tile = matchTile(open[1], tiles);
    if (tile) return { type: "open", tileId: tile.id, label: tile.label };
  }
  return { type: "chat", text: transcript.trim() };
}

export function actionForTranscript(transcript: string, tiles: readonly VoiceTile[]): VoiceAction {
  const command = parseVoiceCommand(transcript, tiles);
  if (command.type === "open") {
    return { type: "open", tileId: command.tileId, label: command.label, say: openingLine(command.label) };
  }
  if (command.type === "chat") {
    return command.text.trim() ? { type: "chat", text: command.text.trim() } : { type: "ignore" };
  }
  return command;
}
