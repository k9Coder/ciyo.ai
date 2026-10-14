import json
from pathlib import Path

from judge.cc.merge import p_from
from judge.data.catalog import CATEGORIES, LANGUAGES, MESSAGE_STYLES, category_by_id, has_script
from judge.data.schema import Label, Message, Pair, Rule, stable_id

_CATS = category_by_id(CATEGORIES)
VERDICTS = ("match", "no_match")


def _rows(path: Path):
    for n, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        if line.strip():
            yield n, line


def _check(cond: bool, msg: str) -> None:
    if not cond:
        raise ValueError(msg)


def _parse_pair_row(order, line: str):
    row = json.loads(line)
    text = row["message"]
    _check(isinstance(text, str) and text.strip() != "", "empty message")
    allowed = ("benign",) if order.category_id is None else ("positive", "hard_negative")
    _check(row["polarity"] in allowed, f"polarity {row['polarity']!r} not allowed for this order")
    _check(row["style"] in MESSAGE_STYLES, f"unknown style {row['style']!r}")
    _check(isinstance(row["adversarial"], bool), "adversarial must be a boolean")
    _check(has_script(text, order.language), f"message not in {order.language} script")
    start = None
    if row["polarity"] == "positive":
        excerpt = row["violating_excerpt"]
        _check(bool(excerpt) and excerpt in text, "violating_excerpt is not an exact substring of message")
        start = text.index(excerpt)
    rules = row["rules"]
    _check(isinstance(rules, list) and 2 <= len(rules) <= 4, "need 2-4 rules")
    parsed = []
    for r in rules:
        _check(isinstance(r["text"], str) and r["text"].strip() != "", "empty rule text")
        _check(r["category"] in _CATS, f"unknown rule category {r['category']!r}")
        _check(r["language"] in LANGUAGES, f"unknown rule language {r['language']!r}")
        _check(r["verdict"] in VERDICTS, f"bad verdict {r['verdict']!r}")
        parsed.append((r["text"].strip(), r["category"], r["language"], p_from(r["verdict"], r["confidence"])))
    mid = stable_id("msg", order.id, text)
    msg = Message(mid, order.category_id, row["polarity"], row["style"], order.language, text, row["adversarial"],
                  start, mid, "claude")
    return msg, parsed


def ingest_pairs(order, path: Path):
    msgs, rules, pairs, labels, errors = [], [], [], [], []
    for n, line in _rows(path):
        try:
            msg, parsed = _parse_pair_row(order, line)
        except (json.JSONDecodeError, KeyError, TypeError, ValueError) as e:
            errors.append(f"{path.name} line {n}: {type(e).__name__}: {e}")
            continue
        msgs.append(msg)
        for text, cat, lang, p in parsed:
            rule = Rule(stable_id("rule", lang, text), cat, lang, text, "claude")
            rules.append(rule)
            pid = stable_id("pair", msg.id, rule.id)
            pairs.append(Pair(pid, msg.id, rule.id))
            labels.append(Label(pid, p, "single"))
    return msgs, rules, pairs, labels, errors


def ingest_labels(order, path: Path):
    allowed = {item["pair_id"] for item in order.payload}
    got, errors = {}, []
    for n, line in _rows(path):
        try:
            row = json.loads(line)
            _check(row["pair_id"] in allowed, f"pair_id {row['pair_id']!r} not in order payload")
            _check(row["verdict"] in VERDICTS, f"bad verdict {row['verdict']!r}")
            got[row["pair_id"]] = p_from(row["verdict"], row["confidence"])
        except (json.JSONDecodeError, KeyError, TypeError, ValueError) as e:
            errors.append(f"{path.name} line {n}: {type(e).__name__}: {e}")
    return got, errors
