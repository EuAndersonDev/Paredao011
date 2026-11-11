// Local dev server, no dependencies: builds once, serves dist/ like Vercel (clean URLs)
// and runs api/trip.js for POST /api/trip.
// Usage: npm run dev   (set GOOGLE_MAPS_API_KEY in your shell or in .env.local)
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DIST = join(ROOT, "dist");
const PORT = Number(process.env.PORT) || 3000;

const envFile = join(ROOT, ".env.local");
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*"?(.*?)"?\s*$/.exec(line);
    if (match && !(match[1] in process.env)) process.env[match[1]] = match[2];
  }
}
if (!process.env.GOOGLE_MAPS_API_KEY) {
  console.warn("GOOGLE_MAPS_API_KEY is not set: /api/trip will answer 500 and the simulator will show an error.");
}

execFileSync(process.execPath, [join(ROOT, "scripts/build.mjs")], { stdio: "inherit" });
const tripHandler = createRequire(import.meta.url)(join(ROOT, "api/trip.js"));

const TYPES = {
  ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".json": "application/json",
  ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".avif": "image/avif",
  ".ico": "image/x-icon", ".woff2": "font/woff2", ".txt": "text/plain; charset=utf-8", ".xml": "application/xml",
  ".webmanifest": "application/manifest+json"
};

function runApi(request, response) {
  let body = "";
  request.on("data", (chunk) => { body += chunk; });
  request.on("end", () => {
    request.body = body;
    const res = {
      status(code) { response.statusCode = code; return res; },
      setHeader(name, value) { response.setHeader(name, value); return res; },
      json(data) { response.setHeader("Content-Type", "application/json"); response.end(JSON.stringify(data)); return res; }
    };
    Promise.resolve(tripHandler(request, res)).catch((error) => {
      console.error(error);
      response.statusCode = 500;
      response.end();
    });
  });
}

createServer((request, response) => {
  const path = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
  if (path === "/api/trip") return runApi(request, response);

  let file = normalize(join(DIST, path === "/" ? "index.html" : path));
  if (!file.startsWith(DIST)) { response.statusCode = 403; return response.end(); }
  if (!extname(file)) file += ".html";
  if (!existsSync(file) || statSync(file).isDirectory()) { response.statusCode = 404; return response.end("Not found"); }
  response.setHeader("Content-Type", TYPES[extname(file)] || "application/octet-stream");
  response.end(readFileSync(file));
}).listen(PORT, () => console.log(`Dev server: http://localhost:${PORT}  (rebuild: restart the command)`));
