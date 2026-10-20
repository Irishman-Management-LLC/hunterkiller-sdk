var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var index_exports = {};
__export(index_exports, {
  BASE_URL: () => BASE_URL,
  HunterKillerError: () => HunterKillerError,
  deskRead: () => deskRead,
  symbols: () => symbols,
  watch: () => watch
});
module.exports = __toCommonJS(index_exports);
const BASE_URL = "https://hunterkiller.io";
class HunterKillerError extends Error {
  constructor(status, body) {
    super(`HTTP ${status}: ${JSON.stringify(body)}`);
    this.status = status;
    this.body = body;
  }
  status;
  body;
}
function headers(o, accept) {
  const env = globalThis.process?.env;
  const key = o.key ?? env?.HK_API_KEY;
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
  const res = await get("/api/v1/desk_read", { symbol, ...position, ref: "hunterkiller-ts" }, o);
  return res.json();
}
async function symbols(o = {}) {
  return (await get("/api/v1/desk_read/symbols", {}, o)).json();
}
async function* watch(symbol, thresholdPct = 1.5, o = {}) {
  let sent = 0;
  let delay = 1e3;
  while (!o.signal?.aborted) {
    try {
      const res = await get(
        "/api/v1/desk_read/watch",
        { symbol, threshold_pct: thresholdPct, ref: "hunterkiller-ts" },
        o,
        "text/event-stream"
      );
      delay = 1e3;
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      let event = "message";
      let data = [];
      let reconnect = false;
      while (!reconnect) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let i;
        while ((i = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, i).replace(/\r$/, "");
          buf = buf.slice(i + 1);
          if (line === "") {
            if (data.length && event === "desk_read") {
              yield JSON.parse(data.join("\n"));
              if (o.maxEvents && ++sent >= o.maxEvents) {
                await reader.cancel();
                return;
              }
            } else if (data.length && event === "reconnect") {
              reconnect = true;
            }
            event = "message";
            data = [];
          } else if (line.startsWith(":")) {
            continue;
          } else if (line.startsWith("event:")) {
            event = line.slice(6).trim();
          } else if (line.startsWith("data:")) {
            data.push(line.slice(5).trimStart());
          }
        }
      }
      await reader.cancel().catch(() => {
      });
    } catch (e) {
      if (e instanceof HunterKillerError && e.status !== 429) throw e;
    }
    await new Promise((r) => setTimeout(r, delay));
    delay = Math.min(delay * 2, 3e4);
  }
}
