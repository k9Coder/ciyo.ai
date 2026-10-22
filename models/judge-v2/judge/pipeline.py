import argparse
import dataclasses
import json
import random
import shutil
import sys
from pathlib import Path

from judge.cc.ingest import ingest_labels, ingest_pairs
from judge.cc.merge import merge_second_pass, needs_second_pass
from judge.cc.orders import label_orders, pair_orders, read_order, write_orders
from judge.data.catalog import CATEGORIES, category_by_id
from judge.data.devx import devx_pairs
from judge.data.examples import build_examples, build_long_examples
from judge.data.schema import Example, Label, Message, Pair, Rule, read_jsonl, stable_id, write_jsonl
from judge.data.scripted import generate, load_templates, validate
from judge.data.splits import assign_splits, check_no_leakage, rule_is_test_only

FILES = (("messages", Message), ("rules", Rule), ("pairs", Pair), ("labels", Label))


def _write_all(d: Path, msgs, rules, pairs, labels) -> None:
    for (name, _), items in zip(FILES, (msgs, rules, pairs, labels)):
        write_jsonl(d / f"{name}.jsonl", items)


def _read_all(d: Path):
    return tuple(read_jsonl(d / f"{name}.jsonl", cls) for name, cls in FILES)


def _dedup(items):
    seen, out = set(), []
    for it in items:
        key = it.pair_id if isinstance(it, Label) else it.id
        if key not in seen:
            seen.add(key)
            out.append(it)
    return out


def cmd_scripted(a):
    sets, errors = [], []
    for p in sorted(a.templates.glob("*.json")):
        ts = load_templates(p)
        errors += [f"{p.name}: {e}" for e in validate(ts)]
        sets.append(ts)
    if errors:
        sys.exit("invalid templates:\n" + "\n".join(errors))
    _write_all(a.out, *generate(sets, a.per_template, a.seed))


def cmd_backfill_spans(a):
    ends = {}
    for d in a.sources:
        for m in read_jsonl(d / "messages.jsonl", Message):
            if m.violation_char_end is not None:
                ends[m.id] = m.violation_char_end
    out = [dataclasses.replace(m, violation_char_end=ends.get(m.id, m.violation_char_end))
           for m in read_jsonl(a.data / "messages.jsonl", Message)]
    write_jsonl(a.data / "messages.jsonl", out)
    need = [m for m in out if m.violation_char_start is not None]
    filled = sum(m.violation_char_end is not None for m in need)
    (a.data / "backfill_report.json").write_text(json.dumps({"filled": filled, "missing": len(need) - filled}),
                                                  encoding="utf-8")


def cmd_subset(a):
    src = {m.id: m.source for m in read_jsonl(a.data / "messages.jsonl", Message)}
    lines = [l for l in (a.data / "train.jsonl").read_text(encoding="utf-8").splitlines() if l.strip()]
    mid = lambda l: json.loads(l)["message_id"]
    claude = sorted({mid(l) for l in lines if src[mid(l)] == "claude"})
    keep = set(random.Random(a.seed).sample(claude, int(len(claude) * a.claude_fraction)))
    kept = [l for l in lines if src[mid(l)] != "claude" or mid(l) in keep]
    if a.extra_examples:
        extra = [l for l in a.extra_examples.read_text(encoding="utf-8").splitlines() if l.strip()]
        kept += extra * a.extra_repeat
    a.out.mkdir(parents=True, exist_ok=True)
    (a.out / "train.jsonl").write_text("\n".join(kept) + "\n", encoding="utf-8")
    shutil.copy2(a.data / "val.jsonl", a.out / "val.jsonl")


def cmd_devx_orders(a):
    msgs = read_jsonl(a.data / "messages.jsonl", Message)
    rules = read_jsonl(a.data / "rules.jsonl", Rule)
    splits = json.loads((a.data / "splits.json").read_text(encoding="utf-8"))
    text = {m.id: m.text for m in msgs}
    rtext = {r.id: r.text for r in rules}
    index, items = {}, []
    for mid, rid in devx_pairs(msgs, rules, splits, a.per_message, a.seed):
        pid = stable_id("pair", mid, rid)
        index[pid] = [mid, rid]
        items.append({"pair_id": pid, "message": text[mid], "rule": rtext[rid]})
    write_orders(label_orders(items), a.out)
    (a.out / "pairs_index.json").write_text(json.dumps(index), encoding="utf-8")


def cmd_devx_ingest(a):
    msgs = {m.id: m for m in read_jsonl(a.data / "messages.jsonl", Message)}
    rules = {r.id: r for r in read_jsonl(a.data / "rules.jsonl", Rule)}
    cats = category_by_id(CATEGORIES)
    index = json.loads((a.orders / "pairs_index.json").read_text(encoding="utf-8"))
    by_msg, missing = {}, []
    for p in sorted(a.orders.glob("order_*.json")):
        order = read_order(p)
        out = a.outputs / f"{order.id}.jsonl"
        if not out.exists():
            missing.append(order.id)
            continue
        got, errors = ingest_labels(order, out)
        if errors:
            sys.exit("\n".join(errors))
        for pid, prob in got.items():
            mid, rid = index[pid]
            by_msg.setdefault(mid, []).append((rid, prob))
    if missing:
        sys.exit(f"missing outputs: {missing}")
    ex = []
    for mid in sorted(by_msg):
        m, rs = msgs[mid], sorted(by_msg[mid])
        ex.append(Example(mid, m.text, m.language, tuple(r for r, _ in rs), tuple(rules[r].text for r, _ in rs),
                          tuple(p for _, p in rs), tuple(cats[rules[r].category_id].critical for r, _ in rs),
                          m.adversarial, m.violation_char_start))
    write_jsonl(a.out, ex)


def cmd_cc_orders(a):
    write_orders(pair_orders(CATEGORIES, a.per_order, a.seed), a.out)


def cmd_cc_ingest(a):
    msgs, rules, pairs, labels, errors, missing = [], [], [], [], [], []
    order_paths = sorted(a.orders.glob("*.json"))
    for p in order_paths:
        order = read_order(p)
        out = a.outputs / f"{order.id}.jsonl"
        if not out.exists():
            missing.append(order.id)
            continue
        m, r, pr, l, e = ingest_pairs(order, out)
        msgs += m; rules += r; pairs += pr; labels += l; errors += e
    _write_all(a.out, msgs, _dedup(rules), pairs, labels)
    (a.out / "ingest_report.json").write_text(json.dumps({"orders": len(order_paths), "missing_outputs": missing,
                                                          "rows_ok": len(msgs), "errors": errors}, indent=1,
                                                         ensure_ascii=False), encoding="utf-8")


def cmd_merge(a):
    parts = [_read_all(d) for d in a.inputs]
    msgs, rules, pairs, labels = (_dedup([x for part in parts for x in part[i]]) for i in range(4))
    splits = assign_splits(msgs)
    # Teacher pairs sometimes attach an "unrelated" rule from a held-out category to a training
    # message; held-out categories must never reach training, so those pairs are dropped.
    rule_by_id = {r.id: r for r in rules}
    leaky = {p.id for p in pairs if splits[p.message_id] != "test"
             and rule_is_test_only(rule_by_id[p.rule_id].category_id, rule_by_id[p.rule_id].language)}
    pairs = [p for p in pairs if p.id not in leaky]
    labels = [l for l in labels if l.pair_id not in leaky]
    check_no_leakage(msgs, rules, pairs, splits)
    _write_all(a.out, msgs, rules, pairs, labels)
    (a.out / "splits.json").write_text(json.dumps(splits), encoding="utf-8")
    (a.out / "merge_report.json").write_text(json.dumps({"dropped_heldout_rule_pairs": len(leaky)}), encoding="utf-8")


def _texts(d: Path):
    msgs, rules, pairs, labels = _read_all(d)
    splits = json.loads((d / "splits.json").read_text(encoding="utf-8"))
    return {m.id: m for m in msgs}, {r.id: r for r in rules}, {p.id: p for p in pairs}, labels, splits


def cmd_label_orders(a):
    msgs, rules, pairs, labels, splits = _texts(a.data)
    items = []
    for l in labels:
        p = pairs[l.pair_id]
        if needs_second_pass(l, splits[p.message_id] == "test"):
            items.append({"pair_id": p.id, "message": msgs[p.message_id].text, "rule": rules[p.rule_id].text})
    write_orders(label_orders(items), a.out)


def cmd_label_ingest(a):
    labels = read_jsonl(a.data / "labels.jsonl", Label)
    p2, errors, missing = {}, [], []
    for p in sorted(a.orders.glob("*.json")):
        order = read_order(p)
        out = a.outputs / f"{order.id}.jsonl"
        if not out.exists():
            missing.append(order.id)
            continue
        got, e = ingest_labels(order, out)
        p2.update(got)
        errors += e
    merged = merge_second_pass(labels, p2)
    write_jsonl(a.data / "labels.jsonl", merged)
    (a.data / "label2_report.json").write_text(json.dumps({"second_labels": len(p2), "missing_outputs": missing,
                                                           "errors": errors}, indent=1), encoding="utf-8")


def cmd_examples(a):
    msgs, rules, pairs, labels, splits = _texts(a.data)
    human_path = a.data / "human_labels.json"
    human = json.loads(human_path.read_text(encoding="utf-8")) if human_path.exists() else {}
    test_ids = sorted(mid for mid, s in splits.items() if s == "test")
    if a.max_test_messages and len(test_ids) > a.max_test_messages:
        kept = [m for m in test_ids if msgs[m].source != "scripted"]
        scripted = [m for m in test_ids if msgs[m].source == "scripted"]
        room = max(0, a.max_test_messages - len(kept))
        test_ids = kept + random.Random(a.seed).sample(scripted, min(room, len(scripted)))
    keep = {"train": {m for m, s in splits.items() if s == "train"}, "val": {m for m, s in splits.items() if s == "val"},
            "test": set(test_ids)}
    for split, ids in keep.items():
        ms = [msgs[i] for i in sorted(ids)]
        ps = [p for p in pairs.values() if p.message_id in ids]
        built = build_examples(ms, list(rules.values()), ps, labels, CATEGORIES, human)
        if split == "train" and a.oversample_claude > 1:
            # Realistic teacher messages were ~10x rarer than scripted ones, and the model over-flagged them.
            built += [e for e in built if msgs[e.message_id].source == "claude"] * (a.oversample_claude - 1)
        if split == "test" and a.long_per_language:
            test_msgs = [m for mid, m in msgs.items() if splits[mid] == "test"]
            built += build_long_examples(built, test_msgs, a.long_per_language, 4000, a.seed)
        write_jsonl(a.data / f"{split}.jsonl", built)
    queue = []
    for l in labels:
        p = pairs[l.pair_id]
        if l.status == "disagreed" and p.message_id in keep["test"] and p.id not in human:
            m = msgs[p.message_id]
            queue.append({"pair_id": p.id, "message": m.text, "rule": rules[p.rule_id].text, "language": m.language})
    with (a.data / "review_queue.jsonl").open("w", encoding="utf-8") as f:
        for q in queue:
            f.write(json.dumps(q, ensure_ascii=False) + "\n")


def main(argv=None):
    ap = argparse.ArgumentParser(prog="judge.pipeline")
    sub = ap.add_subparsers(dest="cmd", required=True)
    s = sub.add_parser("scripted")
    s.add_argument("--templates", type=Path, required=True)
    s.add_argument("--out", type=Path, required=True)
    s.add_argument("--per-template", type=int, required=True)
    s.add_argument("--seed", type=int, default=1234)
    s = sub.add_parser("backfill-spans")
    s.add_argument("--data", type=Path, required=True)
    s.add_argument("--sources", type=Path, nargs="+", required=True)
    s = sub.add_parser("devx-orders")
    s.add_argument("--data", type=Path, required=True)
    s.add_argument("--out", type=Path, required=True)
    s.add_argument("--per-message", type=int, default=6)
    s.add_argument("--seed", type=int, default=11)
    s = sub.add_parser("devx-ingest")
    s.add_argument("--data", type=Path, required=True)
    s.add_argument("--orders", type=Path, required=True)
    s.add_argument("--outputs", type=Path, required=True)
    s.add_argument("--out", type=Path, required=True)
    s = sub.add_parser("subset")
    s.add_argument("--data", type=Path, required=True)
    s.add_argument("--out", type=Path, required=True)
    s.add_argument("--claude-fraction", type=float, default=0.5)
    s.add_argument("--seed", type=int, default=42)
    s.add_argument("--extra-examples", type=Path)
    s.add_argument("--extra-repeat", type=int, default=1)
    s = sub.add_parser("cc-orders")
    s.add_argument("--out", type=Path, required=True)
    s.add_argument("--per-order", type=int, required=True)
    s.add_argument("--seed", type=int, default=1234)
    s = sub.add_parser("cc-ingest")
    s.add_argument("--orders", type=Path, required=True)
    s.add_argument("--outputs", type=Path, required=True)
    s.add_argument("--out", type=Path, required=True)
    s = sub.add_parser("merge")
    s.add_argument("--inputs", type=Path, nargs="+", required=True)
    s.add_argument("--out", type=Path, required=True)
    s = sub.add_parser("label-orders")
    s.add_argument("--data", type=Path, required=True)
    s.add_argument("--out", type=Path, required=True)
    s = sub.add_parser("label-ingest")
    s.add_argument("--data", type=Path, required=True)
    s.add_argument("--orders", type=Path, required=True)
    s.add_argument("--outputs", type=Path, required=True)
    s = sub.add_parser("examples")
    s.add_argument("--data", type=Path, required=True)
    s.add_argument("--max-test-messages", type=int, default=0)
    s.add_argument("--oversample-claude", type=int, default=1,
                   help="repeat each Claude Code training example N times in train.jsonl")
    s.add_argument("--long-per-language", type=int, default=0,
                   help="also bury N test positives per language past ~500 tokens of benign filler")
    s.add_argument("--seed", type=int, default=1234)
    a = ap.parse_args(argv)
    handlers = {"backfill-spans": cmd_backfill_spans, "subset": cmd_subset, "devx-orders": cmd_devx_orders,
                "devx-ingest": cmd_devx_ingest, "scripted": cmd_scripted, "cc-orders": cmd_cc_orders, "cc-ingest": cmd_cc_ingest, "merge": cmd_merge,
                "label-orders": cmd_label_orders, "label-ingest": cmd_label_ingest, "examples": cmd_examples}
    handler = handlers[a.cmd]
    handler(a)


if __name__ == "__main__":
    main()
