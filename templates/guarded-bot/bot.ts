// Guarded paper bot: the Desk Read gates every paper trade. No real orders are ever sent.
// Run: npm install hunterkiller-sdk && node --experimental-strip-types bot.ts [--once]   (or: node bot.mjs --once)
// Data tiers (the SDK reads HK_API_KEY from the environment):
//   no key = free delayed tier. HK_API_KEY = free key from https://hunterkiller.io/signup, or a Pro key for live data.
//   Live without a subscription: prepaid credits by card (POST /api/agents/credits/checkout) or x402 at $0.02 per call.
import { appendFileSync } from "node:fs";
import { deskRead, HunterKillerError } from "hunterkiller-sdk";

const env = process.env;
const SYMBOLS = (env.SYMBOLS ?? "BTCUSDT,ETHUSDT").split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);
const INTERVAL = Number(env.INTERVAL_SECONDS ?? 300);
const LEVERAGE = Number(env.LEVERAGE ?? 5);
const MAX_NOTIONAL = Number(env.MAX_NOTIONAL_USD ?? 1000); // paper size at confidence 1.0
const LOG = env.DECISIONS_FILE ?? "decisions.jsonl";
const once = process.argv.includes("--once");

// ---- EXCHANGE_ADAPTER: the only place a real order could ever leave this bot. A stub on purpose. ----
// To trade for real, replace the body. Bybit testnet example: use bybit-api's RestClientV5({ testnet: true, key, secret })
// and call submitOrder({ category: "linear", symbol, side: action === "open" ? "Buy" : "Sell", orderType: "Market",
// qty: String(qty), reduceOnly: action === "close" }). Start on testnet. Keep the Desk Read gate in front of it.
function EXCHANGE_ADAPTER(_action: "open" | "close", _symbol: string, _qty: number, _price: number): void {}

type Pos = { qty: number; entry: number; stop: number; target: number };
const book = new Map<string, Pos>();
let realized = 0;

const sleep = (s: number) => new Promise((r) => setTimeout(r, s * 1000));
const num = (x: unknown) => (typeof x === "number" ? x : undefined);

async function readFor(symbol: string) {
  // Two calls: one for the price, one with a hypothetical long at that price so a verdict comes back.
  const price = (await deskRead(symbol)).price as number;
  return deskRead(symbol, { side: "long", entry: price, leverage: LEVERAGE });
}

function decide(symbol: string, r: Awaited<ReturnType<typeof readFor>>): [string, Record<string, unknown>] {
  const price = r.price as number;
  const verdict = r.verdict;
  const distance = num((r.hurt as { distance_pct?: number } | null)?.distance_pct);
  const crowdAgainst = (r.crowd as { funding_bias?: string } | null)?.funding_bias === "longs pay"; // crowded long
  const pos = book.get(symbol);
  if (pos) {
    const reason = price <= pos.stop ? "stop" : price >= pos.target ? "target"
      : verdict === "reduce" || verdict === "skip" ? "verdict_" + verdict : null;
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
    const qty = Math.round((MAX_NOTIONAL * (num(r.confidence) ?? 0.1) / price) * 1e6) / 1e6; // size by confidence
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
    const dist = num((r.hurt as { distance_pct?: number } | null)?.distance_pct);
    const row = { ts: Math.floor(Date.now() / 1000), symbol, price: r.price, verdict: r.verdict, confidence: r.confidence ?? null,
      hurt_distance_pct: dist ?? null, crowd: (r.crowd as { funding_bias?: string } | null)?.funding_bias ?? null,
      action, ...detail, desk_read: r.text };
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
    else if (e instanceof HunterKillerError) { // rate limited: honor retry_after if the body has it, else back off a minute
      const b = (e.body ?? {}) as { retry_after?: number; retry_after_seconds?: number };
      wait = Math.max(Number(b.retry_after ?? b.retry_after_seconds ?? 60), 1);
      console.error(`rate limited; retry in ${wait}s`);
    } else { wait = Math.min(INTERVAL, 30); console.error(`network error ${e}; retry in ${wait}s`); }
    if (once) process.exit(1);
  }
  await sleep(wait);
}
