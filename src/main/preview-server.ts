import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { allowedHost, contentType, previewFile } from "../shared/preview";

/**
 * One small static web server on 127.0.0.1 for deep think's websites. It
 * serves one project folder at a time (the last one shown), answers only GET
 * and HEAD from this PC, and stops when Jarvis quits.
 */
export class PreviewServer {
  private server: http.Server | undefined;
  private port = 0;
  private root = "";

  /** Serve root and return the base address, such as http://127.0.0.1:5510 */
  async serve(root: string): Promise<string> {
    this.root = path.resolve(root);
    if (!this.server) await this.listen();
    return `http://127.0.0.1:${this.port}`;
  }

  stop(): void {
    this.server?.close();
    this.server = undefined;
  }

  private listen(): Promise<void> {
    const server = http.createServer((request, response) => this.handle(request, response));
    const tryPort = (port: number): Promise<void> =>
      new Promise((resolve, reject) => {
        const onError = (error: NodeJS.ErrnoException) => {
          server.removeListener("listening", onListening);
          reject(error);
        };
        const onListening = () => {
          server.removeListener("error", onError);
          const address = server.address();
          this.port = typeof address === "object" && address ? address.port : port;
          resolve();
        };
        server.once("error", onError);
        server.once("listening", onListening);
        server.listen(port, "127.0.0.1");
      });
    // A steady port keeps a site's saved settings (localStorage) between runs; any free port if it's taken.
    return tryPort(5510)
      .catch(() => tryPort(0))
      .then(() => {
        this.server = server;
      });
  }

  private handle(request: http.IncomingMessage, response: http.ServerResponse): void {
    const send = (status: number, text: string) => {
      response.writeHead(status, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" });
      response.end(request.method === "HEAD" ? undefined : text);
    };
    if (!allowedHost(request.headers.host, this.port)) return send(403, "Forbidden");
    if (request.method !== "GET" && request.method !== "HEAD") return send(405, "Method not allowed");
    let file = previewFile(this.root, request.url ?? "/", path);
    if (!file) return send(404, "Not found");
    try {
      let stat = fs.statSync(file);
      if (stat.isDirectory()) {
        file = path.join(file, "index.html");
        stat = fs.statSync(file);
      }
      if (!stat.isFile()) return send(404, "Not found");
      // Resolve links so a symlink inside the project can't point outside it.
      const real = fs.realpathSync(file);
      const rel = path.relative(fs.realpathSync(this.root), real);
      if (rel.startsWith("..") || path.isAbsolute(rel)) return send(404, "Not found");
      response.writeHead(200, {
        "Content-Type": contentType(real),
        "Content-Length": stat.size,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      });
      if (request.method === "HEAD") {
        response.end();
        return;
      }
      fs.createReadStream(real).pipe(response);
    } catch {
      send(404, "Not found");
    }
  }
}
