"""Fast judge + second opinion, returning the Judge v2.1 JSON contract.

Each rule is routed by the fast model's calibrated score: below `low` it is not violated, at or above `high` it
is violated, and in between the second-opinion model decides on a window around the fast model's span. When the
second opinion is missing, fails, or is too slow, the rule is left undecided (`violated: null`, `pending: true`)
so the company's "When a check takes too long" setting applies; it is never silently reported as fine.

Span offsets in the contract are UTF-16 code units (what JavaScript strings index), so the UI can highlight
them directly; scorers work in Python string indices and are converted on the way out.
"""
import time
from concurrent.futures import ThreadPoolExecutor
from concurrent.futures import TimeoutError as FutureTimeout
from dataclasses import dataclass

CHARS_PER_TOKEN = 4


@dataclass(frozen=True)
class Bands:
    low: float
    high: float


@dataclass(frozen=True)
class Confirm:
    """Precision-first policy: block only when the fast model flags (>= fast_min) and the second confirms."""
    fast_min: float
    second_min: float


def to_utf16(message: str, idx: int) -> int:
    """UTF-16 code-unit offset of Python string index idx."""
    return idx + sum(1 for ch in message[:idx] if ord(ch) > 0xFFFF)


class Cascade:
    def __init__(self, fast, second=None, bands: Bands = Bands(0.1, 0.9), window_tokens: int = 400,
                 second_timeout_s: float = 2.5, confirm: Confirm | None = None):
        self.fast, self.second, self.bands, self.confirm = fast, second, bands, confirm
        self.window_chars = window_tokens * CHARS_PER_TOKEN
        self.timeout = second_timeout_s
        self.pool = ThreadPoolExecutor(max_workers=1)

    def _window(self, message: str, span) -> tuple[int, int]:
        if len(message) <= self.window_chars:
            return 0, len(message)
        mid = 0 if span is None else (span[0] + span[1]) // 2
        a = max(0, min(mid - self.window_chars // 2, len(message) - self.window_chars))
        return a, a + self.window_chars

    def _second(self, message: str, rule: str, span):
        a, b = self._window(message, span)
        future = self.pool.submit(self.second.score_with_spans, message[a:b], [rule])
        p, s = future.result(timeout=self.timeout)[0]
        return p, None if s is None else (s[0] + a, s[1] + a)

    def _entry(self, message: str, rule_id: str, violated, p: float, span) -> dict:
        out = None
        if violated and span is not None:
            out = {"start": to_utf16(message, span[0]), "end": to_utf16(message, span[1]),
                   "text": message[span[0]:span[1]]}
        conf = None if violated is None else round(p if violated else 1 - p, 4)
        return {"rule_id": rule_id, "violated": violated, "confidence": conf, "span": out}

    def judge(self, message: str, rules: list[dict]) -> dict:
        t0 = time.perf_counter()
        if not message or not rules:
            return {"violated": False, "decided_by": "fast", "latency_ms": 0, "pending": False,
                    "rules": [self._entry(message, r["id"], False, 0.0, None) for r in rules]}
        fast = self.fast.score_with_spans(message, [r["text"] for r in rules])
        entries, used_second, pending = [], False, False
        for r, (p, span) in zip(rules, fast):
            if self.confirm is not None:
                if p < self.confirm.fast_min:
                    entries.append(self._entry(message, r["id"], False, p, None))
                    continue
                used_second = True
                try:
                    if self.second is None:
                        raise RuntimeError("second opinion unavailable")
                    p2, span2 = self._second(message, r["text"], span)
                    ok = p2 >= self.confirm.second_min
                    entries.append(self._entry(message, r["id"], ok, p2, span2 or span))
                except (FutureTimeout, RuntimeError, OSError, ValueError):
                    pending = True
                    entries.append(self._entry(message, r["id"], None, p, None))
                continue
            if p < self.bands.low:
                entries.append(self._entry(message, r["id"], False, p, None))
            elif p >= self.bands.high:
                entries.append(self._entry(message, r["id"], True, p, span))
            else:
                used_second = True
                try:
                    if self.second is None:
                        raise RuntimeError("second opinion unavailable")
                    p2, span2 = self._second(message, r["text"], span)
                    entries.append(self._entry(message, r["id"], p2 >= 0.5, p2, span2))
                except (FutureTimeout, RuntimeError, OSError, ValueError):
                    pending = True
                    entries.append(self._entry(message, r["id"], None, p, None))
        return {"violated": any(e["violated"] is True for e in entries),
                "decided_by": "second_opinion" if used_second else "fast",
                "latency_ms": round((time.perf_counter() - t0) * 1000),
                "pending": pending, "rules": entries}
