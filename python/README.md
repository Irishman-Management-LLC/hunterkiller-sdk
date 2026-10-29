# hunterkiller (Python)

The checked out SDK source is version **0.4.0**. Cascade Feed v2 and HTTP replay
require the matching card 5456 backend release. Package publication is a
separate step. Install this source from the repository root:

```sh
python -m pip install ./sdk/python
```

The existing `desk_read`, `symbols` and `watch` helpers retain their v1 behavior.
The new subscription API uses `version=2` explicitly:

```python
import hunterkiller as hk

feed = hk.subscribe_events("BTCUSDT")  # uses HK_API_KEY; construction does not connect
feed.on("wall_touched", lambda event: print(event["event_id"], event["data"]))
feed.on("source_status", lambda status: print(status))

try:
    feed.run()                         # synchronous; callbacks finish before cursor advance
except hk.ReplayGapError:
    print("Choose an explicit replay window for this symbol and tier.")
finally:
    feed.close()

print(feed.cursor)                    # last successfully handled event, kept in memory
```

The four approved event names are `wall_touched`, `wall_broken`, `cascade_live`
and `oi_shock`. Call `close()` to stop reading or reconnecting. Python callbacks
are synchronous; an awaitable result is rejected before acknowledgement.

Use `after=saved_cursor` to resume. A failed callback stops the subscription and
keeps the previous cursor. Save your application cursor after successful
processing and make handlers idempotent by `event_id`; the local duplicate
window covers the last 1024 handled events. Handler names filter locally and do
not change the server subscription.

`replay_events("BTCUSDT", after=saved_cursor, limit=100)` requests one page from
`/api/events/replay`. Follow `next_cursor` in server order when `has_more` is
true. An unavailable endpoint raises its HTTP error. Replay gaps and stream
errors stay explicit; the SDK never automatically clears a cursor.

Every event retains the server's provenance, source times, `missing_fields`,
unknown values and extra fields. A null `data.baseline_minutes` remains null.
Transport status frames have no event id; inspect `feed.last_control` or
register a `source_status` handler. Errors and exhausted credits stop the
subscription after their control handler runs. Access, limits and existing
billing remain server policy. Keep API keys in your server environment.

The client protocol and release boundaries are in
[Cascade SDK v2](../../docs/CASCADE_SDK_V2.md).

## Legacy Desk Read v1 helpers


Client for the Hunter Killer Desk Read. Standard library only.

```
python -m pip install ./sdk/python
```

```python
import hunterkiller as hk

read = hk.desk_read("BTCUSDT", side="long", entry=81000, leverage=20)
print(read["verdict"], read["text"])

# No position needed: one call returns a verdict for both hypothetical sides.
read = hk.desk_read("BTCUSDT")
print(read["verdict"], read["verdict_side"], read["bias"], read["confidence"])
print(read["verdict_long"], read["verdict_short"])   # each {verdict, confidence, reasons}

print(hk.symbols()["covered"])

for event in hk.watch("BTCUSDT", threshold_pct=1.5):   # needs a key
    print(event["reason"], event["text"])
```

`verdict` is never null and `confidence` is always a float from 0 to 1 (0.2 floor with the reason
`thin_data` when little data backs the read). Without a position the verdict is the better of
`verdict_long` and `verdict_short` at `price` and `assumed_leverage` (default 10); with a side,
`verdict_other` is the opposite side.

`desk_read` works without a key (delayed data). `watch` needs a key: a free key (delayed, one
stream) is available after sign in. Sign in with your email code, Google or X, then call POST /api/keys/free to mint your free key. It is shown once, so store it. A second key or live data needs an API plan. Pass `key=`
or set `HK_API_KEY`. A paid key is live and gets five streams. Errors raise `HunterKillerError`
with `.status` and `.body`.

`watch` yields the `desk_read` payload plus `event`, `reason` (`connect`, `wall_in_range:above`,
`wall_in_range:below`, `pull_flip`) and `threshold_pct`. It reconnects on its own after the
30 minute cap. Descriptive data, not a forecast. Docs: https://hunterkiller.io/for-agents

## API version

Version 0.3.0 uses `/api/v1/desk_read`, `/api/v1/desk_read/symbols` and
`/api/v1/desk_read/watch`. The v1 contract allows additional fields. Existing fields
and event names will not be removed or renamed within v1. The original
`/api/desk_read` routes remain supported.
