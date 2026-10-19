// Skip an order when the Desk Read says skip or your liquidation is under 3% from entry.
import { deskRead } from "hunterkiller-sdk";

const MIN_DISTANCE_PCT = 3;

export async function okToTrade(symbol: string, side: "long" | "short", entry: number, leverage: number) {
  const r = await deskRead(symbol, { side, entry, leverage }); // pass { key } for live data
  const distance = (r.hurt as { distance_pct?: number } | null)?.distance_pct;
  if (r.verdict === "skip" || (distance !== undefined && distance < MIN_DISTANCE_PCT)) {
    console.log("SKIP:", r.text);
    return false;
  }
  console.log("GO:", r.verdict, "| stop", r.stop_suggestion, "| target", r.target_suggestion);
  return true;
}

if (await okToTrade("BTCUSDT", "long", 82000, 20)) console.log("placeOrder(...) here");
else process.exitCode = 1;
