# Hunter Killer Desk Read for the OpenAI Agents SDK

```
pip install "hunterkiller[openai-agents]"
```
`desk_read_agent.py` is a ready `function_tool`. For Chat Completions or Responses function calling, use `tools.openai.json` (same as https://hunterkiller.io/agents/tools.openai.json).
The result carries `verdict` and `verdict_side`. With no position given, the read returns `verdict_long`, `verdict_short`, a top-level `verdict` and `verdict_side` (the side that verdict is for), `bias` and `confidence` (always a number). With a side given, `verdict_other` covers the opposite side.
Live data: set `HK_API_KEY` or pay $0.02 per call via x402. Smoke test: `python test_smoke_openai_agents.py`.
Descriptive data, not a forecast.
