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

// ts/index.ts
var index_exports = {};
__export(index_exports, {
  BASE_URL: () => BASE_URL,
  EventSubscription: () => EventSubscription,
  FeedError: () => FeedError,
  HunterKillerError: () => HunterKillerError,
  ReplayGapError: () => ReplayGapError,
  deskRead: () => deskRead,
  replayEvents: () => replayEvents,
  subscribeEvents: () => subscribeEvents,
  symbols: () => symbols,
  watch: () => watch
});
module.exports = __toCommonJS(index_exports);

// ts/events.ts
var FeedError = class extends Error {
  constructor(code, frame) {
    super(code);
    this.code = code;
    this.frame = frame;
  }
};
var ReplayGapError = class extends FeedError {
};
function cursor(value) {
  if (value == null) return void 0;
  if (typeof value !== "string" || !value || value.length > 4096 || /[\x00-\x1f\x7f]/.test(value))
    throw new TypeError("cursor must be an opaque nonempty header-safe string");
  return value;
}
function symbol(value) {
  if (typeof value !== "string" || !value.trim()) throw new TypeError("symbol is required");
  return value.trim().toUpperCase();
}
function record(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function parse(text) {
  let body;
  try {
    body = JSON.parse(text, (_key, value) => {
      if (typeof value === "number" && !Number.isFinite(value)) throw new Error("nonfinite");
      return value;
    });
  } catch {
    throw new FeedError("invalid_event_json");
  }
  if (!record(body)) throw new FeedError("invalid_event_json");
  return body;
}
function envelope(body, scope, id, event) {
  const fields = [
    "schema_version",
    "event_id",
    "event",
    "symbol",
    "tier",
    "observed_at",
    "snapshot_id",
    "previous_snapshot_id",
    "reference_id",
    "read_version",
    "provenance",
    "data"
  ];
  if (fields.some((k) => !(k in body)) || body.schema_version !== 2 || body.symbol !== scope || body.tier !== "live" && body.tier !== "delayed" || typeof body.event !== "string" || !body.event || typeof body.observed_at !== "number" || !Number.isFinite(body.observed_at) || ["snapshot_id", "previous_snapshot_id", "reference_id", "read_version"].some((k) => body[k] !== null && typeof body[k] !== "string") || !record(body.provenance) || !record(body.data)) throw new FeedError("invalid_event_envelope");
  try {
    if (typeof body.event_id !== "string" || !cursor(body.event_id)) throw new Error();
  } catch {
    throw new FeedError("invalid_event_envelope");
  }
  if (id !== void 0 && body.event_id !== id || event !== void 0 && body.event !== event)
    throw new FeedError("event_identity_mismatch");
  return body;
}
function canonical(value) {
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (record(value)) return "{" + Object.keys(value).sort().map((k) => JSON.stringify(k) + ":" + canonical(value[k])).join(",") + "}";
  const encoded = JSON.stringify(value);
  if (typeof encoded !== "string") throw new FeedError("invalid_event_json");
  return encoded;
}
var Parser = class {
  decoder = new TextDecoder();
  buffer = "";
  skipLF = false;
  event = "message";
  id;
  data = [];
  size = 0;
  retryMs;
  line(line) {
    if (!line) {
      const frame = this.data.length ? { event: this.event || "message", id: this.id, data: parse(this.data.join("\n")) } : void 0;
      this.event = "message";
      this.id = void 0;
      this.data = [];
      this.size = 0;
      return frame;
    }
    if (line.startsWith(":")) return;
    const at = line.indexOf(":");
    const name = at < 0 ? line : line.slice(0, at);
    let value = at < 0 ? "" : line.slice(at + 1);
    if (value.startsWith(" ")) value = value.slice(1);
    if (name === "data") {
      this.size += value.length + 1;
      if (this.size > 1024 * 1024) throw new FeedError("event_frame_too_large");
      this.data.push(value);
    } else if (name === "event") this.event = value;
    else if (name === "id" && !value.includes("\0")) this.id = value;
    else if (name === "retry" && /^[0-9]+$/.test(value)) this.retryMs = Math.max(100, Math.min(Number(value), 3e4));
  }
  *feed(chunk, final = false) {
    let text = this.decoder.decode(chunk, { stream: !final });
    if (this.skipLF && text) {
      if (text.startsWith("\n")) text = text.slice(1);
      this.skipLF = false;
    }
    this.buffer += text;
    while (true) {
      const at = this.buffer.search(/[\r\n]/);
      if (at < 0) break;
      this.skipLF = this.buffer[at] === "\r" && at + 1 === this.buffer.length;
      const step = this.buffer.slice(at, at + 2) === "\r\n" ? 2 : 1;
      const line = this.buffer.slice(0, at);
      this.buffer = this.buffer.slice(at + step);
      const frame = this.line(line);
      if (frame) yield frame;
    }
    if (this.buffer.length + this.size > 1024 * 1024) throw new FeedError("event_frame_too_large");
  }
};
function auth(o) {
  const env = globalThis.process?.env;
  const key = o.key ?? env?.HK_API_KEY;
  return key ? { Authorization: "Bearer " + key } : {};
}
async function request(path, params, o, accept, signal, after) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value !== void 0 && value !== null) query.set(key, String(value));
  const headers2 = { ...auth(o), Accept: accept };
  if (after !== void 0) headers2["Last-Event-ID"] = Array.from(new TextEncoder().encode(after), (byte) => String.fromCharCode(byte)).join("");
  const response = await (o.fetch ?? fetch)(`${o.baseUrl ?? BASE_URL}${path}?${query}`, { headers: headers2, signal });
  if (!response.ok) {
    const text = await response.text();
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      body = { error: text.slice(0, 200) };
    }
    throw new HunterKillerError(response.status, body);
  }
  return response;
}
async function replayEvents(pair, options = {}) {
  const scope = symbol(pair), after = cursor(options.after), limit = options.limit ?? 100;
  if (!Number.isInteger(limit) || limit < 1 || limit > 500) throw new TypeError("limit must be an integer from 1 to 500");
  const response = await request("/api/events/replay", {
    symbol: scope,
    after,
    since: options.since,
    until: options.until,
    limit
  }, options, "application/json", options.signal);
  const page = parse(await response.text());
  if (page.ok !== true || page.schema_version !== 2 || page.symbol !== scope || !["live", "delayed"].includes(String(page.tier)) || !Array.isArray(page.events) || typeof page.has_more !== "boolean" || !("next_cursor" in page)) throw new FeedError("invalid_replay_page");
  for (const item of page.events) {
    if (!record(item) || envelope(item, scope).tier !== page.tier) throw new FeedError("replay_scope_changed");
  }
  const expected = page.events.length ? page.events.at(-1).event_id : after ?? null;
  if (page.next_cursor !== expected || page.has_more && !page.events.length) throw new FeedError("invalid_replay_cursor");
  return page;
}
var EventSubscription = class {
  symbol;
  options;
  currentCursor;
  tier;
  handlers = /* @__PURE__ */ new Map();
  seen = /* @__PURE__ */ new Map();
  closed = false;
  running = false;
  controller;
  reader;
  wake;
  lastControl;
  abort = () => this.close();
  constructor(pair, options = {}) {
    this.symbol = symbol(pair);
    this.currentCursor = cursor(options.after);
    this.options = { ...options };
    if (options.maxEvents !== void 0 && (!Number.isInteger(options.maxEvents) || options.maxEvents < 1))
      throw new TypeError("maxEvents must be a positive integer");
    const base = new URL(options.baseUrl ?? BASE_URL);
    if (!["http:", "https:"].includes(base.protocol) || base.username || base.password || base.search || base.hash)
      throw new TypeError("baseUrl must be an HTTP URL without credentials, query or fragment");
    this.options.baseUrl = (options.baseUrl ?? BASE_URL).replace(/\/+$/, "");
    if (options.signal?.aborted) this.close();
    else options.signal?.addEventListener("abort", this.abort, { once: true });
  }
  get cursor() {
    return this.currentCursor;
  }
  get last_control() {
    return this.lastControl;
  }
  on(event, handler) {
    if (!event || typeof handler !== "function") throw new TypeError("on() requires an event name and a function");
    this.handlers.set(event, [...this.handlers.get(event) ?? [], handler]);
    return this;
  }
  close() {
    this.closed = true;
    this.controller?.abort();
    void this.reader?.cancel().catch(() => {
    });
    this.wake?.();
    this.options.signal?.removeEventListener("abort", this.abort);
  }
  async pause(ms) {
    if (this.closed) return;
    await new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.wake = void 0;
        resolve();
      }, ms);
      this.wake = () => {
        clearTimeout(timer);
        this.wake = void 0;
        resolve();
      };
    });
  }
  async *stream() {
    let delay = 1e3;
    while (!this.closed) {
      const controller = new AbortController();
      this.controller = controller;
      let response;
      try {
        response = await request("/api/v1/desk_read/watch", {
          symbol: this.symbol,
          version: 2,
          ref: "hunterkiller-ts"
        }, this.options, "text/event-stream", controller.signal, this.currentCursor);
      } catch (error) {
        if (this.closed) return;
        if (error instanceof HunterKillerError || this.options.reconnect === false) throw error;
        await this.pause(delay);
        delay = Math.min(delay * 2, 3e4);
        continue;
      }
      if (response.status === 204) {
        controller.abort();
        return;
      }
      if (response.headers.get("Content-Type")?.split(";", 1)[0].trim().toLowerCase() !== "text/event-stream" || !response.body) {
        await response.body?.cancel().catch(() => {
        });
        controller.abort();
        throw new FeedError("invalid_stream_content_type");
      }
      const parser = new Parser(), reader = response.body.getReader();
      this.reader = reader;
      try {
        let reconnect = false;
        while (!this.closed && !reconnect) {
          let next;
          try {
            next = await reader.read();
          } catch (error) {
            if (this.closed) return;
            if (this.options.reconnect === false) throw error;
            break;
          }
          if (this.closed) return;
          for (const frame of parser.feed(next.value, next.done)) {
            yield frame;
            if (frame.event === "reconnect") {
              reconnect = true;
              break;
            }
            if (this.closed) return;
          }
          if (next.done) break;
        }
      } finally {
        await reader.cancel().catch(() => {
        });
        reader.releaseLock();
        this.reader = void 0;
        controller.abort();
      }
      if (this.options.reconnect === false || this.closed) return;
      await this.pause(parser.retryMs ?? delay);
      delay = Math.min(delay * 2, 3e4);
    }
  }
  async notify(frame) {
    for (const handler of this.handlers.get(frame.event) ?? []) await handler(frame.data);
  }
  async run() {
    if (this.closed) return;
    if (this.running || !this.handlers.size) throw new Error("subscription is running or has no handlers");
    this.running = true;
    let handled = 0;
    try {
      for await (const frame of this.stream()) {
        if (frame.id === void 0) {
          if (["wall_touched", "wall_broken", "cascade_live", "oi_shock"].includes(frame.event) || "event_id" in frame.data)
            throw new FeedError("missing_event_id");
          const error = frame.data.error;
          this.lastControl = frame;
          await this.notify(frame);
          if (frame.event === "error") {
            if (error === "replay_gap") throw new ReplayGapError("replay_gap", frame);
            throw new FeedError("stream_error", frame);
          }
          if (frame.event === "credits_exhausted") throw new FeedError("credits_exhausted", frame);
          continue;
        }
        const body = envelope(frame.data, this.symbol, frame.id, frame.event), tier = body.tier;
        if (this.tier !== void 0 && tier !== this.tier) throw new FeedError("stream_scope_changed");
        const fingerprint = canonical(body);
        if (frame.id === this.currentCursor && !this.seen.has(frame.id)) {
          this.tier = tier;
          this.seen.set(frame.id, fingerprint);
          continue;
        }
        if (this.seen.has(frame.id)) {
          if (this.seen.get(frame.id) !== fingerprint) throw new FeedError("event_identity_changed");
          continue;
        }
        await this.notify(frame);
        this.currentCursor = frame.id;
        this.tier = tier;
        this.seen.set(frame.id, fingerprint);
        if (this.seen.size > 1024) this.seen.delete(this.seen.keys().next().value);
        if (this.options.maxEvents !== void 0 && ++handled >= this.options.maxEvents) return;
      }
    } finally {
      this.close();
      this.running = false;
    }
  }
};
function subscribeEvents(pair, options = {}) {
  return new EventSubscription(pair, options);
}

// ts/index.ts
var BASE_URL = "https://hunterkiller.io";
var HunterKillerError = class extends Error {
  constructor(status, body) {
    super(`HTTP ${status}: ${JSON.stringify(body)}`);
    this.status = status;
    this.body = body;
  }
};
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
async function deskRead(symbol2, position = {}, o = {}) {
  const res = await get("/api/v1/desk_read", { symbol: symbol2, ...position, ref: "hunterkiller-ts" }, o);
  return res.json();
}
async function symbols(o = {}) {
  return (await get("/api/v1/desk_read/symbols", {}, o)).json();
}
async function* watch(symbol2, thresholdPct = 1.5, o = {}) {
  let sent = 0;
  let delay = 1e3;
  while (!o.signal?.aborted) {
    try {
      const res = await get(
        "/api/v1/desk_read/watch",
        { symbol: symbol2, threshold_pct: thresholdPct, ref: "hunterkiller-ts" },
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
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  BASE_URL,
  EventSubscription,
  FeedError,
  HunterKillerError,
  ReplayGapError,
  deskRead,
  replayEvents,
  subscribeEvents,
  symbols,
  watch
});
