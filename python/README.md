# hunterkiller (Python)

Client for the Hunter Killer Desk Read. Standard library only.

```
pip install hunterkiller
```

```python
import hunterkiller as hk

read = hk.desk_read("BTCUSDT", side="long", entry=81000, leverage=20)
print(read["verdict"], read["text"])

print(hk.symbols()["covered"])

for event in hk.watch("BTCUSDT", threshold_pct=1.5):   # needs a key
    print(event["reason"], event["text"])
```

`desk_read` works without a key (delayed data). `watch` needs a key: a free key (delayed, one
stream) is returned as `api_key` when you sign up at https://hunterkiller.io/signup. Pass `key=`
or set `HK_API_KEY`. A paid key is live and gets five streams. Errors raise `HunterKillerError`
with `.status` and `.body`.

`watch` yields the `desk_read` payload plus `event`, `reason` (`connect`, `wall_in_range:above`,
`wall_in_range:below`, `pull_flip`) and `threshold_pct`. It reconnects on its own after the
30 minute cap. Descriptive data, not a forecast. Docs: https://hunterkiller.io/for-agents
