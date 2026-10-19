import json, os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "python"))

if __name__ == "__main__":
    from hunterkiller import desk_read
    schema = json.load(open(os.path.join(os.path.dirname(__file__), "tools.openai.json")))
    assert schema["tools"][0]["function"]["name"] == "desk_read"
    r = desk_read("BTCUSDT", side="long", entry=82000, leverage=20)
    print("schema ok; live read:", r["verdict"], "|", r["text"][:80])
