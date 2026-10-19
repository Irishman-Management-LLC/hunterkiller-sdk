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
npm install github:Irishman-Management-LLC/hunterkiller-sdk#main --prefix ts
```
See `ts/README.md`.

Free API key at signup (delayed data, 60 calls a minute). Live data: a Pro key or $0.02 per call in USDC on Base (x402). Docs: https://hunterkiller.io/for-agents. MCP: https://hunterkiller.io/mcp.
