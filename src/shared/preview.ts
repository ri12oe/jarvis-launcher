/**
 * Pure helpers for the local preview server that shows deep think's websites.
 * Built sites (Vite, React) load their JavaScript as modules, which browsers
 * refuse to run from file://, so Jarvis serves the project folder over
 * http://127.0.0.1 instead.
 */

export interface PreviewPathApi {
  resolve(...parts: string[]): string;
  relative(from: string, to: string): string;
  isAbsolute(file: string): boolean;
}

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".htm": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".wasm": "application/wasm",
  ".pdf": "application/pdf",
};

export function contentType(file: string): string {
  const dot = file.lastIndexOf(".");
  const ext = dot >= 0 ? file.slice(dot).toLowerCase() : "";
  return TYPES[ext] ?? "application/octet-stream";
}

/**
 * The file a request path points to, inside root. Undefined for anything that
 * escapes the folder or touches the project's private parts (.jarvis, .claude,
 * .git, .env files, node_modules).
 */
export function previewFile(root: string, requestPath: string, paths: PreviewPathApi): string | undefined {
  let decoded: string;
  try {
    decoded = decodeURIComponent((requestPath.split(/[?#]/)[0] ?? "/").replace(/\+/g, "%20"));
  } catch {
    return undefined;
  }
  if (decoded.includes("\0")) return undefined;
  const relativePart = decoded.replace(/^[\\/]+/, "");
  const segments = relativePart.split(/[\\/]+/).filter(Boolean);
  if (segments.some((part) => part === ".." || /^\.(jarvis|claude|git|env)/i.test(part) || part.toLowerCase() === "node_modules")) {
    return undefined;
  }
  const base = paths.resolve(root);
  const file = paths.resolve(base, ...segments);
  const rel = paths.relative(base, file);
  if (rel.startsWith("..") || paths.isAbsolute(rel)) return undefined;
  return file;
}

/** Only answer requests addressed to the preview itself, so other sites can't reach it through DNS tricks. */
export function allowedHost(host: string | undefined, port: number): boolean {
  if (!host) return false;
  return host === `127.0.0.1:${port}` || host === `localhost:${port}`;
}

/** URL path for a file inside the served root: dist\index.html -> /dist/index.html */
export function previewUrlPath(root: string, file: string, paths: PreviewPathApi): string | undefined {
  const rel = paths.relative(paths.resolve(root), paths.resolve(file));
  if (rel.startsWith("..") || paths.isAbsolute(rel)) return undefined;
  return "/" + rel.split(/[\\/]+/).filter(Boolean).map(encodeURIComponent).join("/");
}
