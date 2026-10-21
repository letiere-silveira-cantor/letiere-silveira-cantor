// Servidor do site: arquivos estáticos + API do painel admin. Sem dependências externas.
const http = require("node:http");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");

const ROOT = __dirname;
loadEnv(path.join(ROOT, ".env"));

const PORT = Number(process.env.PORT) || 3000;
const PASSWORD = process.env.ADMIN_PASSWORD || "";
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(ROOT, "data"));
const UPLOAD_DIR = path.join(DATA_DIR, "uploads");
const CONFIG_FILE = path.join(DATA_DIR, "config.json");
const DEFAULT_CONFIG_FILE = path.join(ROOT, "config.default.json");
const MAX_VIDEO_BYTES = (Number(process.env.MAX_VIDEO_MB) || 500) * 1024 * 1024;
const SESSION_MS = 12 * 60 * 60 * 1000;

if (!PASSWORD) {
  console.error("Defina a senha do admin em ADMIN_PASSWORD (veja .env.example).");
  process.exit(1);
}

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
const VIDEO_TYPES = { "video/mp4": ".mp4", "video/webm": ".webm", "video/quicktime": ".mov" };
const PAGES = { "/": "index.html", "/index.html": "index.html", "/admin": "admin.html", "/admin.html": "admin.html" };

// ---------- Utilidades ----------

function loadEnv(file) {
  let text;
  try { text = fs.readFileSync(file, "utf8"); } catch { return; }
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^(["'])(.*)\1$/, "$2");
  }
}

const clean = (v, max) => String(v ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max);
const isDateKey = (v) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));

function json(res, status, body, headers = {}) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...headers,
  });
  res.end(JSON.stringify(body));
}

function readJson(req, limit = 100 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (c) => {
      size += c.length;
      if (size > limit) { reject(Object.assign(new Error("Conteúdo muito grande."), { status: 413 })); req.destroy(); }
      else chunks.push(c);
    });
    req.on("end", () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}")); }
      catch { reject(Object.assign(new Error("JSON inválido."), { status: 400 })); }
    });
    req.on("error", reject);
  });
}

function youtubeId(url) {
  const s = String(url || "").trim();
  if (/^[\w-]{11}$/.test(s)) return s;
  let u;
  try { u = new URL(s); } catch { return null; }
  const host = u.hostname.replace(/^www\.|^m\./, "");
  let id = null;
  if (host === "youtu.be") id = u.pathname.slice(1);
  else if (host === "youtube.com" || host === "youtube-nocookie.com") {
    id = u.searchParams.get("v") || (u.pathname.match(/^\/(?:embed|shorts|live)\/([^/?]+)/) || [])[1];
  }
  return id && /^[\w-]{11}$/.test(id) ? id : null;
}

// ---------- Configuração (dados do site) ----------

let config;
let saving = Promise.resolve();

async function loadConfig() {
  await fsp.mkdir(UPLOAD_DIR, { recursive: true });
  const defaults = JSON.parse(await fsp.readFile(DEFAULT_CONFIG_FILE, "utf8"));
  try {
    config = { ...defaults, ...JSON.parse(await fsp.readFile(CONFIG_FILE, "utf8")) };
  } catch (err) {
    if (err.code !== "ENOENT") throw err;
    config = defaults;
    await saveConfig();
  }
}

function saveConfig() {
  saving = saving.then(async () => {
    const tmp = CONFIG_FILE + ".tmp";
    await fsp.writeFile(tmp, JSON.stringify(config, null, 2));
    await fsp.rename(tmp, CONFIG_FILE);
  });
  return saving;
}

function publicConfig() {
  const { slogan, promo, busyDates, videos } = config;
  return {
    slogan,
    promo,
    busyDates,
    videos: videos.map((v) => (v.type === "file"
      ? { id: v.id, title: v.title, type: "file", src: `/media/${v.file}` }
      : { id: v.id, title: v.title, type: "youtube", youtubeId: v.youtubeId })),
  };
}

// ---------- Sessões do admin ----------

const sessions = new Map(); // token -> expira em (ms)
const loginFailures = new Map(); // ip -> { count, until }

function sessionToken(req) {
  const m = /(?:^|;\s*)sid=([a-f0-9]{64})/.exec(req.headers.cookie || "");
  return m ? m[1] : null;
}

function isAuthed(req) {
  const token = sessionToken(req);
  const exp = token && sessions.get(token);
  if (!exp) return false;
  if (exp < Date.now()) { sessions.delete(token); return false; }
  return true;
}

function cookie(req, value, maxAge) {
  const secure = req.socket.encrypted || req.headers["x-forwarded-proto"] === "https" ? "; Secure" : "";
  return `sid=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure}`;
}

function passwordMatches(input) {
  const a = crypto.createHash("sha256").update(String(input)).digest();
  const b = crypto.createHash("sha256").update(PASSWORD).digest();
  return crypto.timingSafeEqual(a, b);
}

// Atrás de um proxy (Render, Railway, Nginx…) defina TRUST_PROXY=1 para usar o IP real do visitante.
function clientIp(req) {
  const forwarded = process.env.TRUST_PROXY === "1" && (req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  return forwarded || req.socket.remoteAddress;
}

// ---------- Rotas da API ----------

async function handleApi(req, res, url) {
  const route = `${req.method} ${url.pathname}`;

  if (route === "GET /api/config") return json(res, 200, publicConfig());

  if (route === "GET /api/session") return json(res, 200, { authed: isAuthed(req) });

  if (route === "POST /api/login") {
    const ip = clientIp(req);
    const now = Date.now();
    const prev = loginFailures.get(ip);
    if (prev && prev.blockedUntil > now) {
      return json(res, 429, { error: "Muitas tentativas. Aguarde alguns minutos e tente de novo." });
    }
    const body = await readJson(req, 4096);
    if (!passwordMatches(body.password || "")) {
      // 5 senhas erradas em 15 minutos bloqueiam o login daquele endereço por 10 minutos.
      const rec = prev && now - prev.first < 15 * 60 * 1000 ? prev : { count: 0, first: now, blockedUntil: 0 };
      rec.count++;
      if (rec.count >= 5) Object.assign(rec, { count: 0, first: now, blockedUntil: now + 10 * 60 * 1000 });
      if (loginFailures.size > 10000) loginFailures.clear();
      loginFailures.set(ip, rec);
      return json(res, 401, { error: "Senha incorreta." });
    }
    loginFailures.delete(ip);
    const token = crypto.randomBytes(32).toString("hex");
    sessions.set(token, Date.now() + SESSION_MS);
    return json(res, 200, { ok: true }, { "Set-Cookie": cookie(req, token, SESSION_MS / 1000) });
  }

  if (route === "POST /api/logout") {
    sessions.delete(sessionToken(req));
    return json(res, 200, { ok: true }, { "Set-Cookie": cookie(req, "", 0) });
  }

  if (!url.pathname.startsWith("/api/admin/")) return json(res, 404, { error: "Não encontrado." });

  // Daqui para baixo, só o admin. O cabeçalho extra bloqueia envios de outros sites (CSRF).
  if (!isAuthed(req)) return json(res, 401, { error: "Faça login novamente." });
  if (req.headers["x-admin"] !== "1") return json(res, 403, { error: "Requisição recusada." });

  if (route === "PUT /api/admin/settings") {
    const body = await readJson(req);
    const slogan = {
      text: clean(body.slogan?.text, 120),
      highlight: clean(body.slogan?.highlight, 80),
      subtitle: clean(body.slogan?.subtitle, 200),
    };
    if (!slogan.text && !slogan.highlight) return json(res, 400, { error: "O slogan não pode ficar vazio." });
    const link = clean(body.promo?.link, 500);
    if (link && !/^(https?:\/\/|#)/i.test(link)) {
      return json(res, 400, { error: "O link da promoção deve começar com https:// ou #." });
    }
    const promo = {
      active: Boolean(body.promo?.active),
      text: clean(body.promo?.text, 160),
      buttonText: clean(body.promo?.buttonText, 40),
      link,
    };
    if (promo.active && !promo.text) return json(res, 400, { error: "Escreva o texto da promoção para ativá-la." });
    Object.assign(config, { slogan, promo });
    await saveConfig();
    return json(res, 200, publicConfig());
  }

  if (route === "PUT /api/admin/availability") {
    const body = await readJson(req);
    if (!Array.isArray(body.busyDates) || body.busyDates.length > 2000 || !body.busyDates.every(isDateKey)) {
      return json(res, 400, { error: "Lista de datas inválida." });
    }
    config.busyDates = [...new Set(body.busyDates)].sort();
    await saveConfig();
    return json(res, 200, publicConfig());
  }

  if (route === "POST /api/admin/videos/link") {
    const body = await readJson(req);
    const id = youtubeId(body.url);
    if (!id) return json(res, 400, { error: "Cole um link válido do YouTube." });
    config.videos.unshift({
      id: crypto.randomUUID(), type: "youtube", youtubeId: id,
      title: clean(body.title, 120) || "Vídeo", createdAt: new Date().toISOString(),
    });
    await saveConfig();
    return json(res, 201, publicConfig());
  }

  if (route === "POST /api/admin/videos/upload") return uploadVideo(req, res, url);

  const del = /^DELETE \/api\/admin\/videos\/([\w-]{1,64})$/.exec(route);
  if (del) {
    const video = config.videos.find((v) => v.id === del[1]);
    if (!video) return json(res, 404, { error: "Vídeo não encontrado." });
    config.videos = config.videos.filter((v) => v !== video);
    await saveConfig();
    if (video.type === "file") await fsp.unlink(path.join(UPLOAD_DIR, video.file)).catch(() => {});
    return json(res, 200, publicConfig());
  }

  return json(res, 404, { error: "Não encontrado." });
}

function uploadVideo(req, res, url) {
  const type = (req.headers["content-type"] || "").split(";")[0].trim().toLowerCase();
  const ext = VIDEO_TYPES[type];
  if (!ext) return json(res, 415, { error: "Envie um vídeo MP4, WebM ou MOV." });
  if (Number(req.headers["content-length"]) > MAX_VIDEO_BYTES) {
    return json(res, 413, { error: `O vídeo passa do limite de ${MAX_VIDEO_BYTES / 1024 / 1024} MB.` }, { Connection: "close" });
  }
  const title = clean(url.searchParams.get("title"), 120) || "Vídeo";
  const file = crypto.randomBytes(12).toString("hex") + ext;
  const dest = path.join(UPLOAD_DIR, file);
  const out = fs.createWriteStream(dest);
  let size = 0;
  let failed = false;

  const fail = (status, error) => {
    if (failed) return;
    failed = true;
    req.unpipe(out);
    out.destroy();
    fs.unlink(dest, () => {});
    if (!res.headersSent) json(res, status, { error }, { Connection: "close" });
  };

  req.on("data", (chunk) => {
    size += chunk.length;
    if (size > MAX_VIDEO_BYTES) fail(413, "O vídeo passa do limite permitido.");
  });
  req.on("aborted", () => fail(400, "Envio interrompido."));
  out.on("error", () => fail(500, "Não foi possível salvar o vídeo."));
  out.on("finish", async () => {
    if (failed) return;
    if (size === 0) return fail(400, "Arquivo vazio.");
    config.videos.unshift({ id: crypto.randomUUID(), type: "file", file, title, createdAt: new Date().toISOString() });
    await saveConfig();
    json(res, 201, publicConfig());
  });
  req.pipe(out);
}

// ---------- Arquivos estáticos ----------

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

function notFound(res) {
  res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
  res.end("Página não encontrada.");
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

// ---------- Inicialização ----------

const server = http.createServer(async (req, res) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  const url = new URL(req.url, "http://localhost");
  try {
    if (url.pathname.startsWith("/api/")) await handleApi(req, res, url);
    else handleStatic(req, res, url);
  } catch (err) {
    if (!res.headersSent) json(res, err.status || 500, { error: err.status ? err.message : "Erro no servidor." });
    if (!err.status) console.error(err);
  }
});

loadConfig().then(() => {
  server.listen(PORT, () => console.log(`Site no ar em http://localhost:${PORT}  ·  Admin em /admin`));
});
