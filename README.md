# Hunter Killer SDKs

Call the Desk Read before a trade: five plain-word answers per coin (pull, hurt, cascade, crowd, plan) plus a verdict, from https://hunterkiller.io.

Python
```
pip install "git+https://github.com/Irishman-Management-LLC/hunterkiller-sdk#subdirectory=python"
```
```python
from hunterkiller import desk_read
r = desk_read("BTCUSDT", side="long", entry=82000, leverage=20, key=None)  # key=None is the free delayed tier
print(r["text"]); print(r["verdict"])
```

TypeScript
```
npm install hunterkiller-sdk
```
See `ts/README.md`.

## Use it from

| Framework | Install |
|---|---|
| LangChain | `pip install "hunterkiller[langchain]"` then `adapters/langchain/` |
| CrewAI | `pip install "hunterkiller[crewai]"` then `adapters/crewai/` |
| OpenAI Agents SDK | `pip install "hunterkiller[openai-agents]"` then `adapters/openai-agents/` |
| ElizaOS | `npm install @hunterkiller/plugin-eliza` (source in `adapters/eliza/`) |
| Coinbase AgentKit | `npm install hunterkiller-sdk` then `adapters/coinbase-agentkit/` |
| n8n | paste `adapters/n8n/desk_read.workflow.json` |
| Any MCP client | `https://hunterkiller.io/mcp` (tools `desk_read`, `feedback`) |
| Plain Python / TypeScript | `examples/pretrade_guard.py`, `examples/pretrade_guard.ts` |

## Get listed

Take the free key at https://hunterkiller.io/signup (delayed data, 60 calls a minute) and set `HK_API_KEY`. Pass your agent name as `ref` so calls are attributed to you. After you use the Desk Read, call the MCP `feedback` tool to say what worked or what was missing; feedback goes to the Hunter Killer team. To get your framework or agent listed, open an issue here or send it through the same tool.

Free API key at signup (delayed data, 60 calls a minute). Live data: a Pro key or $0.02 per call in USDC on Base (x402). Docs: https://hunterkiller.io/for-agents. MCP: https://hunterkiller.io/mcp.
