import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

function contentSecurityPolicy(): Plugin {
  return {
    name: "content-security-policy",
    transformIndexHtml(html, ctx) {
      const dev = Boolean(ctx.server);
      const scriptSrc = dev ? "script-src 'self' 'unsafe-inline'" : "script-src 'self'";
      const connectSrc = dev
        ? "connect-src 'self' ws://127.0.0.1:5173 http://127.0.0.1:5173"
        : "connect-src 'self'";
      const policy = [
        "default-src 'self'",
        "base-uri 'none'",
        scriptSrc,
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data:",
        "media-src 'self' blob:",
        connectSrc,
      ].join("; ");
      const meta = `<meta http-equiv="Content-Security-Policy" content="${policy}" />`;
      return html.replace("<head>", `<head>\n    ${meta}`);
    },
  };
}

export default defineConfig({
  base: "./",
  plugins: [react(), contentSecurityPolicy()],
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
  },
  preview: {
    host: "127.0.0.1",
    port: 4173,
    strictPort: true,
  },
  build: {
    outDir: "dist/renderer",
    emptyOutDir: true,
  },
});
