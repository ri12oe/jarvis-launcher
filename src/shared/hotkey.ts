import { DEFAULT_HOTKEY } from "./config";

/**
 * Warnings from one registration attempt.
 * Empty when the requested accelerator is the one that registered.
 * The caller keeps the result on screen until a later attempt returns empty.
 */
export function hotkeyRegistrationWarnings(requested: string, registered: string): string[] {
  const next = requested || DEFAULT_HOTKEY;
  if (registered === next) return [];
  const trying = `Could not register ${next}; trying ${DEFAULT_HOTKEY}`;
  if (next !== DEFAULT_HOTKEY && registered === DEFAULT_HOTKEY) return [trying];
  return [trying, "No global hotkey is registered"];
}
