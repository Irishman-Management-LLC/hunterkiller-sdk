# Changelog

## 0.3.0

- Clients call the frozen v1 paths: `/api/v1/desk_read`, `/api/v1/desk_read/symbols` and `/api/v1/desk_read/watch`. The v1 contract only adds fields; a removal or rename would ship as v2. The unversioned paths keep working for older clients.
- TypeScript: reads `HK_API_KEY` without assuming a Node `process` global, so the client runs in edge and browser runtimes too.

## 0.2.0

- Desk Read returns a verdict for both sides when no position is given: `verdict_long` and `verdict_short`, each `{verdict, confidence, reasons}`, plus top-level `verdict`, `verdict_side`, `bias` and `assumed_leverage`. With a side given, `verdict_other` covers the opposite side.
- `confidence` is never null. It is always a number, with a floor of 0.2 and the reason `thin_data` when data is thin (see `confidence_basis`).
- TypeScript: new `SideVerdict` type.
- Framework adapters: LangChain, CrewAI, OpenAI Agents SDK, ElizaOS, Coinbase AgentKit and n8n, with pretrade guard examples.
- Guarded-bot template: a paper bot gated by the Desk Read (Python and TypeScript).

## 0.1.0

- First release: Python and TypeScript clients for the Desk Read.
