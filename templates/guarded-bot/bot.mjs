// bot.ts
import { appendFileSync } from "node:fs";

// node_modules/hunterkiller-sdk/ts/index.mjs
var BASE_URL = "https://hunterkiller.io";
var HunterKillerError = class extends Error {
  constructor(status, body) {
    super(`HTTP ${status}: ${JSON.stringify(body)}`);
    this.status = status;
    this.body = body;
  }
  status;
  body;
};
function headers(o, accept) {
  const key = o.key ?? (typeof process !== "undefined" ? process.env?.HK_API_KEY : void 0);
  const h = { Accept: accept };
  if (key) h.Authorization = `Bearer ${key}`;
  return h;
}
async function get(path, params, o, accept = "application/json") {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== void 0 && v !== null) q.set(k, String(v));
  const f = o.fetch ?? fetch;
  const res = await f(`${o.baseUrl ?? BASE_URL}${path}${q.size ? "?" + q : ""}`, { headers: headers(o, accept) });
  if (!res.ok) {
    let body;
    try {
      body = await res.json();
    } catch {
      body = await res.text().catch(() => "");
    }
    throw new HunterKillerError(res.status, body);
  }
  return res;
}
async function deskRead(symbol, position = {}, o = {}) {
  const res = await get("/api/desk_read", { symbol, ...position, ref: "hunterkiller-ts" }, o);
  return res.json();
}

// bot.ts
var env = process.env;
var SYMBOLS = (env.SYMBOLS ?? "BTCUSDT,ETHUSDT").split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);
var INTERVAL = Number(env.INTERVAL_SECONDS ?? 300);
var LEVERAGE = Number(env.LEVERAGE ?? 5);
var MAX_NOTIONAL = Number(env.MAX_NOTIONAL_USD ?? 1e3);
var LOG = env.DECISIONS_FILE ?? "decisions.jsonl";
var once = process.argv.includes("--once");
function EXCHANGE_ADAPTER(_action, _symbol, _qty, _price) {
}
var book = /* @__PURE__ */ new Map();
var realized = 0;
var sleep = (s) => new Promise((r) => setTimeout(r, s * 1e3));
var num = (x) => typeof x === "number" ? x : void 0;
async function readFor(symbol) {
  const price = (await deskRead(symbol)).price;
  return deskRead(symbol, { side: "long", entry: price, leverage: LEVERAGE });
}
function decide(symbol, r) {
  const price = r.price;
  const verdict = r.verdict;
  const distance = num(r.hurt?.distance_pct);
  const crowdAgainst = r.crowd?.funding_bias === "longs pay";
  const pos = book.get(symbol);
  if (pos) {
    const reason = price <= pos.stop ? "stop" : price >= pos.target ? "target" : verdict === "reduce" || verdict === "skip" ? "verdict_" + verdict : null;
    if (reason) {
      const pnl = (price - pos.entry) * pos.qty;
      realized += pnl;
      book.delete(symbol);
      EXCHANGE_ADAPTER("close", symbol, pos.qty, price);
      return ["close", { reason, pnl_usd: Math.round(pnl * 100) / 100 }];
    }
    return ["hold", { unrealized_usd: Math.round((price - pos.entry) * pos.qty * 100) / 100 }];
  }
  const stop = num(r.stop_suggestion), target = num(r.target_suggestion);
  if (verdict === "proceed" && !crowdAgainst && stop && target && stop < price && price < target) {
    const qty = Math.round(MAX_NOTIONAL * (num(r.confidence) ?? 0.1) / price * 1e6) / 1e6;
    book.set(symbol, { qty, entry: price, stop, target });
    EXCHANGE_ADAPTER("open", symbol, qty, price);
    return ["open", { qty, stop, target }];
  }
  return ["flat", { reason: crowdAgainst && verdict === "proceed" ? "crowd_against" : `verdict_${verdict}`, hurt_distance_pct: distance }];
}
async function cycle() {
  for (const symbol of SYMBOLS) {
    const r = await readFor(symbol);
    const [action, detail] = decide(symbol, r);
    const dist = num(r.hurt?.distance_pct);
    const row = {
      ts: Math.floor(Date.now() / 1e3),
      symbol,
      price: r.price,
      verdict: r.verdict,
      confidence: r.confidence ?? null,
      hurt_distance_pct: dist ?? null,
      crowd: r.crowd?.funding_bias ?? null,
      action,
      ...detail,
      desk_read: r.text
    };
    appendFileSync(LOG, JSON.stringify(row) + "\n");
    console.log(`${symbol} ${r.price} verdict=${r.verdict} conf=${r.confidence ?? null} dist=${dist ?? null}% -> ${action} ${JSON.stringify(detail)} | open=${book.size} realized=$${realized.toFixed(2)}`);
  }
}
while (true) {
  let wait = INTERVAL;
  try {
    await cycle();
    if (once) break;
  } catch (e) {
    if (e instanceof HunterKillerError && e.status !== 429) console.error(`api error ${e.message}; retry in ${wait}s`);
    else if (e instanceof HunterKillerError) {
      const b = e.body ?? {};
      wait = Math.max(Number(b.retry_after ?? b.retry_after_seconds ?? 60), 1);
      console.error(`rate limited; retry in ${wait}s`);
    } else {
      wait = Math.min(INTERVAL, 30);
      console.error(`network error ${e}; retry in ${wait}s`);
    }
    if (once) process.exit(1);
  }
  await sleep(wait);
}
