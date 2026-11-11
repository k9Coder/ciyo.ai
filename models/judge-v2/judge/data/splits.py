import hashlib

from judge.data.catalog import CATEGORIES, HELDOUT_LANGUAGES, HELDOUT_STYLES

TEST_TEMPLATE_FRACTION = 0.15
VAL_FRACTION = 0.05
HELDOUT_CATEGORY_IDS = frozenset(c.id for c in CATEGORIES if c.heldout)


def _bucket(key: str) -> float:
    return int(hashlib.sha1(key.encode("utf-8")).hexdigest()[:8], 16) / 0xFFFFFFFF


def group_is_test_template(group_id: str) -> bool:
    return group_id.startswith("tmpl:") and _bucket("test:" + group_id) < TEST_TEMPLATE_FRACTION


def message_is_test(m) -> bool:
    return (m.language in HELDOUT_LANGUAGES or m.style in HELDOUT_STYLES
            or (m.category_id is not None and m.category_id in HELDOUT_CATEGORY_IDS)
            or group_is_test_template(m.group_id))


def rule_is_test_only(category_id: str, language: str) -> bool:
    return category_id in HELDOUT_CATEGORY_IDS or language in HELDOUT_LANGUAGES


def assign_splits(messages) -> dict[str, str]:
    out = {}
    for m in messages:
        if message_is_test(m):
            out[m.id] = "test"
        else:
            out[m.id] = "val" if _bucket("val:" + m.group_id) < VAL_FRACTION else "train"
    return out


def _norm(text: str) -> str:
    return " ".join(text.lower().split())


def check_disjoint(train_texts, forbidden_texts) -> list[str]:
    """Forbidden (development/test) texts that also occur in training, compared case- and space-insensitively."""
    seen = {_norm(t) for t in train_texts}
    return [t for t in forbidden_texts if _norm(t) in seen]


def check_no_leakage(messages, rules, pairs, splits) -> None:
    seen: dict[str, str] = {}
    for m in messages:
        key = _norm(m.text)
        if key in seen and seen[key] != splits[m.id]:
            raise ValueError(f"shared text across splits: message {m.id}")
        seen[key] = splits[m.id]
    groups: dict[str, str] = {}
    for m in messages:
        if groups.setdefault(m.group_id, splits[m.id]) != splits[m.id]:
            raise ValueError(f"group {m.group_id} spans splits")
    test_only = {r.id for r in rules if rule_is_test_only(r.category_id, r.language)}
    for p in pairs:
        if p.rule_id in test_only and splits[p.message_id] != "test":
            raise ValueError(f"test-only rule {p.rule_id} paired with non-test message {p.message_id}")
