/**
 * @hunterkiller/sdk: TypeScript client for the Hunter Killer Desk Read. No dependencies.
 * Needs fetch (Node 18+, browsers, Deno, Bun). Descriptive data, not a forecast.
 */
export const BASE_URL = "https://hunterkiller.io";

export interface DeskRead {
  ok: boolean;
  symbol: string;
  as_of: number | null;
  price: number | null;
  verdict: "proceed" | "reduce" | "skip" | null;
  text: string;
  lines: string[];
  [field: string]: unknown;
}

export interface WatchEvent extends DeskRead {
  event: "desk_read";
  reason: string;
  reasons: string[];
  threshold_pct: number;
}

export interface Options {
  key?: string;
  baseUrl?: string;
  fetch?: typeof fetch;
}

export class HunterKillerError extends Error {
  constructor(public status: number, public body: unknown) {
    super(`HTTP ${status}: ${JSON.stringify(body)}`);
  }
}

function headers(o: Options, accept: string): Record<string, string> {
  const key = o.key ?? (typeof process !== "undefined" ? process.env?.HK_API_KEY : undefined);
  const h: Record<string, string> = { Accept: accept };
  if (key) h.Authorization = `Bearer ${key}`;
  return h;
}

async function get(path: string, params: Record<string, unknown>, o: Options, accept = "application/json") {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null) q.set(k, String(v));
  const f = o.fetch ?? fetch;
  const res = await f(`${o.baseUrl ?? BASE_URL}${path}${q.size ? "?" + q : ""}`, { headers: headers(o, accept) });
  if (!res.ok) {
    let body: unknown;
    try { body = await res.json(); } catch { body = await res.text().catch(() => ""); }
    throw new HunterKillerError(res.status, body);
  }
  return res;
}

/** The Desk Read for one perp pair. side, entry and leverage together add the liquidation view and a verdict. */
export async function deskRead(
  symbol: string,
  position: { side?: "long" | "short"; entry?: number; leverage?: number } = {},
  o: Options = {},
): Promise<DeskRead> {
  const res = await get("/api/desk_read", { symbol, ...position, ref: "hunterkiller-ts" }, o);
  return res.json() as Promise<DeskRead>;
}

/** Covered symbols per tier and the free-tier delay. */
export async function symbols(o: Options = {}): Promise<Record<string, unknown>> {
  return (await get("/api/desk_read/symbols", {}, o)).json();
}

/**
 * Async generator of desk_read events: one on connect, then when the nearest wall comes within
 * thresholdPct of price or the pull flips. Needs a key (a keyless call throws a 401
 * HunterKillerError). Reconnects after the server's 30 minute cap or a dropped connection.
 */
export async function* watch(
  symbol: string,
  thresholdPct = 1.5,
  o: Options & { signal?: AbortSignal; maxEvents?: number } = {},
): AsyncGenerator<WatchEvent> {
  let sent = 0;
  let delay = 1000;
  while (!o.signal?.aborted) {
    try {
      const res = await get("/api/desk_read/watch",
        { symbol, threshold_pct: thresholdPct, ref: "hunterkiller-ts" }, o, "text/event-stream");
      delay = 1000;
      const reader = res.body!.getReader();
      const dec = new TextDecoder();
      let buf = "";
      let event = "message";
      let data: string[] = [];
      let reconnect = false;
      while (!reconnect) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let i: number;
        while ((i = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, i).replace(/\r$/, "");
          buf = buf.slice(i + 1);
          if (line === "") {
            if (data.length && event === "desk_read") {
              yield JSON.parse(data.join("\n")) as WatchEvent;
              if (o.maxEvents && ++sent >= o.maxEvents) { await reader.cancel(); return; }
            } else if (data.length && event === "reconnect") {
              reconnect = true;
            }
            event = "message"; data = [];
          } else if (line.startsWith(":")) {
            continue;
          } else if (line.startsWith("event:")) {
            event = line.slice(6).trim();
          } else if (line.startsWith("data:")) {
            data.push(line.slice(5).trimStart());
          }
        }
      }
      await reader.cancel().catch(() => {});
    } catch (e) {
      if (e instanceof HunterKillerError && e.status !== 429) throw e;
    }
    await new Promise((r) => setTimeout(r, delay));
    delay = Math.min(delay * 2, 30000);
  }
}
