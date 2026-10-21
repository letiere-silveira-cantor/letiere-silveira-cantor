// Servidor local / servidor próprio: páginas estáticas + a mesma API usada na Vercel.
// Na Vercel este arquivo não é usado (veja vercel.json e api/handler.js).
const fs = require("node:fs");
const path = require("node:path");

loadEnv(path.join(__dirname, ".env"));
const { handleApi, UPLOAD_DIR, PASSWORD } = require("./lib/app");

const ROOT = __dirname;
const PORT = Number(process.env.PORT) || 3000;
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
};
const PAGES = { "/": "index.html", "/index.html": "index.html", "/admin": "admin.html", "/admin.html": "admin.html" };

if (!PASSWORD) {
  console.error("Defina a senha do admin em ADMIN_PASSWORD (veja .env.example).");
  process.exit(1);
}

function loadEnv(file) {
  let text;
  try { text = fs.readFileSync(file, "utf8"); } catch { return; }
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^(["'])(.*)\1$/, "$2");
  }
}

function notFound(res) {
  res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
  res.end("Página não encontrada.");
}

// Envia um arquivo com suporte a Range (necessário para avançar/voltar vídeos).
function sendFile(req, res, file, cacheControl) {
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) return notFound(res);
    const headers = {
      "Content-Type": MIME[path.extname(file).toLowerCase()] || "application/octet-stream",
      "Accept-Ranges": "bytes",
      "Cache-Control": cacheControl,
    };
    if (file.endsWith("admin.html")) Object.assign(headers, { "X-Frame-Options": "DENY", "X-Robots-Tag": "noindex" });

    let start = 0;
    let end = st.size - 1;
    let status = 200;
    const range = req.headers.range;
    if (range) {
      const m = /^bytes=(\d*)-(\d*)$/.exec(range);
      if (m && m[1] === "" && m[2] !== "") start = Math.max(0, st.size - Number(m[2]));
      else if (m && m[1] !== "") { start = Number(m[1]); if (m[2]) end = Math.min(Number(m[2]), end); }
      if (!m || start > end) {
        res.writeHead(416, { "Content-Range": `bytes */${st.size}` });
        return res.end();
      }
      status = 206;
      headers["Content-Range"] = `bytes ${start}-${end}/${st.size}`;
    }
    headers["Content-Length"] = st.size === 0 ? 0 : end - start + 1;
    res.writeHead(status, headers);
    if (req.method === "HEAD" || st.size === 0) return res.end();
    fs.createReadStream(file, { start, end }).pipe(res);
  });
}

function safeJoin(base, rel) {
  const full = path.join(base, rel);
  return full.startsWith(base + path.sep) ? full : null;
}

function handleStatic(req, res, url) {
  if (req.method !== "GET" && req.method !== "HEAD") return notFound(res);
  let pathname;
  try { pathname = decodeURIComponent(url.pathname); } catch { return notFound(res); }

  if (PAGES[pathname]) return sendFile(req, res, path.join(ROOT, PAGES[pathname]), "no-cache");
  if (pathname.startsWith("/assets/")) {
    const file = safeJoin(path.join(ROOT, "assets"), pathname.slice("/assets/".length));
    return file ? sendFile(req, res, file, "public, max-age=3600") : notFound(res);
  }
  if (pathname.startsWith("/media/")) {
    const file = safeJoin(UPLOAD_DIR, pathname.slice("/media/".length));
    return file ? sendFile(req, res, file, "public, max-age=86400") : notFound(res);
  }
  notFound(res);
}

require("node:http").createServer((req, res) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  const url = new URL(req.url, "http://localhost");
  if (url.pathname.startsWith("/api/")) handleApi(req, res);
  else handleStatic(req, res, url);
}).listen(PORT, () => console.log(`Site no ar em http://localhost:${PORT}  ·  Admin em /admin`));
