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
        out.append(Example(mid, m.text, m.language, tuple(r.id for r in rs), tuple(r.text for r in rs),
                           tuple(target[p.id] for p in ps), tuple(cats[r.category_id].critical for r in rs),
                           m.adversarial, m.violation_char_start))
    return out
