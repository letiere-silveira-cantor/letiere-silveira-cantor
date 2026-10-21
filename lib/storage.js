// Armazenamento dos dados do site.
// Na Vercel: Upstash Redis (variáveis KV_REST_API_URL/KV_REST_API_TOKEN ou UPSTASH_REDIS_REST_URL/_TOKEN).
// Em servidor próprio: arquivos JSON em DATA_DIR.
const fsp = require("node:fs/promises");
const path = require("node:path");

const REDIS_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const PREFIX = "letieri:";

async function redis(...command) {
  const res = await fetch(REDIS_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${REDIS_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(command),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) throw new Error(`Redis: ${data.error || res.status}`);
  return data.result;
}

const redisStore = {
  kind: "redis",
  async get(key) {
    const value = await redis("GET", PREFIX + key);
    return value == null ? null : JSON.parse(value);
  },
  async set(key, value) {
    await redis("SET", PREFIX + key, JSON.stringify(value));
  },
  // Conta uma ocorrência numa janela de ttlSec segundos e devolve o total.
  async hit(key, ttlSec) {
    const n = await redis("INCR", PREFIX + key);
    if (n === 1) await redis("EXPIRE", PREFIX + key, ttlSec);
    return n;
  },
  async count(key) {
    return Number(await redis("GET", PREFIX + key)) || 0;
  },
  async clear(key) {
    await redis("DEL", PREFIX + key);
  },
};

function fileStore(dir) {
  const counters = new Map();
  let queue = Promise.resolve();
  const file = (key) => path.join(dir, `${key}.json`);
  const live = (key) => {
    const c = counters.get(key);
    return c && c.exp > Date.now() ? c : null;
  };
  return {
    kind: "file",
    async get(key) {
      try {
        return JSON.parse(await fsp.readFile(file(key), "utf8"));
      } catch (err) {
        if (err.code === "ENOENT") return null;
        throw err;
      }
    },
    set(key, value) {
      const op = queue.catch(() => {}).then(async () => {
        await fsp.mkdir(dir, { recursive: true });
        const tmp = `${file(key)}.tmp`;
        await fsp.writeFile(tmp, JSON.stringify(value, null, 2));
        await fsp.rename(tmp, file(key));
      });
      queue = op;
      return op;
    },
    async hit(key, ttlSec) {
      const c = live(key) || { n: 0, exp: Date.now() + ttlSec * 1000 };
      c.n++;
      if (counters.size > 10000) counters.clear();
      counters.set(key, c);
      return c.n;
    },
    async count(key) {
      return live(key)?.n || 0;
    },
    async clear(key) {
      counters.delete(key);
    },
  };
}

// Na Vercel o disco é somente leitura: sem Redis configurado, não há onde salvar.
function createStore(dataDir) {
  if (REDIS_URL && REDIS_TOKEN) return redisStore;
  if (process.env.VERCEL) return null;
  return fileStore(dataDir);
}

module.exports = { createStore };
