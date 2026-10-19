# @hunterkiller/sdk

TypeScript client for the Hunter Killer Desk Read. No dependencies, needs `fetch` (Node 18+).

```
npm install @hunterkiller/sdk
```

```ts
import { deskRead, symbols, watch } from "@hunterkiller/sdk";

const read = await deskRead("BTCUSDT", { side: "long", entry: 81000, leverage: 20 });
console.log(read.verdict, read.text);

for await (const ev of watch("BTCUSDT", 1.5, { key: process.env.HK_API_KEY })) {
  console.log(ev.reason, ev.text);
}
```

`deskRead` works without a key (delayed data). `watch` needs a key: a free key (delayed, one
stream) is returned as `api_key` when you sign up at https://hunterkiller.io/signup. Pass `key`
or set `HK_API_KEY`. A paid key is live with five streams. Errors throw `HunterKillerError`
with `status` and `body`. `watch` reconnects after the 30 minute cap.
Descriptive data, not a forecast. Docs: https://hunterkiller.io/for-agents
