"""CrewAI tool: the Hunter Killer Desk Read before a leveraged perp order."""
from typing import Optional, Type

from crewai.tools import BaseTool
from hunterkiller import desk_read
from pydantic import BaseModel, Field


class DeskReadInput(BaseModel):
    symbol: str = Field(..., description="Perp pair, e.g. BTCUSDT")
    side: Optional[str] = Field(None, description="long or short")
    entry: Optional[float] = Field(None, description="Your entry price")
    leverage: Optional[float] = Field(None, description="Your leverage, e.g. 20")


class DeskReadTool(BaseTool):
    name: str = "Desk Read"
    description: str = (
        "Call before placing a leveraged perp order. Returns where liquidation money is "
        "stacked, where your position gets taken out, and a verdict (proceed, reduce, skip)."
    )
    args_schema: Type[BaseModel] = DeskReadInput

    def _run(self, symbol: str, side: Optional[str] = None, entry: Optional[float] = None,
             leverage: Optional[float] = None) -> str:
        r = desk_read(symbol, side=side, entry=entry, leverage=leverage)  # HK_API_KEY if set
        return f"verdict: {r.get('verdict')}\n{r.get('text', '')}"
