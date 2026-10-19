# Hunter Killer Desk Read for Coinbase AgentKit

```
npm install hunterkiller-sdk
```
Copy `hunterKillerActionProvider.ts` next to your agent and register it:
```ts
const agentkit = await AgentKit.from({ walletProvider, actionProviders: [hunterKillerActionProvider()] });
```
The action is `deskRead` (symbol, side, entry, leverage). With no position given, the read returns `verdict_long`, `verdict_short`, a top-level `verdict` and `verdict_side` (the side that verdict is for), `bias` and `confidence` (always a number). With a side given, `verdict_other` covers the opposite side.

## Live reads with x402
Free delayed data works keyless. Live reads cost $0.02 per call in USDC on Base via x402. Your AgentKit wallet can pay: wrap `fetch` with an x402 client (`x402-fetch`, `wrapFetchWithPayment`) and pass it to the SDK as `{ fetch: paidFetch }`. Or set `HK_API_KEY` for a Pro key.

Smoke test: `node smoke_test.mjs` (calls the SDK only, no AgentKit install needed).
Descriptive data, not a forecast.
