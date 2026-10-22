import dataclasses
import hashlib
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, TypeVar


@dataclass(frozen=True)
class Category:
    id: str
    family: str
    critical: bool
    heldout: bool
    description: str


@dataclass(frozen=True)
class Rule:
    id: str
    category_id: str
    language: str
    text: str
    source: str


@dataclass(frozen=True)
class Message:
    id: str
    category_id: str | None
    polarity: str
    style: str
    language: str
    text: str
    adversarial: bool
    violation_char_start: int | None
    group_id: str
    source: str
    violation_char_end: int | None = None


@dataclass(frozen=True)
class Pair:
    id: str
    message_id: str
    rule_id: str


@dataclass(frozen=True)
class Label:
    pair_id: str
    p_match: float
    status: str


@dataclass(frozen=True)
class Example:
    message_id: str
    message: str
    language: str
    rule_ids: tuple
    rules: tuple
    targets: tuple
    critical: tuple
    adversarial: bool
    violation_char_start: int | None
    spans: tuple | None = None


T = TypeVar("T")
_TUPLE_FIELDS = {"rule_ids", "rules", "targets", "critical"}


def write_jsonl(path: Path, items: Iterable) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as f:
        for item in items:
            f.write(json.dumps(dataclasses.asdict(item), ensure_ascii=False) + "\n")


def read_jsonl(path: Path, cls: type[T]) -> list[T]:
    out = []
    with path.open(encoding="utf-8") as f:
        for line in f:
            if line.strip():
                out.append(cls(**{k: _convert(k, v) for k, v in json.loads(line).items()}))
    return out


def _convert(k, v):
    if k == "spans" and v is not None:
        return tuple(None if s is None else tuple(s) for s in v)
    return tuple(v) if k in _TUPLE_FIELDS else v


def _parse(cls, line: bytes):
    return cls(**{k: _convert(k, v) for k, v in json.loads(line).items()})


class LazyJsonl:
    """Random access to a JSONL file holding only line offsets in memory."""

    def __init__(self, path: Path, cls):
        self.path, self.cls = path, cls
        offsets, pos = [], 0
        with path.open("rb") as f:
            for line in f:
                if line.strip():
                    offsets.append(pos)
                pos += len(line)
        self.offsets = offsets

    def __len__(self) -> int:
        return len(self.offsets)

    def __getitem__(self, i: int):
        with self.path.open("rb") as f:
            f.seek(self.offsets[i])
            return _parse(self.cls, f.readline())


def stable_id(prefix: str, *parts: str) -> str:
    return f"{prefix}_{hashlib.sha1(chr(31).join(parts).encode('utf-8')).hexdigest()[:16]}"
