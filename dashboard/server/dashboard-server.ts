import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";

const HOST = "127.0.0.1";
const PORT = Number.parseInt(process.env.DASHBOARD_PORT ?? "4310", 10);
const STATIC_ROOT = resolve(import.meta.dirname, "..", "dist");

const contentTypes: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
};

function securityHeaders(response: ServerResponse): void {
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader("X-Frame-Options", "DENY");
  response.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  response.setHeader(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), payment=()",
  );
}

function resolveStaticPath(pathname: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  if (decoded.includes("\0")) return null;
  const candidate = resolve(
    STATIC_ROOT,
    decoded === "/" ? "index.html" : `.${decoded}`,
  );
  return candidate === STATIC_ROOT ||
    candidate.startsWith(`${STATIC_ROOT}${sep}`)
    ? candidate
    : null;
}

async function serveFile(
  filePath: string,
  pathname: string,
  request: IncomingMessage,
  response: ServerResponse,
): Promise<boolean> {
  try {
    const fileStat = await stat(filePath);
    if (!fileStat.isFile()) return false;
    const body = await readFile(filePath);
    response.writeHead(200, {
      "Content-Type": contentTypes[extname(filePath)] ?? "application/octet-stream",
      "Content-Length": body.byteLength,
      "Cache-Control": pathname.startsWith("/assets/")
        ? "public, max-age=31536000, immutable"
        : "no-store",
    });
    response.end(request.method === "HEAD" ? undefined : body);
    return true;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT" || code === "ENOTDIR") return false;
    throw error;
  }
}

const server = createServer(async (request, response) => {
  securityHeaders(response);
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405, { Allow: "GET, HEAD" });
    response.end("Method Not Allowed");
    return;
  }

  try {
    const pathname = new URL(request.url ?? "/", `http://${HOST}:${PORT}`).pathname;
    const filePath = resolveStaticPath(pathname);
    if (!filePath) {
      response.writeHead(400);
      response.end("Bad Request");
      return;
    }
    if (await serveFile(filePath, pathname, request, response)) return;
    response.writeHead(404);
    response.end("Not Found");
  } catch {
    response.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Dashboard unavailable");
  }
});

server.listen(PORT, HOST, () => {
  console.log(`TRAMA disponible en http://${HOST}:${PORT}`);
});
