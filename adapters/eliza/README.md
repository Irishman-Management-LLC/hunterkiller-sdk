# @hunterkiller/plugin-eliza

ElizaOS plugin with one Action, `DESK_READ`. It parses the symbol, side, entry and leverage from the message, calls the Desk Read and replies with the text, the verdict and `verdict_side`.

```
npm install @hunterkiller/plugin-eliza
```
```ts
import hunterKillerPlugin from "@hunterkiller/plugin-eliza";
export const character = { name: "Trader", plugins: [hunterKillerPlugin] };
```
Free delayed data works keyless. For live data set `HK_API_KEY` in the agent settings. Build: `npm run build` (esbuild to `dist/`; in this repo it resolves `hunterkiller-sdk` from `npm install`). Smoke test: `node smoke_test.mjs`.
Descriptive data, not a forecast.
