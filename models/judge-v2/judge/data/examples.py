from judge.data.catalog import category_by_id
from judge.data.schema import Example

KEEP = {"construction", "single", "agreed", "human", "resolved"}


def build_examples(messages, rules, pairs, labels, categories, human: dict | None = None) -> list[Example]:
    cats = category_by_id(categories)
    rules_by_id = {r.id: r for r in rules}
    msgs = {m.id: m for m in messages}
    target = {l.pair_id: l.p_match for l in labels if l.status in KEEP}
    target.update(human or {})
    grouped: dict[str, list] = {}
    for p in sorted(pairs, key=lambda p: p.id):
        if p.id in target and p.message_id in msgs:
            grouped.setdefault(p.message_id, []).append(p)
    out = []
    for mid in sorted(grouped):
        m, ps = msgs[mid], grouped[mid]
        rs = [rules_by_id[p.rule_id] for p in ps]
        # Only same-category matches have a known span: the offending text was written for the message's category.
        spans = tuple((m.violation_char_start, m.violation_char_end)
                      if (r.category_id == m.category_id and target[p.id] >= 0.5
                          and m.violation_char_start is not None and m.violation_char_end is not None) else None
                      for p, r in zip(ps, rs))
        out.append(Example(mid, m.text, m.language, tuple(r.id for r in rs), tuple(r.text for r in rs),
                           tuple(target[p.id] for p in ps), tuple(cats[r.category_id].critical for r in rs),
                           m.adversarial, m.violation_char_start, spans if any(spans) else None))
    return out


def build_long_examples(examples, messages, per_language: int, min_prefix_chars: int, seed: int) -> list[Example]:
    """Bury test messages behind same-language benign filler so the violation sits past ~500 tokens.

    Callers pass test-split examples and messages only, so no training text leaks into the test set.
    Positives keep their violation offset (shifted by the filler); hard negatives check long-message precision.
    """
    import dataclasses
    import random
    rng = random.Random(seed)
    msgs = {m.id: m for m in messages}
    used = {e.message_id for e in examples}
    pool: dict[str, list] = {}
    for m in messages:
        if m.polarity == "benign" and m.id not in used:
            pool.setdefault(m.language, []).append(m)
    out = []
    for lang in sorted({e.language for e in examples}):
        fillers = pool.get(lang, [])
        if not fillers:
            continue
        lang_ex = [e for e in examples if e.language == lang and msgs[e.message_id].polarity != "benign"]
        pos = [e for e in lang_ex if e.violation_char_start is not None]
        neg = [e for e in lang_ex if e.violation_char_start is None and all(t < 0.5 for t in e.targets)]
        picked = rng.sample(pos, min(per_language, len(pos))) + rng.sample(neg, min(per_language // 2, len(neg)))
        for e in picked:
            parts, size = [], 0
            for f in rng.sample(fillers, len(fillers)):
                parts.append(f.text)
                size += len(f.text) + 2
                if size >= min_prefix_chars:
                    break
            if size < min_prefix_chars:
                continue
            prefix = "\n\n".join(parts) + "\n\n"
            start = None if e.violation_char_start is None else len(prefix) + e.violation_char_start
            spans = None if e.spans is None else tuple(None if s is None else (s[0] + len(prefix), s[1] + len(prefix))
                                                         for s in e.spans)
            out.append(dataclasses.replace(e, message_id="long_" + e.message_id, message=prefix + e.message,
                                           violation_char_start=start, spans=spans))
    return out
