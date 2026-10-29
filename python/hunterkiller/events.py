"""Opt-in Cascade Feed v2 transport. No connection is opened at import or construction."""
from collections import OrderedDict
from dataclasses import dataclass
import codecs
import inspect
import json
import math
import threading
import urllib.parse

from . import BASE_URL, HunterKillerError, _get_json, _headers, _open


class FeedError(Exception):
    """A terminal stream/protocol error. Public control data is available in frame."""
    def __init__(self, code, frame=None):
        self.code, self.frame = code, frame
        super().__init__(code)


class ReplayGapError(FeedError):
    """The cursor cannot resume this symbol/tier. No automatic reset is attempted."""


@dataclass(frozen=True)
class FeedFrame:
    event: str
    id: object
    data: dict


def _cursor(value):
    if value is not None and (not isinstance(value, str) or not value or len(value) > 4096
                              or any(ord(c) < 32 or ord(c) == 127 for c in value)):
        raise ValueError("cursor must be an opaque nonempty header-safe string")
    return value


def _symbol(value):
    if not isinstance(value, str) or not value.strip():
        raise ValueError("symbol is required")
    return value.strip().upper()


def _json(text):
    def number(raw):
        value = float(raw)
        if not math.isfinite(value):
            raise ValueError("nonfinite")
        return value
    def invalid(raw):
        raise ValueError("nonfinite")
    try:
        value = json.loads(text, parse_float=number, parse_constant=invalid)
    except (ValueError, TypeError):
        raise FeedError("invalid_event_json") from None
    if not isinstance(value, dict):
        raise FeedError("invalid_event_json")
    return value


class _Parser:
    """UTF-8 SSE lines, including split CRLF/BOM and multiline data.

    Ids are explicit per frame. Controls cannot inherit the prior domain id.
    Incomplete EOF events are discarded, as in the SSE parsing standard.
    """
    LIMIT = 1024 * 1024

    def __init__(self):
        self.decoder = codecs.getincrementaldecoder("utf-8-sig")("replace")
        self.buffer = ""
        self.skip_lf = False
        self.retry_seconds = None
        self._reset()

    def _reset(self):
        self.event, self.id, self.data, self.size = "message", None, [], 0

    def _line(self, line):
        if not line:
            frame = FeedFrame(self.event or "message", self.id, _json("\n".join(self.data))) if self.data else None
            self._reset()
            return frame
        if line.startswith(":"):
            return None
        name, sep, value = line.partition(":")
        if value.startswith(" "):
            value = value[1:]
        if name == "data":
            self.size += len(value) + 1
            if self.size > self.LIMIT:
                raise FeedError("event_frame_too_large")
            self.data.append(value)
        elif name == "event":
            self.event = value
        elif name == "id" and "\0" not in value:
            self.id = value
        elif name == "retry" and value and value.isascii() and value.isdecimal():
            self.retry_seconds = 30 if len(value) > 8 else max(.1, min(int(value) / 1000, 30))
        return None

    def feed(self, chunk, final=False):
        text = self.decoder.decode(chunk, final=final)
        if self.skip_lf and text:
            if text.startswith("\n"):
                text = text[1:]
            self.skip_lf = False
        self.buffer += text
        while True:
            ends = [i for i in (self.buffer.find("\r"), self.buffer.find("\n")) if i >= 0]
            if not ends:
                break
            i = min(ends)
            is_cr = self.buffer[i] == "\r"
            self.skip_lf = is_cr and i + 1 == len(self.buffer)
            step = 2 if self.buffer[i:i + 2] == "\r\n" else 1
            line, self.buffer = self.buffer[:i], self.buffer[i + step:]
            frame = self._line(line)
            if frame is not None:
                yield frame
        if len(self.buffer) + self.size > self.LIMIT:
            raise FeedError("event_frame_too_large")


def _finite(value):
    try:
        return type(value) in (int, float) and math.isfinite(value)
    except OverflowError:
        return False


def _envelope(body, symbol, event_id=None, event=None):
    fields = ("schema_version", "event_id", "event", "symbol", "tier", "observed_at",
              "snapshot_id", "previous_snapshot_id", "reference_id", "read_version", "provenance", "data")
    if (not isinstance(body, dict) or any(k not in body for k in fields)
            or type(body["schema_version"]) is not int or body["schema_version"] != 2
            or body["symbol"] != symbol or body["tier"] not in ("live", "delayed")
            or not isinstance(body["event"], str) or not body["event"]
            or not _finite(body["observed_at"])
            or any(body[k] is not None and not isinstance(body[k], str)
                   for k in ("snapshot_id", "previous_snapshot_id", "reference_id", "read_version"))
            or not isinstance(body["provenance"], dict) or not isinstance(body["data"], dict)):
        raise FeedError("invalid_event_envelope")
    try:
        _cursor(body["event_id"])
    except ValueError:
        raise FeedError("invalid_event_envelope") from None
    if body["event_id"] is None or (event_id is not None and body["event_id"] != event_id) or (event is not None and body["event"] != event):
        raise FeedError("event_identity_mismatch")
    return body


def replay_events(symbol, *, after=None, since=None, until=None, limit=100, key=None, base_url=None):
    """One explicit replay page. Order and next_cursor come from the server.

    The HTTP endpoint is a separately deployed backend capability. A missing
    endpoint raises its HTTP error; it is never presented as an empty page.
    """
    symbol, after = _symbol(symbol), _cursor(after)
    if type(limit) is not int or not 1 <= limit <= 500:
        raise ValueError("limit must be an integer from 1 to 500")
    page = _get_json("/api/events/replay", dict(symbol=symbol, after=after, since=since,
                     until=until, limit=limit), key, base_url)
    try:
        json.dumps(page, allow_nan=False)
    except (ValueError, TypeError):
        raise FeedError("invalid_replay_json") from None
    if (not isinstance(page, dict) or page.get("ok") is not True or page.get("schema_version") != 2
            or page.get("symbol") != symbol or page.get("tier") not in ("live", "delayed")
            or not isinstance(page.get("events"), list) or type(page.get("has_more")) is not bool
            or "next_cursor" not in page):
        raise FeedError("invalid_replay_page")
    for item in page["events"]:
        _envelope(item, symbol)
        if item["tier"] != page["tier"]:
            raise FeedError("replay_scope_changed")
    expected = page["events"][-1]["event_id"] if page["events"] else after
    if page["next_cursor"] != expected or (page["has_more"] and not page["events"]):
        raise FeedError("invalid_replay_cursor")
    return page


class EventSubscription:
    """Synchronous on()/run()/close() subscription. No background thread.

    cursor advances only after all callbacks for an event return successfully.
    Keep handlers idempotent by event_id across retries and process restarts.
    The in-memory duplicate window is bounded to the last 1024 handled events.
    """
    def __init__(self, symbol, *, after=None, key=None, base_url=None, reconnect=True, max_events=None):
        if max_events is not None and (type(max_events) is not int or max_events < 1):
            raise ValueError("max_events must be a positive integer")
        self.symbol, self.key, self.base_url = _symbol(symbol), key, base_url or BASE_URL
        self.reconnect, self.max_events = reconnect, max_events
        self._cursor, self._tier, self._handlers = _cursor(after), None, {}
        self._seen, self._stop, self._active = OrderedDict(), threading.Event(), None
        self._running, self._last_control = False, None

    @property
    def cursor(self):
        return self._cursor

    @property
    def last_control(self):
        return self._last_control

    def on(self, event, handler):
        if not isinstance(event, str) or not event or not callable(handler):
            raise ValueError("on() requires an event name and a callable")
        self._handlers.setdefault(event, []).append(handler)
        return self

    def close(self):
        self._stop.set()
        if self._active is not None:
            self._active.close()

    def _wait(self, seconds):
        self._stop.wait(seconds)

    def _stream(self):
        query = urllib.parse.urlencode(dict(symbol=self.symbol, version=2, ref="hunterkiller-python"))
        url, delay = self.base_url + "/api/v1/desk_read/watch?" + query, 1.0
        while not self._stop.is_set():
            headers = dict(_headers(self.key), Accept="text/event-stream")
            if self._cursor is not None:
                headers["Last-Event-ID"] = self._cursor if self._cursor.isascii() else self._cursor.encode("utf-8")
            try:
                response = _open(url, headers, 90)
            except HunterKillerError:
                raise  # Auth, quota and other HTTP failures require the caller's decision.
            except OSError:
                if not self.reconnect:
                    raise
                self._wait(delay); delay = min(delay * 2, 30); continue
            parser = _Parser()
            try:
                with response:
                    self._active = response
                    if getattr(response, "status", None) == 204:
                        return
                    content_type = response.headers.get("Content-Type", "").split(";", 1)[0].strip().lower()
                    if content_type != "text/event-stream":
                        raise FeedError("invalid_stream_content_type")
                    read = getattr(response, "read1", None) or response.read
                    reconnect_now = False
                    while not self._stop.is_set() and not reconnect_now:
                        try:
                            chunk = read(4096)
                        except (OSError, ValueError) as exc:
                            if self._stop.is_set():
                                return
                            if not isinstance(exc, OSError) or not self.reconnect:
                                raise
                            break
                        if self._stop.is_set():
                            return
                        if not chunk:
                            for frame in parser.feed(b"", final=True):
                                yield frame
                            break
                        for frame in parser.feed(chunk):
                            yield frame
                            if frame.event == "reconnect":
                                reconnect_now = True
                                break
                            if self._stop.is_set():
                                return
            finally:
                self._active = None
            if not self.reconnect or self._stop.is_set():
                return
            self._wait(parser.retry_seconds if parser.retry_seconds is not None else delay)
            delay = min(delay * 2, 30)

    def _notify(self, frame):
        for handler in self._handlers.get(frame.event, []):
            result = handler(frame.data)
            if inspect.isawaitable(result):
                if inspect.iscoroutine(result):
                    result.close()
                raise TypeError("Python event handlers must be synchronous")

    def run(self):
        if self._stop.is_set():
            return
        if self._running or not self._handlers:
            raise RuntimeError("subscription is running or has no handlers")
        self._running, handled = True, 0
        stream = self._stream()
        try:
            for frame in stream:
                if frame.id is None:
                    if frame.event in ("wall_touched", "wall_broken", "cascade_live", "oi_shock") or "event_id" in frame.data:
                        raise FeedError("missing_event_id")
                    control_error = frame.data.get("error")
                    self._last_control = frame
                    self._notify(frame)
                    if frame.event == "error":
                        if control_error == "replay_gap":
                            raise ReplayGapError("replay_gap", frame)
                        raise FeedError("stream_error", frame)
                    if frame.event == "credits_exhausted":
                        raise FeedError("credits_exhausted", frame)
                    continue
                _envelope(frame.data, self.symbol, event_id=frame.id, event=frame.event)
                if self._tier is not None and frame.data["tier"] != self._tier:
                    raise FeedError("stream_scope_changed")
                original_tier = frame.data["tier"]
                fingerprint = json.dumps(frame.data, sort_keys=True, separators=(",", ":"), allow_nan=False)
                if frame.id == self._cursor and frame.id not in self._seen:
                    self._tier = original_tier
                    self._seen[frame.id] = fingerprint
                    continue
                if frame.id in self._seen:
                    if self._seen[frame.id] != fingerprint:
                        raise FeedError("event_identity_changed")
                    continue
                self._notify(frame)  # callback errors escape; they never enter transport retry
                self._cursor, self._tier = frame.id, original_tier
                self._seen[frame.id] = fingerprint
                if len(self._seen) > 1024:
                    self._seen.popitem(last=False)
                handled += 1
                if self.max_events is not None and handled >= self.max_events:
                    return
        finally:
            stream.close()
            self.close()
            self._running = False


def subscribe_events(symbol, **options):
    """Construct a v2 subscription; register handlers, then call run() explicitly."""
    return EventSubscription(symbol, **options)
