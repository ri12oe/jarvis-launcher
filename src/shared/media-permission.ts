export interface MediaPermissionInput {
  permission: string;
  requestingUrl: string;
  devServerUrl?: string;
  /** A subframe does not get the microphone. */
  mainFrame?: boolean;
}

/**
 * Grant only the `media` permission, and only for this app's own origin.
 * The dev server is that origin while `VITE_DEV_SERVER_URL` is set.
 * A packaged build loads `file://`. Chromium reports that origin as `file://` or `null`.
 */
export function allowMediaPermission(input: MediaPermissionInput): boolean {
  if (input.mainFrame === false) return false;
  if (input.permission !== "media") return false;
  return isOwnAppUrl(input.requestingUrl, input.devServerUrl);
}

export function isOwnAppUrl(requestUrl: string, devServerUrl: string | undefined): boolean {
  if (!requestUrl) return false;
  if (devServerUrl) {
    try {
      return new URL(requestUrl).origin === new URL(devServerUrl).origin;
    } catch {
      return false;
    }
  }
  return requestUrl.startsWith("file://") || requestUrl === "null";
}
