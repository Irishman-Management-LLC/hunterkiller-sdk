/** Explicit-start Cascade Feed v2 client. Import and construction do not connect. */
import { BASE_URL, HunterKillerError, type Options } from "./index.js";

export type CascadeEventName = "wall_touched" | "wall_broken" | "cascade_live" | "oi_shock";
export interface CascadeEvent {
  schema_version: 2;
  event_id: string;
  event: string;
  symbol: string;
  tier: "live" | "delayed";
  observed_at: number;
  snapshot_id: string | null;
  previous_snapshot_id: string | null;
  reference_id: string | null;
  read_version: string | null;
  provenance: Record<string, unknown>;
  data: Record<string, unknown>;
  [field: string]: unknown;
}
export interface FeedFrame { event: string; id?: string; data: Record<string, unknown> }
export interface ReplayPage {
  ok: true; schema_version: 2; symbol: string; tier: "live" | "delayed";
  read_version?: string | null;
  events: CascadeEvent[]; next_cursor: string | null; has_more: boolean;
  [field: string]: unknown;
}
export interface EventOptions extends Options {
  after?: string;
  signal?: AbortSignal;
  reconnect?: boolean;
  maxEvents?: number;
}
export class FeedError extends Error {
  constructor(public code: string, public frame?: FeedFrame) { super(code); }
}
export class ReplayGapError extends FeedError {}

function cursor(value?: string | null): string | undefined {
  if (value == null) return undefined;
  if (typeof value !== "string" || !value || value.length > 4096 || /[\x00-\x1f\x7f]/.test(value))
    throw new TypeError("cursor must be an opaque nonempty header-safe string");
  return value;
}
function symbol(value: string): string {
  if (typeof value !== "string" || !value.trim()) throw new TypeError("symbol is required");
  return value.trim().toUpperCase();
}
function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function parse(text: string): Record<string, unknown> {
  let body: unknown;
  try {
    body = JSON.parse(text, (_key, value: unknown) => {
      if (typeof value === "number" && !Number.isFinite(value)) throw new Error("nonfinite");
      return value;
    });
  } catch { throw new FeedError("invalid_event_json"); }
  if (!record(body)) throw new FeedError("invalid_event_json");
  return body;
}
function envelope(body: Record<string, unknown>, scope: string, id?: string, event?: string): CascadeEvent {
  const fields = ["schema_version", "event_id", "event", "symbol", "tier", "observed_at", "snapshot_id",
    "previous_snapshot_id", "reference_id", "read_version", "provenance", "data"];
  if (fields.some(k => !(k in body)) || body.schema_version !== 2 || body.symbol !== scope
      || (body.tier !== "live" && body.tier !== "delayed") || typeof body.event !== "string" || !body.event
      || typeof body.observed_at !== "number" || !Number.isFinite(body.observed_at)
      || ["snapshot_id", "previous_snapshot_id", "reference_id", "read_version"].some(k => body[k] !== null && typeof body[k] !== "string")
      || !record(body.provenance) || !record(body.data)) throw new FeedError("invalid_event_envelope");
  try { if (typeof body.event_id !== "string" || !cursor(body.event_id)) throw new Error(); }
  catch { throw new FeedError("invalid_event_envelope"); }
  if ((id !== undefined && body.event_id !== id) || (event !== undefined && body.event !== event))
    throw new FeedError("event_identity_mismatch");
  return body as unknown as CascadeEvent;
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (record(value)) return "{" + Object.keys(value).sort().map(k => JSON.stringify(k) + ":" + canonical(value[k])).join(",") + "}";
  const encoded = JSON.stringify(value);
  if (typeof encoded !== "string") throw new FeedError("invalid_event_json");
  return encoded;
}

class Parser {
  private decoder = new TextDecoder();
  private buffer = "";
  private skipLF = false;
  private event = "message";
  private id?: string;
  private data: string[] = [];
  private size = 0;
  retryMs?: number;
  private line(line: string): FeedFrame | undefined {
    if (!line) {
      const frame = this.data.length ? {event: this.event || "message", id: this.id, data: parse(this.data.join("\n"))} : undefined;
      this.event = "message"; this.id = undefined; this.data = []; this.size = 0;
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
    else if (name === "retry" && /^[0-9]+$/.test(value)) this.retryMs = Math.max(100, Math.min(Number(value), 30000));
  }
  *feed(chunk?: Uint8Array, final = false): Generator<FeedFrame> {
    let text = this.decoder.decode(chunk, {stream: !final});
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
      const line = this.buffer.slice(0, at); this.buffer = this.buffer.slice(at + step);
      const frame = this.line(line); if (frame) yield frame;
    }
    if (this.buffer.length + this.size > 1024 * 1024) throw new FeedError("event_frame_too_large");
  }
}

function auth(o: Options): Record<string, string> {
  const env = (globalThis as {process?: {env?: Record<string, string | undefined>}}).process?.env;
  const key = o.key ?? env?.HK_API_KEY;
  return key ? {Authorization: "Bearer " + key} : {};
}
async function request(path: string, params: Record<string, unknown>, o: Options,
                       accept: string, signal?: AbortSignal, after?: string): Promise<Response> {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value !== undefined && value !== null) query.set(key, String(value));
  const headers: Record<string, string> = {...auth(o), Accept: accept};
  if (after !== undefined) headers["Last-Event-ID"] = Array.from(new TextEncoder().encode(after), byte => String.fromCharCode(byte)).join("");
  const response = await (o.fetch ?? fetch)(`${o.baseUrl ?? BASE_URL}${path}?${query}`, {headers, signal});
  if (!response.ok) {
    const text = await response.text();
    let body: unknown;
    try { body = JSON.parse(text); } catch { body = {error: text.slice(0, 200)}; }
    throw new HunterKillerError(response.status, body);
  }
  return response;
}

/** One explicit page. A missing backend endpoint remains an HTTP error, never an empty page. */
export async function replayEvents(
  pair: string, options: Options & {after?: string; since?: number; until?: number; limit?: number; signal?: AbortSignal} = {},
): Promise<ReplayPage> {
  const scope = symbol(pair), after = cursor(options.after), limit = options.limit ?? 100;
  if (!Number.isInteger(limit) || limit < 1 || limit > 500) throw new TypeError("limit must be an integer from 1 to 500");
  const response = await request("/api/events/replay", {symbol: scope, after, since: options.since,
    until: options.until, limit}, options, "application/json", options.signal);
  const page = parse(await response.text());
  if (page.ok !== true || page.schema_version !== 2 || page.symbol !== scope
      || !["live", "delayed"].includes(String(page.tier)) || !Array.isArray(page.events)
      || typeof page.has_more !== "boolean" || !("next_cursor" in page)) throw new FeedError("invalid_replay_page");
  for (const item of page.events) {
    if (!record(item) || envelope(item, scope).tier !== page.tier) throw new FeedError("replay_scope_changed");
  }
  const expected = page.events.length ? (page.events.at(-1) as CascadeEvent).event_id : after ?? null;
  if (page.next_cursor !== expected || (page.has_more && !page.events.length)) throw new FeedError("invalid_replay_cursor");
  return page as unknown as ReplayPage;
}

/** Callback subscription. Local duplicate window is bounded; persistent consumers remain idempotent. */
export class EventSubscription {
  readonly symbol: string;
  private options: EventOptions;
  private currentCursor?: string;
  private tier?: string;
  private handlers = new Map<string, Array<(data: any) => unknown>>();
  private seen = new Map<string, string>();
  private closed = false;
  private running = false;
  private controller?: AbortController;
  private reader?: ReadableStreamDefaultReader<Uint8Array>;
  private wake?: () => void;
  private lastControl?: FeedFrame;
  private abort = () => this.close();
  constructor(pair: string, options: EventOptions = {}) {
    this.symbol = symbol(pair); this.currentCursor = cursor(options.after); this.options = {...options};
    if (options.maxEvents !== undefined && (!Number.isInteger(options.maxEvents) || options.maxEvents < 1))
      throw new TypeError("maxEvents must be a positive integer");
    const base = new URL(options.baseUrl ?? BASE_URL);
    if (!["http:", "https:"].includes(base.protocol) || base.username || base.password || base.search || base.hash)
      throw new TypeError("baseUrl must be an HTTP URL without credentials, query or fragment");
    this.options.baseUrl = (options.baseUrl ?? BASE_URL).replace(/\/+$/, "");
    if (options.signal?.aborted) this.close();
    else options.signal?.addEventListener("abort", this.abort, {once: true});
  }
  get cursor(): string | undefined { return this.currentCursor; }
  get last_control(): FeedFrame | undefined { return this.lastControl; }
  on(event: CascadeEventName, handler: (data: CascadeEvent) => unknown): this;
  on(event: string, handler: (data: Record<string, unknown>) => unknown): this;
  on(event: string, handler: (data: any) => unknown): this {
    if (!event || typeof handler !== "function") throw new TypeError("on() requires an event name and a function");
    this.handlers.set(event, [...(this.handlers.get(event) ?? []), handler]); return this;
  }
  close(): void {
    this.closed = true; this.controller?.abort();
    void this.reader?.cancel().catch(() => {}); this.wake?.();
    this.options.signal?.removeEventListener("abort", this.abort);
  }
  private async pause(ms: number): Promise<void> {
    if (this.closed) return;
    await new Promise<void>(resolve => {
      const timer = setTimeout(() => { this.wake = undefined; resolve(); }, ms);
      this.wake = () => { clearTimeout(timer); this.wake = undefined; resolve(); };
    });
  }
  private async *stream(): AsyncGenerator<FeedFrame> {
    let delay = 1000;
    while (!this.closed) {
      const controller = new AbortController(); this.controller = controller;
      let response: Response;
      try {
        response = await request("/api/v1/desk_read/watch", {symbol: this.symbol, version: 2,
          ref: "hunterkiller-ts"}, this.options, "text/event-stream", controller.signal, this.currentCursor);
      } catch (error) {
        if (this.closed) return;
        if (error instanceof HunterKillerError || this.options.reconnect === false) throw error;
        await this.pause(delay); delay = Math.min(delay * 2, 30000); continue;
      }
      if (response.status === 204) { controller.abort(); return; }
      if (response.headers.get("Content-Type")?.split(";", 1)[0].trim().toLowerCase() !== "text/event-stream" || !response.body) {
        await response.body?.cancel().catch(() => {}); controller.abort();
        throw new FeedError("invalid_stream_content_type");
      }
      const parser = new Parser(), reader = response.body.getReader(); this.reader = reader;
      try {
        let reconnect = false;
        while (!this.closed && !reconnect) {
          let next: ReadableStreamReadResult<Uint8Array>;
          try { next = await reader.read(); }
          catch (error) { if (this.closed) return; if (this.options.reconnect === false) throw error; break; }
          if (this.closed) return;
          for (const frame of parser.feed(next.value, next.done)) {
            yield frame;
            if (frame.event === "reconnect") { reconnect = true; break; }
            if (this.closed) return;
          }
          if (next.done) break;
        }
      } finally {
        await reader.cancel().catch(() => {}); reader.releaseLock(); this.reader = undefined;
        controller.abort();
      }
      if (this.options.reconnect === false || this.closed) return;
      await this.pause(parser.retryMs ?? delay); delay = Math.min(delay * 2, 30000);
    }
  }
  private async notify(frame: FeedFrame): Promise<void> {
    for (const handler of this.handlers.get(frame.event) ?? []) await handler(frame.data);
  }
  async run(): Promise<void> {
    if (this.closed) return;
    if (this.running || !this.handlers.size) throw new Error("subscription is running or has no handlers");
    this.running = true; let handled = 0;
    try {
      for await (const frame of this.stream()) {
        if (frame.id === undefined) {
          if (["wall_touched", "wall_broken", "cascade_live", "oi_shock"].includes(frame.event) || "event_id" in frame.data)
            throw new FeedError("missing_event_id");
          const error = frame.data.error;
          this.lastControl = frame; await this.notify(frame);
          if (frame.event === "error") {
            if (error === "replay_gap") throw new ReplayGapError("replay_gap", frame);
            throw new FeedError("stream_error", frame);
          }
          if (frame.event === "credits_exhausted") throw new FeedError("credits_exhausted", frame);
          continue;
        }
        const body = envelope(frame.data, this.symbol, frame.id, frame.event), tier = body.tier;
        if (this.tier !== undefined && tier !== this.tier) throw new FeedError("stream_scope_changed");
        const fingerprint = canonical(body);
        if (frame.id === this.currentCursor && !this.seen.has(frame.id)) {
          this.tier = tier; this.seen.set(frame.id, fingerprint); continue;
        }
        if (this.seen.has(frame.id)) {
          if (this.seen.get(frame.id) !== fingerprint) throw new FeedError("event_identity_changed");
          continue;
        }
        await this.notify(frame); // Handler failures escape transport retry without advancing the cursor.
        this.currentCursor = frame.id; this.tier = tier; this.seen.set(frame.id, fingerprint);
        if (this.seen.size > 1024) this.seen.delete(this.seen.keys().next().value!);
        if (this.options.maxEvents !== undefined && ++handled >= this.options.maxEvents) return;
      }
    } finally { this.close(); this.running = false; }
  }
}

export function subscribeEvents(pair: string, options: EventOptions = {}): EventSubscription {
  return new EventSubscription(pair, options);
}
