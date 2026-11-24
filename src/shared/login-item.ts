export interface LoginItemOptions {
  openAtLogin: boolean;
  path?: string;
}

/**
 * Portable builds unpack to a temp directory and set `PORTABLE_EXECUTABLE_FILE`
 * to the exe the user actually launched. `setLoginItemSettings` otherwise
 * records `process.execPath`, which disappears on the next launch.
 */
export function loginItemOptions(
  openAtLogin: boolean,
  env: { PORTABLE_EXECUTABLE_FILE?: string },
): LoginItemOptions {
  const portable = env.PORTABLE_EXECUTABLE_FILE?.trim();
  if (portable) return { openAtLogin, path: portable };
  return { openAtLogin };
}
