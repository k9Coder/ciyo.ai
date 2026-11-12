"""Extra rules for new training messages: cheap labeled pairs that teach the judge to read the rule.

Writing a message costs far more teacher effort than labeling one more (message, rule) pair, so every new
message is re-paired with rules written for other messages and labeled blind.
"""
import random

from judge.data.catalog import CATEGORIES

HELDOUT = {c.id for c in CATEGORIES if c.heldout}


def extra_pairs(messages, rules, message_ids: set, per_message: int, seed: int) -> list[tuple[str, str]]:
    rng = random.Random(seed)
    by_lang: dict[str, list] = {}
    for r in sorted(rules, key=lambda r: r.id):
        if r.category_id not in HELDOUT:
            by_lang.setdefault(r.language, []).append(r)
    out = []
    for m in sorted(messages, key=lambda m: m.id):
        if m.id not in message_ids:
            continue
        pool = by_lang.get(m.language, []) + (by_lang.get("en", []) if m.language != "en" else [])
        pool = [r for r in pool if r.category_id != m.category_id]
        out += [(m.id, r.id) for r in rng.sample(pool, min(per_message, len(pool)))]
    return out
