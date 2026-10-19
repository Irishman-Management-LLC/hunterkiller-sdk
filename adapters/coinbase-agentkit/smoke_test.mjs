// Exercises the same SDK call the action provider makes (AgentKit itself is not needed).
import { deskRead } from "../../ts/index.mjs";
const r = await deskRead("BTCUSDT", { side: "long", entry: 82000, leverage: 20 });
if (!r.verdict) throw new Error("no verdict");
console.log(`verdict: ${r.verdict}\n${r.text}`.slice(0, 200));
