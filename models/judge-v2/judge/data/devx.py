"""Cross-category development set: validation messages re-paired with rules of other categories.

The judge's false alarms are mostly a familiar rule firing on a different kind of data, and the ordinary
validation set barely contains that case. These pairs measure it without touching the test set.
"""
import random

from judge.data.catalog import CATEGORIES

HELDOUT = {c.id for c in CATEGORIES if c.heldout}


def devx_pairs(messages, rules, splits, per_message: int, seed: int) -> list[tuple[str, str]]:
    rng = random.Random(seed)
    by_lang: dict[str, list] = {}
    for r in sorted(rules, key=lambda r: r.id):
        if r.category_id not in HELDOUT:
            by_lang.setdefault(r.language, []).append(r)
    out = []
    for m in sorted(messages, key=lambda m: m.id):
        if splits.get(m.id) != "val" or m.source != "claude":
            continue
        pool = by_lang.get(m.language, []) + (by_lang.get("en", []) if m.language != "en" else [])
        pool = [r for r in pool if r.category_id != m.category_id]
        out += [(m.id, r.id) for r in rng.sample(pool, min(per_message, len(pool)))]
    return out
