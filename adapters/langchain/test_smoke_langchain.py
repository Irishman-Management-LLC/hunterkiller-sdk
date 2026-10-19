import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "python"))
sys.path.insert(0, os.path.dirname(__file__))


def test_desk_read_live():
    import pytest
    pytest.importorskip("langchain_core")
    from hunterkiller_langchain import HunterKillerDeskRead
    out = HunterKillerDeskRead().invoke({"symbol": "BTCUSDT", "side": "long", "entry": 82000, "leverage": 20})
    assert "verdict:" in out and "BTC" in out


if __name__ == "__main__":
    from hunterkiller import desk_read
    r = desk_read("BTCUSDT", side="long", entry=82000, leverage=20)
    print("sdk ok", r["verdict"], r["hurt"]["distance_pct"])
    try:
        from hunterkiller_langchain import HunterKillerDeskRead
        print(HunterKillerDeskRead().invoke({"symbol": "BTCUSDT"})[:120])
    except ImportError as e:
        print("langchain-core not installed, tool not exercised:", e)
