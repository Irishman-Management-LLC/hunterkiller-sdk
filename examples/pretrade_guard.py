"""Skip an order when the Desk Read says skip or your liquidation is under 3% from entry."""
import sys

from hunterkiller import desk_read

MIN_DISTANCE_PCT = 3


def ok_to_trade(symbol, side, entry, leverage):
    r = desk_read(symbol, side=side, entry=entry, leverage=leverage)  # HK_API_KEY for live data
    hurt = r.get("hurt") or {}
    distance = hurt.get("distance_pct")
    if r.get("verdict") == "skip" or (distance is not None and distance < MIN_DISTANCE_PCT):
        print("SKIP:", r.get("text"))
        return False
    print("GO:", r.get("verdict"), "| stop", r.get("stop_suggestion"), "| target", r.get("target_suggestion"))
    return True


if __name__ == "__main__":
    if ok_to_trade("BTCUSDT", "long", 82000, 20):
        print("place_order(...) here")
    else:
        sys.exit(1)
