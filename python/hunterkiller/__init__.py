"""hunterkiller: Python client for the Hunter Killer Desk Read. Standard library only.

    import hunterkiller as hk
    read = hk.desk_read("BTCUSDT", side="long", entry=81000, leverage=20, key="hk_live_...")
    print(read["verdict"], read["text"])

    for event in hk.watch("BTCUSDT", threshold_pct=1.5, key="hk_live_..."):
        print(event["reason"], event["text"])

A key is optional for desk_read (keyless calls get the delayed tier) and required for watch.
Sign in with your email code, Google or X, then call POST /api/keys/free to mint your free key.
It is shown once, so store it. A second key or live data needs an API plan. The key can also
come from the HK_API_KEY environment variable. Descriptive data, not a forecast."""
from __future__ import annotations

import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request

__all__ = ["desk_read", "watch", "symbols", "HunterKillerError", "BASE_URL"]
__version__ = "0.4.0"

BASE_URL = os.environ.get("HK_BASE_URL", "https://hunterkiller.io")
_UA = "hunterkiller-python/" + __version__


class HunterKillerError(Exception):
    """An HTTP error from the API. .status is the code, .body the parsed JSON error body."""

    def __init__(self, status, body):
        self.status, self.body = status, body
        msg = body.get("message") or body.get("error") if isinstance(body, dict) else None
        super().__init__(f"HTTP {status}: {msg or body}")


def _headers(key):
    key = key or os.environ.get("HK_API_KEY")
    h = {"User-Agent": _UA, "Accept": "application/json"}
    if key:
        h["Authorization"] = "Bearer " + key
    return h


def _open(url, headers, timeout):
    req = urllib.request.Request(url, headers=headers)
    try:
        return urllib.request.urlopen(req, timeout=timeout)
    except urllib.error.HTTPError as e:
        raw = e.read().decode("utf-8", "replace")
        try:
            body = json.loads(raw)
        except ValueError:
            body = {"error": raw[:200]}
        raise HunterKillerError(e.code, body) from None


def _get_json(path, params, key, base_url, timeout=15):
    q = urllib.parse.urlencode({k: v for k, v in params.items() if v is not None})
    with _open(f"{base_url or BASE_URL}{path}" + (f"?{q}" if q else ""), _headers(key), timeout) as r:
        return json.load(r)


def desk_read(symbol, side=None, entry=None, leverage=None, key=None, base_url=None):
    """The Desk Read for one perp pair: pull, hurt, cascade, crowd, plan, verdict, lines, text.
    verdict, verdict_side, bias and a float confidence always come back; with no position the
    verdict is the better of verdict_long and verdict_short at the current price. side, entry
    and leverage together add where your liquidation sits and score your own position."""
    return _get_json("/api/v1/desk_read", {"symbol": symbol, "side": side, "entry": entry,
                                        "leverage": leverage, "ref": "hunterkiller-python"},
                     key, base_url)


def symbols(base_url=None):
    """Covered symbols per tier and the free-tier delay."""
    return _get_json("/api/v1/desk_read/symbols", {}, None, base_url)


def _sse(lines):
    """Yield (event, data) from an iterable of decoded SSE lines. Comments are skipped."""
    event, data = "message", []
    for raw in lines:
        line = raw.rstrip("\r\n")
        if line == "":
            if data:
                yield event, "\n".join(data)
            event, data = "message", []
        elif line.startswith(":"):
            continue
        elif line.startswith("event:"):
            event = line[6:].strip()
        elif line.startswith("data:"):
            data.append(line[5:].lstrip())


def watch(symbol, threshold_pct=1.5, key=None, base_url=None, reconnect=True, max_events=None):
    """Generator of desk_read events: one on connect, then whenever the nearest wall on either
    side comes within threshold_pct of price or the pull direction flips. Reconnects on the
    server's 30-minute reconnect event and on dropped connections (back off up to 30 s).
    Auth and limit errors raise HunterKillerError (a keyless call is 401). max_events stops
    the generator after that many events (handy in tests)."""
    q = urllib.parse.urlencode({"symbol": symbol, "threshold_pct": threshold_pct,
                                "ref": "hunterkiller-python"})
    url = f"{base_url or BASE_URL}/api/v1/desk_read/watch?{q}"
    headers = dict(_headers(key), Accept="text/event-stream")
    sent, delay = 0, 1.0
    while True:
        try:
            with _open(url, headers, 90) as resp:
                delay = 1.0
                for event, data in _sse(line.decode("utf-8", "replace") for line in resp):
                    if event == "desk_read":
                        yield json.loads(data)
                        sent += 1
                        if max_events and sent >= max_events:
                            return
                    elif event == "reconnect":
                        break
        except HunterKillerError as e:
            if e.status != 429 or not reconnect:
                raise
        except OSError:
            if not reconnect:
                return
        if not reconnect:
            return
        time.sleep(delay)
        delay = min(delay * 2, 30.0)


# V2 is explicit and additive; legacy desk_read/watch behavior is unchanged.
from .events import (EventSubscription, FeedFrame, FeedError, ReplayGapError, subscribe_events, replay_events)
__all__ += ["EventSubscription", "FeedFrame", "FeedError", "ReplayGapError", "subscribe_events", "replay_events"]
