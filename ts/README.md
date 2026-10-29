# hunterkiller-sdk

The checked out SDK source is version **0.4.0**. Cascade Feed v2 and HTTP replay
require the matching card 5456 backend release. Package publication is a
separate step. Build the source in `sdk/ts` with `npm install` and `npm run build`.
The package includes both generated modules and their declarations.

The existing `deskRead`, `symbols` and `watch` helpers retain their v1 behavior.
The new subscription API uses `version=2` explicitly:

```ts
import { subscribeEvents, ReplayGapError } from "./sdk/ts/index.js";

const controller = new AbortController();
const feed = subscribeEvents("BTCUSDT", {
  key: process.env.HK_API_KEY,
  signal: controller.signal,
});                                    // construction does not connect

feed.on("wall_touched", async event => {
  console.log(event.event_id, event.data);
});
feed.on("source_status", status => console.log(status));

try {
  await feed.run();                     // awaits handlers before cursor advance
} catch (error) {
  if (error instanceof ReplayGapError) {
    console.log("Choose an explicit replay window for this symbol and tier.");
  } else {
    throw error;
  }
} finally {
  feed.close();
}

console.log(feed.cursor);               // last successfully handled event, kept in memory
```

The four approved event names are `wall_touched`, `wall_broken`, `cascade_live`
and `oi_shock`. `close()` or the supplied `AbortSignal` stops reads and backoff.
Callbacks may return promises. A rejected callback stops the subscription and
keeps the previous cursor. Save your application cursor after successful
processing and make handlers idempotent by `event_id`; the local duplicate
window covers the last 1024 handled events. Handler names filter locally and
do not change the server subscription.

Use `after: savedCursor` to resume. `replayEvents("BTCUSDT", { after: savedCursor,
limit: 100 })` requests one page from `/api/events/replay`. Follow `next_cursor`
in server order when `has_more` is true. An unavailable endpoint throws its
HTTP error. Replay gaps and stream errors stay explicit; the SDK never
automatically clears a cursor.

Every event retains the server's provenance, source times, `missing_fields`,
unknown values and extra fields. A null `data.baseline_minutes` remains null.
Transport status frames have no event id; inspect `feed.last_control` or
register a `source_status` handler. Errors and exhausted credits stop the
subscription after their control handler runs. Access, limits and existing
billing remain server policy. Keep API keys in your server environment.

The client protocol and release boundaries are in
[Cascade SDK v2](../../docs/CASCADE_SDK_V2.md).

## Legacy Desk Read v1 helpers


TypeScript client for the Hunter Killer Desk Read. No dependencies, needs `fetch` (Node 18+).

```
cd sdk/ts
npm install
npm run build
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
stream) is available after sign in. Sign in with your email code, Google or X, then call POST /api/keys/free to mint your free key. It is shown once, so store it. A second key or live data needs an API plan. Pass `key`
or set `HK_API_KEY`. A paid key is live with five streams. Errors throw `HunterKillerError`
with `status` and `body`. `watch` reconnects after the 30 minute cap.
Descriptive data, not a forecast. Docs: https://hunterkiller.io/for-agents

## API version

Version 0.3.0 uses `/api/v1/desk_read`, `/api/v1/desk_read/symbols` and
`/api/v1/desk_read/watch`. The v1 contract allows additional fields. Existing fields
and event names will not be removed or renamed within v1. The original
`/api/desk_read` routes remain supported.
