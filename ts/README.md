# hunterkiller-sdk

TypeScript client for the Hunter Killer Desk Read. No dependencies, needs `fetch` (Node 18+).

```
npm install hunterkiller-sdk
```

```ts
import { deskRead, symbols, watch } from "hunterkiller-sdk";

const read = await deskRead("BTCUSDT", { side: "long", entry: 81000, leverage: 20 });
console.log(read.verdict, read.text);

// No position needed: one call returns a verdict for both hypothetical sides.
const any = await deskRead("BTCUSDT");
console.log(any.verdict, any.verdict_side, any.bias, any.confidence);
console.log(any.verdict_long, any.verdict_short);   // each { verdict, confidence, reasons }

for await (const ev of watch("BTCUSDT", 1.5, { key: process.env.HK_API_KEY })) {
  console.log(ev.reason, ev.text);
}
```

`verdict` is never null and `confidence` is always a float from 0 to 1 (0.2 floor with the reason
`thin_data` when little data backs the read). Without a position the verdict is the better of
`verdict_long` and `verdict_short` at `price` and `assumed_leverage` (default 10); with a side,
`verdict_other` is the opposite side.

`deskRead` works without a key (delayed data). `watch` needs a key: a free key (delayed, one
stream) is returned as `api_key` when you sign up at https://hunterkiller.io/signup. Pass `key`
or set `HK_API_KEY`. A paid key is live with five streams. Errors throw `HunterKillerError`
with `status` and `body`. `watch` reconnects after the 30 minute cap.
Descriptive data, not a forecast. Docs: https://hunterkiller.io/for-agents
