import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "python"))
sys.path.insert(0, os.path.dirname(__file__))


def test_desk_read_live():
    import pytest
    pytest.importorskip("crewai")
    from hunterkiller_crewai import DeskReadTool
    out = DeskReadTool().run(**{"symbol": "BTCUSDT", "side": "long", "entry": 82000, "leverage": 20})
    assert "verdict:" in out and "BTC" in out


if __name__ == "__main__":
    from hunterkiller import desk_read
    r = desk_read("BTCUSDT", side="long", entry=82000, leverage=20)
    print("sdk ok", r["verdict"], r["hurt"]["distance_pct"])
    try:
        from hunterkiller_crewai import DeskReadTool
        print(DeskReadTool().run(**{"symbol": "BTCUSDT"})[:120])
    except ImportError as e:
        print("crewai not installed, tool not exercised:", e)
