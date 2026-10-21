// API do site e do painel admin. Usada pela função da Vercel (api/handler.js) e pelo servidor local (server.js).
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const { createStore } = require("./storage");
const DEFAULT_CONFIG = require("../config.default.json");

const ROOT = path.join(__dirname, "..");
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(ROOT, "data"));
const UPLOAD_DIR = path.join(DATA_DIR, "uploads");
const PASSWORD = process.env.ADMIN_PASSWORD || "";
const BLOB_TOKEN = process.env.BLOB_READ_WRITE_TOKEN || "";
const MAX_VIDEO_BYTES = (Number(process.env.MAX_VIDEO_MB) || 500) * 1024 * 1024;
const SESSION_MS = 12 * 60 * 60 * 1000;
const TRUST_PROXY = process.env.TRUST_PROXY === "1" || Boolean(process.env.VERCEL);
const SESSION_SECRET = process.env.SESSION_SECRET
  || crypto.createHash("sha256").update(`letieri-sessao:${PASSWORD}`).digest("hex");
const VIDEO_TYPES = { "video/mp4": ".mp4", "video/webm": ".webm", "video/quicktime": ".mov" };

const store = createStore(DATA_DIR);
// Vídeos: Vercel Blob quando houver token; senão, pasta local (só fora da Vercel).
const uploadMode = BLOB_TOKEN ? "blob" : store?.kind === "file" ? "local" : "none";

// ---------- Utilidades ----------

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

const clean = (v, max) => String(v ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max);
const isDateKey = (v) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));

function json(res, status, body, headers = {}) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...headers });
  res.end(JSON.stringify(body));
}

// Na Vercel o corpo já vem lido em req.body; no servidor local lemos o stream.
function readJson(req, limit = 100 * 1024) {
  if (req.body !== undefined) {
    const b = req.body;
    if (b === null || b === "") return Promise.resolve({});
    if (typeof b === "object" && !Buffer.isBuffer(b)) return Promise.resolve(b);
    try { return Promise.resolve(JSON.parse(String(b))); }
    catch { return Promise.reject(new HttpError(400, "JSON inválido.")); }
  }
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (c) => {
      size += c.length;
      if (size > limit) { reject(new HttpError(413, "Conteúdo muito grande.")); req.destroy(); }
      else chunks.push(c);
    });
    req.on("end", () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}")); }
      catch { reject(new HttpError(400, "JSON inválido.")); }
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

function requireStore() {
  if (!store) throw new HttpError(503, "Banco de dados não configurado. Conecte o Upstash Redis ao projeto na Vercel.");
  return store;
}

// ---------- Dados ----------

async function getConfig() {
  const saved = store ? await store.get("config") : null;
  return { ...structuredClone(DEFAULT_CONFIG), ...(saved || {}) };
}

async function getShows() {
  return (store && (await store.get("shows"))) || [];
}

async function getFixed() {
  return (store && (await store.get("fixed"))) || [];
}

// ---------- Datas fixas (ex.: toda sexta no Coco Bambu) ----------

const isoDay = (d) => d.toISOString().slice(0, 10);
const addDays = (key, n) => { const d = new Date(`${key}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return isoDay(d); };

// Datas em que uma data fixa acontece, de hoje até 2 anos à frente.
function fixedOccurrences(f) {
  if (f.repeat !== "weekly") return [f.date];
  const today = isoDay(new Date());
  const horizon = addDays(today, 730);
  const end = f.until && f.until < horizon ? f.until : horizon;
  let day = f.date;
  if (day < today) {
    const behind = Math.round((Date.parse(today) - Date.parse(day)) / 86400000);
    day = addDays(day, Math.ceil(behind / 7) * 7);
  }
  const out = [];
  for (; day <= end && out.length < 120; day = addDays(day, 7)) out.push(day);
  return out;
}

function cleanFixed(body) {
  if (!isDateKey(body.date)) throw new HttpError(400, "Escolha a data fixa.");
  const venue = clean(body.venue, 80);
  if (!venue) throw new HttpError(400, "Informe o local da data fixa.");
  const repeat = body.repeat === "weekly" ? "weekly" : "none";
  const until = repeat === "weekly" && body.until ? body.until : "";
  if (until && (!isDateKey(until) || until < body.date)) throw new HttpError(400, "A data final deve ser depois da data inicial.");
  return { date: body.date, venue, repeat, until };
}

// O que o site público recebe. As datas fixas entram como ocupadas, sem mostrar o local.
async function publicView(config) {
  const fixedDays = (await getFixed()).flatMap(fixedOccurrences);
  const { slogan, promo, videos } = config;
  return {
    slogan,
    promo,
    busyDates: [...new Set([...config.busyDates, ...fixedDays])].sort(),
    videos: videos.map((v) => {
      if (v.type === "youtube") return { id: v.id, title: v.title, type: "youtube", youtubeId: v.youtubeId };
      return { id: v.id, title: v.title, type: "file", src: v.type === "blob" ? v.url : `/media/${v.file}` };
    }),
  };
}

function cleanShow(body) {
  if (!isDateKey(body.date)) throw new HttpError(400, "Informe a data do show.");
  const title = clean(body.title, 120);
  if (!title) throw new HttpError(400, "Informe o cliente ou o local do show.");
  const value = Number(body.value);
  if (!Number.isInteger(value) || value < 0 || value > 100_000_000) throw new HttpError(400, "Valor fechado inválido.");
  return { date: body.date, title, type: clean(body.type, 40), value, notes: clean(body.notes, 300) };
}

// ---------- Sessão (cookie assinado, funciona sem memória no servidor) ----------

const sign = (data) => crypto.createHmac("sha256", SESSION_SECRET).update(data).digest("hex");

function makeToken() {
  const exp = String(Date.now() + SESSION_MS);
  return `${exp}.${sign(exp)}`;
}

function isAuthed(req) {
  const m = /(?:^|;\s*)sid=(\d{13})\.([a-f0-9]{64})/.exec(req.headers.cookie || "");
  if (!m || Number(m[1]) < Date.now()) return false;
  const expected = Buffer.from(sign(m[1]), "hex");
  return crypto.timingSafeEqual(expected, Buffer.from(m[2], "hex"));
}

function cookie(req, value, maxAge) {
  const https = process.env.VERCEL || req.socket?.encrypted || req.headers["x-forwarded-proto"] === "https";
  const secure = https ? "; Secure" : "";
  return `sid=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure}`;
}

function passwordMatches(input) {
  const a = crypto.createHash("sha256").update(String(input)).digest();
  const b = crypto.createHash("sha256").update(PASSWORD).digest();
  return crypto.timingSafeEqual(a, b);
}

function clientIp(req) {
  const forwarded = TRUST_PROXY && (req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  return forwarded || req.socket?.remoteAddress || "desconhecido";
}

// ---------- Rotas ----------

async function route(req, res, pathname, url) {
  const r = `${req.method} ${pathname}`;

  if (r === "GET /api/config") return json(res, 200, await publicView(await getConfig()));

  if (r === "GET /api/session") return json(res, 200, { authed: isAuthed(req), uploads: uploadMode });

  if (r === "POST /api/login") {
    if (!PASSWORD) throw new HttpError(503, "Senha do admin não configurada (ADMIN_PASSWORD).");
    const db = requireStore();
    // 5 senhas erradas em 15 minutos bloqueiam o login daquele endereço até a janela acabar.
    const failKey = `falhas:${crypto.createHash("sha256").update(clientIp(req)).digest("hex").slice(0, 24)}`;
    if ((await db.count(failKey)) >= 5) {
      return json(res, 429, { error: "Muitas tentativas. Aguarde alguns minutos e tente de novo." });
    }
    const body = await readJson(req, 4096);
    if (!passwordMatches(body.password || "")) {
      await db.hit(failKey, 15 * 60);
      return json(res, 401, { error: "Senha incorreta." });
    }
    await db.clear(failKey);
    return json(res, 200, { ok: true }, { "Set-Cookie": cookie(req, makeToken(), SESSION_MS / 1000) });
  }

  if (r === "POST /api/logout") return json(res, 200, { ok: true }, { "Set-Cookie": cookie(req, "", 0) });

  if (!pathname.startsWith("/api/admin/")) throw new HttpError(404, "Não encontrado.");

  // Daqui para baixo, só o admin. O cabeçalho extra bloqueia envios de outros sites (CSRF).
  if (!isAuthed(req)) throw new HttpError(401, "Faça login novamente.");
  if (req.headers["x-admin"] !== "1") throw new HttpError(403, "Requisição recusada.");
  const db = requireStore();

  if (r === "PUT /api/admin/settings") {
    const body = await readJson(req);
    const slogan = {
      text: clean(body.slogan?.text, 120),
      highlight: clean(body.slogan?.highlight, 80),
      subtitle: clean(body.slogan?.subtitle, 200),
    };
    if (!slogan.text && !slogan.highlight) throw new HttpError(400, "O slogan não pode ficar vazio.");
    const link = clean(body.promo?.link, 500);
    if (link && !/^(https?:\/\/|#)/i.test(link)) throw new HttpError(400, "O link da oferta deve começar com https:// ou #.");
    const promo = {
      active: Boolean(body.promo?.active),
      title: clean(body.promo?.title, 40),
      text: clean(body.promo?.text, 160),
      buttonText: clean(body.promo?.buttonText, 40),
      link,
    };
    if (promo.active && !promo.text) throw new HttpError(400, "Escreva o texto da oferta para ativá-la.");
    const config = { ...(await getConfig()), slogan, promo };
    await db.set("config", config);
    return json(res, 200, await publicView(config));
  }

  if (r === "PUT /api/admin/availability") {
    const body = await readJson(req);
    if (!Array.isArray(body.busyDates) || body.busyDates.length > 2000 || !body.busyDates.every(isDateKey)) {
      throw new HttpError(400, "Lista de datas inválida.");
    }
    const config = { ...(await getConfig()), busyDates: [...new Set(body.busyDates)].sort() };
    await db.set("config", config);
    return json(res, 200, await publicView(config));
  }

  // ----- Shows (dashboard) -----
  if (r === "GET /api/admin/shows") return json(res, 200, { shows: await getShows() });

  // ----- Datas fixas -----
  const withOccurrences = (list) => list.map((f) => ({ ...f, occurrences: fixedOccurrences(f) }));

  // Agenda do admin: datas marcadas à mão e datas fixas, separadas.
  if (r === "GET /api/admin/agenda") {
    const config = await getConfig();
    return json(res, 200, { busyDates: config.busyDates, fixed: withOccurrences(await getFixed()) });
  }

  if (r === "POST /api/admin/fixed") {
    const fixed = await getFixed();
    if (fixed.length >= 200) throw new HttpError(400, "Limite de datas fixas atingido.");
    const item = { id: crypto.randomUUID(), ...cleanFixed(await readJson(req)), createdAt: new Date().toISOString() };
    fixed.push(item);
    await db.set("fixed", fixed);
    // A data fixa passa a mandar nesses dias: tira as marcações manuais deles.
    const days = new Set(fixedOccurrences(item));
    const config = await getConfig();
    config.busyDates = config.busyDates.filter((d) => !days.has(d));
    await db.set("config", config);
    return json(res, 201, { fixed: withOccurrences(fixed), busyDates: config.busyDates, config: await publicView(config) });
  }

  const fixedDel = /^DELETE \/api\/admin\/fixed\/([\w-]{1,64})$/.exec(r);
  if (fixedDel) {
    const fixed = await getFixed();
    const next = fixed.filter((f) => f.id !== fixedDel[1]);
    if (next.length === fixed.length) throw new HttpError(404, "Data fixa não encontrada.");
    await db.set("fixed", next);
    return json(res, 200, { fixed: withOccurrences(next), config: await publicView(await getConfig()) });
  }

  if (r === "POST /api/admin/shows") {
    const body = await readJson(req);
    const show = { id: crypto.randomUUID(), ...cleanShow(body), createdAt: new Date().toISOString() };
    const shows = [...(await getShows()), show];
    await db.set("shows", shows);
    let config = await getConfig();
    if (body.markBusy && !config.busyDates.includes(show.date)) {
      config = { ...config, busyDates: [...config.busyDates, show.date].sort() };
      await db.set("config", config);
    }
    return json(res, 201, { shows, busyDates: config.busyDates, config: await publicView(config) });
  }

  const showRoute = /^(PUT|DELETE) \/api\/admin\/shows\/([\w-]{1,64})$/.exec(r);
  if (showRoute) {
    const shows = await getShows();
    const i = shows.findIndex((s) => s.id === showRoute[2]);
    if (i < 0) throw new HttpError(404, "Show não encontrado.");
    if (showRoute[1] === "DELETE") shows.splice(i, 1);
    else shows[i] = { ...shows[i], ...cleanShow(await readJson(req)) };
    await db.set("shows", shows);
    return json(res, 200, { shows });
  }

  // ----- Vídeos -----
  if (r === "POST /api/admin/videos/link") {
    const body = await readJson(req);
    const id = youtubeId(body.url);
    if (!id) throw new HttpError(400, "Cole um link válido do YouTube.");
    const config = await getConfig();
    config.videos = [{
      id: crypto.randomUUID(), type: "youtube", youtubeId: id,
      title: clean(body.title, 120) || "Vídeo", createdAt: new Date().toISOString(),
    }, ...config.videos];
    await db.set("config", config);
    return json(res, 201, await publicView(config));
  }

  // Vercel Blob, passo 1: o navegador pede uma autorização para enviar direto ao Blob (sem passar pela função).
  if (r === "POST /api/admin/videos/blob-token") {
    if (uploadMode !== "blob") throw new HttpError(400, "Vercel Blob não configurado.");
    const body = await readJson(req);
    const ext = VIDEO_TYPES[body.contentType];
    if (!ext) throw new HttpError(415, "Envie um vídeo MP4, WebM ou MOV.");
    if (Number(body.size) > MAX_VIDEO_BYTES) throw new HttpError(413, `O vídeo passa do limite de ${MAX_VIDEO_BYTES / 1024 / 1024} MB.`);
    const { generateClientTokenFromReadWriteToken } = require("@vercel/blob/client");
    const pathname = `videos/${crypto.randomBytes(12).toString("hex")}${ext}`;
    const token = await generateClientTokenFromReadWriteToken({
      token: BLOB_TOKEN,
      pathname,
      allowedContentTypes: [body.contentType],
      maximumSizeInBytes: MAX_VIDEO_BYTES,
      validUntil: Date.now() + 60 * 60 * 1000,
    });
    return json(res, 200, { token, pathname });
  }

  // Vercel Blob, passo 2: depois do envio, registra o vídeo no site.
  if (r === "POST /api/admin/videos/blob") {
    if (uploadMode !== "blob") throw new HttpError(400, "Vercel Blob não configurado.");
    const body = await readJson(req);
    let u;
    try { u = new URL(body.url); } catch { throw new HttpError(400, "Endereço do vídeo inválido."); }
    if (u.protocol !== "https:" || !u.hostname.endsWith(".blob.vercel-storage.com") || !/^\/videos\/[a-f0-9]{24}(-[A-Za-z0-9]+)?\.(mp4|webm|mov)$/.test(u.pathname)) {
      throw new HttpError(400, "Endereço do vídeo inválido.");
    }
    const config = await getConfig();
    config.videos = [{
      id: crypto.randomUUID(), type: "blob", url: u.href,
      title: clean(body.title, 120) || "Vídeo", createdAt: new Date().toISOString(),
    }, ...config.videos];
    await db.set("config", config);
    return json(res, 201, await publicView(config));
  }

  if (r === "POST /api/admin/videos/upload") {
    if (uploadMode !== "local") throw new HttpError(400, "Use o envio pelo Vercel Blob.");
    return uploadLocal(req, res, url);
  }

  const del = /^DELETE \/api\/admin\/videos\/([\w-]{1,64})$/.exec(r);
  if (del) {
    const config = await getConfig();
    const video = config.videos.find((v) => v.id === del[1]);
    if (!video) throw new HttpError(404, "Vídeo não encontrado.");
    config.videos = config.videos.filter((v) => v !== video);
    await db.set("config", config);
    if (video.type === "file") await fsp.unlink(path.join(UPLOAD_DIR, video.file)).catch(() => {});
    if (video.type === "blob" && BLOB_TOKEN) {
      const { del: delBlob } = require("@vercel/blob");
      await delBlob(video.url, { token: BLOB_TOKEN }).catch((err) => console.error("Blob:", err.message));
    }
    return json(res, 200, await publicView(config));
  }

  throw new HttpError(404, "Não encontrado.");
}

// Envio de vídeo para a pasta local (servidor próprio). O corpo da requisição é o próprio arquivo.
async function uploadLocal(req, res, url) {
  const type = (req.headers["content-type"] || "").split(";")[0].trim().toLowerCase();
  const ext = VIDEO_TYPES[type];
  if (!ext) return json(res, 415, { error: "Envie um vídeo MP4, WebM ou MOV." });
  if (Number(req.headers["content-length"]) > MAX_VIDEO_BYTES) {
    return json(res, 413, { error: `O vídeo passa do limite de ${MAX_VIDEO_BYTES / 1024 / 1024} MB.` }, { Connection: "close" });
  }
  await fsp.mkdir(UPLOAD_DIR, { recursive: true });
  const title = clean(url.searchParams.get("title"), 120) || "Vídeo";
  const file = crypto.randomBytes(12).toString("hex") + ext;
  const dest = path.join(UPLOAD_DIR, file);
  const out = fs.createWriteStream(dest);
  let size = 0;
  let failed = false;

  return new Promise((resolve) => {
    const fail = (status, error) => {
      if (failed) return;
      failed = true;
      req.unpipe(out);
      out.destroy();
      fs.unlink(dest, () => {});
      if (!res.headersSent) json(res, status, { error }, { Connection: "close" });
      resolve();
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
      try {
        const config = await getConfig();
        config.videos = [{ id: crypto.randomUUID(), type: "file", file, title, createdAt: new Date().toISOString() }, ...config.videos];
        await store.set("config", config);
        json(res, 201, await publicView(config));
      } catch (err) {
        console.error(err);
        json(res, 500, { error: "Não foi possível salvar o vídeo." });
      }
      resolve();
    });
    req.pipe(out);
  });
}

async function handleApi(req, res) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  const url = new URL(req.url, "http://localhost");
  // Na Vercel, /api/* é reescrito para /api/handler?route=*.
  let pathname = url.pathname;
  if (!pathname.startsWith("/api/") || pathname === "/api/handler") pathname = `/api/${url.searchParams.get("route") || ""}`;
  pathname = pathname.replace(/\/+$/, "");
  try {
    await route(req, res, pathname, url);
  } catch (err) {
    if (!res.headersSent) json(res, err.status || 500, { error: err.status ? err.message : "Erro no servidor." });
    if (!err.status) console.error(err);
  }
}

module.exports = { handleApi, UPLOAD_DIR, PASSWORD };
