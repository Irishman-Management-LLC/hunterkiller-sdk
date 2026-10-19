# Changelog

## 0.2.0

- Desk Read returns a verdict for both sides when no position is given: `verdict_long` and `verdict_short`, each `{verdict, confidence, reasons}`, plus top-level `verdict`, `verdict_side`, `bias` and `assumed_leverage`. With a side given, `verdict_other` covers the opposite side.
- `confidence` is never null. It is always a number, with a floor of 0.2 and the reason `thin_data` when data is thin (see `confidence_basis`).
- TypeScript: new `SideVerdict` type.
- Framework adapters: LangChain, CrewAI, OpenAI Agents SDK, ElizaOS, Coinbase AgentKit and n8n, with pretrade guard examples.
- Guarded-bot template: a paper bot gated by the Desk Read (Python and TypeScript).

## 0.1.0

- First release: Python and TypeScript clients for the Desk Read.
