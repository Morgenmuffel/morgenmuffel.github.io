#!/usr/bin/env node
/* Local preview that behaves like the Vercel config: clean URLs (/work/x → work/x.html) and the redirects in vercel.json. */
import { createServer } from "node:http";
import { readFileSync, existsSync, statSync, createReadStream } from "node:fs";
import { join, extname, normalize, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = Number(process.env.PORT || 8080);
const { redirects = [] } = JSON.parse(readFileSync(join(ROOT, "vercel.json"), "utf8"));
const TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif", ".mp4": "video/mp4", ".pdf": "application/pdf", ".woff2": "font/woff2", ".bin": "application/octet-stream" };

createServer((req, res) => {
  const url = new URL(req.url, "http://localhost");
  let path = decodeURIComponent(url.pathname);
  const hit = redirects.find((r) => r.source === path || r.source + ".html" === path);
  if (hit) { res.writeHead(308, { Location: hit.destination }); return res.end(); }
  if (path.endsWith(".html")) { res.writeHead(308, { Location: path.slice(0, -5).replace(/\/index$/, "/") }); return res.end(); }
  if (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1);
  const safe = normalize(path).replace(/^(\.\.[/\\])+/, "");
  if (safe.split("/").some((p) => p.startsWith(".") || p === "_private")) { res.writeHead(404); return res.end("Not found"); }
  const tries = [join(ROOT, safe), join(ROOT, safe + ".html"), join(ROOT, safe, "index.html")];
  const file = tries.find((f) => existsSync(f) && statSync(f).isFile());
  if (!file) { res.writeHead(404, { "Content-Type": "text/plain" }); return res.end("Not found"); }
  res.writeHead(200, { "Content-Type": TYPES[extname(file).toLowerCase()] || "application/octet-stream", "Cache-Control": "no-store" });
  createReadStream(file).pipe(res);
}).listen(PORT, () => console.log(`Preview: http://localhost:${PORT}`));
