# Hunter Killer Desk Read for LangChain

```
pip install "hunterkiller[langchain]"
```
```python
from hunterkiller_langchain import HunterKillerDeskRead
tools = [HunterKillerDeskRead()]   # pass to any agent; key from HK_API_KEY or free delayed tier
```
Copy `hunterkiller_langchain.py` into your project. Live data: set `HK_API_KEY` or pay $0.02 per call via x402. Smoke test: `python test_smoke_langchain.py`.
Descriptive data, not a forecast. Docs: https://hunterkiller.io/for-agents
