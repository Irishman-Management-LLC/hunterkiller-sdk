"""OpenAI Agents SDK: Hunter Killer Desk Read as a function_tool."""
from typing import Optional

from agents import Agent, Runner, function_tool
from hunterkiller import desk_read


@function_tool
def hk_desk_read(symbol: str, side: Optional[str] = None, entry: Optional[float] = None,
                 leverage: Optional[float] = None) -> str:
    """Call before placing a leveraged perp order. Returns where liquidation money is stacked,
    where your position gets taken out, and a verdict (proceed, reduce, skip).
    Args:
        symbol: Perp pair, e.g. BTCUSDT.
        side: long or short.
        entry: Your entry price.
        leverage: Your leverage, e.g. 20.
    """
    r = desk_read(symbol, side=side, entry=entry, leverage=leverage)
    return f"verdict: {r.get('verdict')}\n{r.get('text', '')}"


agent = Agent(name="Trader", instructions="Run hk_desk_read before any leveraged order.", tools=[hk_desk_read])

if __name__ == "__main__":
    print(Runner.run_sync(agent, "Is a 20x long on BTCUSDT from 82000 sane?").final_output)
