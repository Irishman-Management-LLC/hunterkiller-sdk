# Guarded bot template

A paper-trading bot where the Hunter Killer Desk Read decides whether a trade is allowed. Fork it, set two env vars, run it, and watch the Desk Read gate each paper trade. It never sends a real order.

## Run it (three commands)

```
git clone https://github.com/Irishman-Management-LLC/hunterkiller-sdk && cd hunterkiller-sdk/templates/guarded-bot
pip install "git+https://github.com/Irishman-Management-LLC/hunterkiller-sdk#subdirectory=python"
HK_API_KEY=your_free_key SYMBOLS=BTCUSDT,ETHUSDT python bot.py
```

The two env vars are `HK_API_KEY` and `SYMBOLS`. Both are optional: with no key you get the free delayed tier. Add `--once` to run one cycle and exit. Other knobs: `INTERVAL_SECONDS` (300), `LEVERAGE` (5), `MAX_NOTIONAL_USD` (1000), `DECISIONS_FILE` (decisions.jsonl).

TypeScript: `npm install hunterkiller-sdk`, then `node bot.mjs` (prebuilt) or `node --experimental-strip-types bot.ts`. Rebuild with `npm run build`.

## What each Desk Read field means for the bot

| Field | What the bot does with it |
|---|---|
| `verdict` | `proceed` is the only value that can open a long. `reduce` or `skip` closes an open position. |
| `hurt.distance_pct` | How far a liquidation sits from entry, logged on every decision. The verdict already skips under 3% and reduces under 6%. |
| `crowd.funding_bias` | `longs pay` means the crowd is already long, so the bot will not join it, even on `proceed`. |
| `confidence` | Sizes the paper position: `MAX_NOTIONAL_USD x confidence`. |
| `stop_suggestion`, `target_suggestion` | The paper stop and target. Price touching either closes the position. |
| `text` | The Desk Read in plain words, written to every row of `decisions.jsonl`. |

Each cycle makes two calls per symbol: one for the price, one with a hypothetical long at that price so a verdict comes back. The Desk Read is descriptive data, not a forecast.

## Go live

- Free key: https://hunterkiller.io/signup (delayed data, 60 calls a minute). Set `HK_API_KEY`.
- Credit packs by card: `POST /api/agents/credits/checkout` with your key, then live calls draw down credits.
- x402: $0.02 per live call in USDC on Base, no account. Details at https://hunterkiller.io/for-agents.

On HTTP 429 the bot sleeps and retries (it honors `retry_after` when the error body carries one, otherwise one minute). Network errors sleep up to 30 seconds and retry.

## Wire an exchange adapter

Find `EXCHANGE_ADAPTER` in `bot.py` or `bot.ts`. It is called after every paper open and close with `(action, symbol, qty, price)` and does nothing by default. The comment inside shows a Bybit testnet example. Start on testnet, keep the Desk Read gate in front of it, and size small.

## Tell us what is missing

Call the MCP `feedback` tool at https://hunterkiller.io/mcp, or `POST /api/agent_feedback`. It goes to the Hunter Killer team.
