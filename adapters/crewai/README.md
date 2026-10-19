# Hunter Killer Desk Read for CrewAI

```
pip install "hunterkiller[crewai]"
```
```python
from hunterkiller_crewai import DeskReadTool
agent = Agent(role="Trader", goal="...", backstory="...", tools=[DeskReadTool()])
```
Copy `hunterkiller_crewai.py` into your project. Live data: set `HK_API_KEY` or pay $0.02 per call via x402. Smoke test: `python test_smoke_crewai.py`.
Descriptive data, not a forecast. Docs: https://hunterkiller.io/for-agents
