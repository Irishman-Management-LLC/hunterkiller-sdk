"""Guarded paper bot: the Desk Read gates every paper trade. No real orders are ever sent.

Run:  pip install "git+https://github.com/Irishman-Management-LLC/hunterkiller-sdk#subdirectory=python"
      python bot.py            (loop)      python bot.py --once      (one cycle, then exit)

Data tiers (the SDK reads HK_API_KEY from the environment):
  - No key: free delayed tier. Fine for trying this out.
  - HK_API_KEY=...: free key from https://hunterkiller.io/signup (60 calls a minute), or a Pro key for live data.
  - Live data without a subscription: prepaid credits by card (POST /api/agents/credits/checkout)
    or x402 at $0.02 per call in USDC on Base. See https://hunterkiller.io/for-agents.
"""
import argparse
import json
import os
import sys
import time

from hunterkiller import HunterKillerError, desk_read

SYMBOLS = [s.strip().upper() for s in os.environ.get("SYMBOLS", "BTCUSDT,ETHUSDT").split(",") if s.strip()]
INTERVAL = int(os.environ.get("INTERVAL_SECONDS", "300"))
LEVERAGE = float(os.environ.get("LEVERAGE", "5"))
MAX_NOTIONAL = float(os.environ.get("MAX_NOTIONAL_USD", "1000"))  # paper size at confidence 1.0
LOG = os.environ.get("DECISIONS_FILE", "decisions.jsonl")


# ---- EXCHANGE_ADAPTER: the only place a real order could ever leave this bot. A stub on purpose. ----
def EXCHANGE_ADAPTER(action, symbol, qty, price):
    """Called after every paper open/close. Does nothing. To trade for real, replace the body, e.g. Bybit testnet:
        from pybit.unified_trading import HTTP
        s = HTTP(testnet=True, api_key=os.environ["BYBIT_KEY"], api_secret=os.environ["BYBIT_SECRET"])
        s.place_order(category="linear", symbol=symbol, side="Buy" if action == "open" else "Sell",
                      orderType="Market", qty=str(qty), reduceOnly=(action == "close"))
    Start on testnet. Keep the Desk Read gate in front of it."""
    return None


book = {}  # symbol -> {"qty", "entry", "stop", "target"}
realized = 0.0


def read_for(symbol):
    """Two calls: one for the price, one with a hypothetical long at that price so a verdict comes back."""
    price = desk_read(symbol)["price"]
    return desk_read(symbol, side="long", entry=price, leverage=LEVERAGE)


def decide(symbol, r):
    """Apply verdict + hurt distance + crowd to the paper book. Returns (action, detail)."""
    global realized
    price, verdict = r["price"], r.get("verdict")
    distance = (r.get("hurt") or {}).get("distance_pct")
    crowd_against = (r.get("crowd") or {}).get("funding_bias") == "longs pay"  # crowded long: we would join it
    pos = book.get(symbol)
    if pos:
        reason = ("stop" if price <= pos["stop"] else "target" if price >= pos["target"]
                  else "verdict_" + verdict if verdict in ("reduce", "skip") else None)
        if reason:
            pnl = (price - pos["entry"]) * pos["qty"]
            realized += pnl
            del book[symbol]
            EXCHANGE_ADAPTER("close", symbol, pos["qty"], price)
            return "close", {"reason": reason, "pnl_usd": round(pnl, 2)}
        return "hold", {"unrealized_usd": round((price - pos["entry"]) * pos["qty"], 2)}
    stop, target = r.get("stop_suggestion"), r.get("target_suggestion")
    if verdict == "proceed" and not crowd_against and stop and target and stop < price < target:
        qty = round(MAX_NOTIONAL * float(r.get("confidence") or 0.1) / price, 6)  # size by confidence
        book[symbol] = {"qty": qty, "entry": price, "stop": stop, "target": target}
        EXCHANGE_ADAPTER("open", symbol, qty, price)
        return "open", {"qty": qty, "stop": stop, "target": target}
    why = "crowd_against" if crowd_against and verdict == "proceed" else f"verdict_{verdict}"
    return "flat", {"reason": why, "hurt_distance_pct": distance}


def cycle():
    """One pass over all symbols. Returns seconds to wait if rate limited, else 0."""
    for symbol in SYMBOLS:
        r = read_for(symbol)
        action, detail = decide(symbol, r)
        row = {"ts": int(time.time()), "symbol": symbol, "price": r["price"], "verdict": r.get("verdict"),
               "confidence": r.get("confidence"), "hurt_distance_pct": (r.get("hurt") or {}).get("distance_pct"),
               "crowd": (r.get("crowd") or {}).get("funding_bias"), "action": action, **detail,
               "desk_read": r.get("text")}
        with open(LOG, "a") as f:
            f.write(json.dumps(row) + "\n")
        print(f"{symbol} {r['price']} verdict={r.get('verdict')} conf={r.get('confidence')} "
              f"dist={row['hurt_distance_pct']}% -> {action} {detail} | open={len(book)} realized=${realized:.2f}", flush=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--once", action="store_true", help="run one cycle and exit")
    args = ap.parse_args()
    while True:
        wait = INTERVAL
        try:
            cycle()
        except HunterKillerError as e:
            if e.status == 429:  # rate limited: honor Retry-After if the body carries it, else back off a minute
                body = e.body if isinstance(e.body, dict) else {}
                wait = max(int(body.get("retry_after") or body.get("retry_after_seconds") or 60), 1)
            print(f"api error {e}; retry in {wait}s", file=sys.stderr, flush=True)
            if args.once:
                sys.exit(1)
        except (OSError, ValueError) as e:  # network down, timeouts, bad JSON
            wait = min(INTERVAL, 30)
            print(f"network error {e!r}; retry in {wait}s", file=sys.stderr, flush=True)
            if args.once:
                sys.exit(1)
        else:
            if args.once:
                return
        time.sleep(wait)


if __name__ == "__main__":
    main()
