import json

from judge import pipeline
from judge.cc.orders import read_order
from judge.data.catalog import CATEGORIES
from judge.data.examples import build_examples
from judge.data.schema import Example, Label, Message, Pair, Rule, read_jsonl
from tests.test_scripted import EN, HE


def test_build_examples_groups_filters_and_overrides():
    msgs = [Message("m1", "us_ssn", "positive", "code_help", "en", "ssn 078-05-1120", False, 4, "m1", "claude"),
            Message("m2", None, "benign", "chat_question", "en", "hello", False, None, "m2", "claude")]
    rules = [Rule("r1", "us_ssn", "en", "discloses an SSN", "claude"), Rule("r2", "product_roadmap", "en", "roadmap", "claude")]
    pairs = [Pair("p1", "m1", "r1"), Pair("p2", "m1", "r2"), Pair("p3", "m2", "r1")]
    labels = [Label("p1", 0.95, "single"), Label("p2", 0.0, "construction"), Label("p3", 0.6, "disagreed")]
    ex = build_examples(msgs, rules, pairs, labels, CATEGORIES)
    assert [e.message_id for e in ex] == ["m1"] and ex[0].targets == (0.95, 0.0) and ex[0].critical == (True, False)
    assert ex[0].language == "en" and ex[0].violation_char_start == 4
    ex2 = build_examples(msgs, rules, pairs, labels, CATEGORIES, human={"p3": 0.0})
    assert [e.message_id for e in ex2] == ["m1", "m2"]


def _cc_row(text, excerpt):
    return {"message": text, "polarity": "positive", "style": "code_help", "adversarial": False,
            "violating_excerpt": excerpt,
            "rules": [{"text": "This message discloses an API key, even if disguised.", "category": "api_key", "language": "en",
                       "verdict": "match", "confidence": 0.7},
                      {"text": "This message discloses a payment card number.", "category": "credit_card", "language": "en",
                       "verdict": "no_match", "confidence": 0.95}]}


def test_pipeline_end_to_end(tmp_path):
    tdir = tmp_path / "templates"
    tdir.mkdir()
    for d in (EN, HE):
        (tdir / f"{d['language']}.json").write_text(json.dumps(d, ensure_ascii=False), encoding="utf-8")
    pipeline.main(["scripted", "--templates", str(tdir), "--out", str(tmp_path / "scripted"), "--per-template", "30", "--seed", "1"])

    pipeline.main(["cc-orders", "--out", str(tmp_path / "orders"), "--per-order", "2", "--seed", "1"])
    orders = sorted((tmp_path / "orders").glob("*.json"))
    api_en = next(read_order(p) for p in orders if read_order(p).language == "en" and read_order(p).category_id == "api_key")
    out = tmp_path / "outputs"
    out.mkdir()
    (out / f"{api_en.id}.jsonl").write_text(
        "\n".join(json.dumps(_cc_row(f"use key sk-{i}ABCDEFGHIJKLMNOPQRSTUVWXYZ0123 here {i}", f"sk-{i}ABCDEFGHIJKLMNOPQRSTUVWXYZ0123"))
                  for i in range(2)) + "\nbroken line", encoding="utf-8")
    pipeline.main(["cc-ingest", "--orders", str(tmp_path / "orders"), "--outputs", str(out), "--out", str(tmp_path / "cc")])
    report = json.loads((tmp_path / "cc" / "ingest_report.json").read_text())
    assert report["rows_ok"] == 2 and len(report["errors"]) == 1 and len(report["missing_outputs"]) == len(orders) - 1

    all_dir = tmp_path / "all"
    pipeline.main(["merge", "--inputs", str(tmp_path / "scripted"), str(tmp_path / "cc"), "--out", str(all_dir)])
    pipeline.main(["label-orders", "--data", str(all_dir), "--out", str(tmp_path / "l2")])
    l2 = [read_order(p) for p in sorted((tmp_path / "l2").glob("*.json"))]
    assert sum(o.n for o in l2) == 2
    l2out = tmp_path / "l2out"
    l2out.mkdir()
    for o in l2:
        (l2out / f"{o.id}.jsonl").write_text("\n".join(json.dumps({"pair_id": it["pair_id"],
                                                                   "verdict": "match" if k % 2 == 0 else "no_match",
                                                                   "confidence": 0.9}) for k, it in enumerate(o.payload)),
                                             encoding="utf-8")
    pipeline.main(["label-ingest", "--data", str(all_dir), "--orders", str(tmp_path / "l2"), "--outputs", str(l2out)])
    statuses = {l.status for l in read_jsonl(all_dir / "labels.jsonl", Label)}
    assert {"construction", "agreed", "disagreed"} <= statuses

    pipeline.main(["examples", "--data", str(all_dir), "--seed", "1"])
    for split in ("train", "val", "test"):
        assert (all_dir / f"{split}.jsonl").exists()
    train = read_jsonl(all_dir / "train.jsonl", Example)
    assert train and {e.language for e in train} <= {"en", "he"}
    queue = [json.loads(l) for l in (all_dir / "review_queue.jsonl").read_text(encoding="utf-8").splitlines() if l]
    assert all({"pair_id", "message", "rule", "language"} <= set(q) for q in queue)


def test_ingest_reports_missing_outputs(tmp_path):
    pipeline.main(["cc-orders", "--out", str(tmp_path / "o"), "--per-order", "1", "--seed", "2"])
    (tmp_path / "u").mkdir()
    pipeline.main(["cc-ingest", "--orders", str(tmp_path / "o"), "--outputs", str(tmp_path / "u"), "--out", str(tmp_path / "cc")])
    report = json.loads((tmp_path / "cc" / "ingest_report.json").read_text())
    assert report["rows_ok"] == 0 and len(report["missing_outputs"]) == report["orders"] > 0


def test_scripted_refuses_invalid_templates(tmp_path):
    tdir = tmp_path / "t"
    tdir.mkdir()
    (tdir / "en.json").write_text(json.dumps({"language": "en", "messages": [
        {"id": "a", "category": "us_ssn", "polarity": "positive", "style": "code_help", "text": "no span {us_ssn}"}],
        "rules": []}), encoding="utf-8")
    try:
        pipeline.main(["scripted", "--templates", str(tdir), "--out", str(tmp_path / "s"), "--per-template", "1", "--seed", "1"])
        raise AssertionError("expected SystemExit")
    except SystemExit as e:
        assert "positive needs exactly one" in str(e.code)


def test_examples_keeps_all_claude_test_messages(tmp_path):
    from judge.data.schema import write_jsonl
    msgs = [Message(f"s{i}", "us_ssn", "positive", "meeting_notes", "en", f"scripted {i}", False, 0, f"tmpl:t{i}", "scripted")
            for i in range(50)]
    msgs += [Message(f"c{i}", "us_ssn", "positive", "meeting_notes", "it", f"claude {i}", False, 0, f"c{i}", "claude")
             for i in range(5)]
    rules = [Rule("r1", "us_ssn", "en", "discloses an SSN", "claude")]
    pairs = [Pair(f"p{m.id}", m.id, "r1") for m in msgs]
    labels = [Label(p.id, 1.0, "single") for p in pairs]
    for name, items in (("messages", msgs), ("rules", rules), ("pairs", pairs), ("labels", labels)):
        write_jsonl(tmp_path / f"{name}.jsonl", items)
    (tmp_path / "splits.json").write_text(json.dumps({m.id: "test" for m in msgs}))
    pipeline.main(["examples", "--data", str(tmp_path), "--max-test-messages", "12", "--seed", "1"])
    test = read_jsonl(tmp_path / "test.jsonl", Example)
    ids = {e.message_id for e in test}
    assert len(ids) == 12 and {f"c{i}" for i in range(5)} <= ids


def test_merge_drops_heldout_category_rules_from_training_messages(tmp_path):
    from judge.data.schema import write_jsonl
    src = tmp_path / "cc"
    msgs = [Message("m1", "us_ssn", "positive", "email_draft", "en", "ssn 123-45-6789", False, 0, "g1", "claude")]
    rules = [Rule("r_ok", "us_ssn", "en", "discloses an SSN", "claude"),
             Rule("r_held", "private_key", "en", "contains a private key", "claude")]
    pairs = [Pair("p_ok", "m1", "r_ok"), Pair("p_held", "m1", "r_held")]
    labels = [Label("p_ok", 1.0, "construction"), Label("p_held", 0.0, "construction")]
    for name, items in (("messages", msgs), ("rules", rules), ("pairs", pairs), ("labels", labels)):
        write_jsonl(src / f"{name}.jsonl", items)
    pipeline.main(["merge", "--inputs", str(src), "--out", str(tmp_path / "all")])
    assert [p.id for p in read_jsonl(tmp_path / "all" / "pairs.jsonl", Pair)] == ["p_ok"]
    assert [l.pair_id for l in read_jsonl(tmp_path / "all" / "labels.jsonl", Label)] == ["p_ok"]
    report = json.loads((tmp_path / "all" / "merge_report.json").read_text(encoding="utf-8"))
    assert report["dropped_heldout_rule_pairs"] == 1


def test_build_examples_keeps_tiebreak_resolved_labels():
    msgs = [Message("m1", "us_ssn", "positive", "code_help", "en", "ssn 078-05-1120", False, 4, "m1", "claude")]
    rules = [Rule("r1", "us_ssn", "en", "discloses an SSN", "claude")]
    ex = build_examples(msgs, rules, [Pair("p1", "m1", "r1")], [Label("p1", 0.9, "resolved")], CATEGORIES)
    assert [e.targets for e in ex] == [(0.9,)]


def test_long_examples_bury_test_messages_behind_benign_filler():
    from judge.data.examples import build_long_examples
    fill = [Message(f"b{i}", None, "benign", "chat_question", "en", f"benign filler sentence number {i}. " * 20, False,
                    None, f"b{i}", "scripted") for i in range(30)]
    inner = Message("p1", "us_ssn", "positive", "email_draft", "en", "my ssn is 078-05-1120 ok", False, 10, "p1", "claude")
    ex = Example("p1", inner.text, "en", ("r1",), ("discloses an SSN",), (1.0,), (True,), False, 10)
    out = build_long_examples([ex], fill + [inner], per_language=5, min_prefix_chars=4000, seed=1)
    assert len(out) == 1
    long = out[0]
    assert long.message_id != "p1" and long.rules == ex.rules and long.targets == ex.targets
    assert long.violation_char_start >= 4000
    assert long.message[long.violation_char_start:].startswith("078-05-1120")
    assert inner.text in long.message and "benign filler" in long.message


def test_examples_appends_long_test_messages(tmp_path):
    from judge.data.schema import write_jsonl
    msgs = [Message("c1", "us_ssn", "positive", "meeting_notes", "it", "ssn 078-05-1120", False, 4, "c1", "claude")]
    msgs += [Message(f"b{i}", None, "benign", "meeting_notes", "it", "testo innocuo " * 60, False, None, f"b{i}", "claude")
             for i in range(10)]
    rules = [Rule("r1", "us_ssn", "en", "discloses an SSN", "claude")]
    pairs = [Pair("pc1", "c1", "r1")]
    labels = [Label("pc1", 1.0, "single")]
    for name, items in (("messages", msgs), ("rules", rules), ("pairs", pairs), ("labels", labels)):
        write_jsonl(tmp_path / f"{name}.jsonl", items)
    (tmp_path / "splits.json").write_text(json.dumps({m.id: "test" for m in msgs}))
    pipeline.main(["examples", "--data", str(tmp_path), "--seed", "1", "--long-per-language", "3"])
    test = read_jsonl(tmp_path / "test.jsonl", Example)
    longs = [e for e in test if e.message_id.startswith("long_")]
    assert len(longs) == 1 and longs[0].violation_char_start >= 4000


def test_examples_oversamples_claude_training_messages(tmp_path):
    from judge.data.schema import write_jsonl
    msgs = [Message("s1", "us_ssn", "positive", "email_draft", "en", "scripted 078-05-1120", False, 9, "tmpl:a", "scripted"),
            Message("c1", "us_ssn", "positive", "email_draft", "en", "claude 078-05-1120", False, 7, "c1", "claude")]
    rules = [Rule("r1", "us_ssn", "en", "discloses an SSN", "claude")]
    pairs = [Pair("p1", "s1", "r1"), Pair("p2", "c1", "r1")]
    labels = [Label("p1", 1.0, "construction"), Label("p2", 1.0, "single")]
    for name, items in (("messages", msgs), ("rules", rules), ("pairs", pairs), ("labels", labels)):
        write_jsonl(tmp_path / f"{name}.jsonl", items)
    (tmp_path / "splits.json").write_text(json.dumps({"s1": "train", "c1": "train"}))
    pipeline.main(["examples", "--data", str(tmp_path), "--seed", "1", "--oversample-claude", "3"])
    ids = [e.message_id for e in read_jsonl(tmp_path / "train.jsonl", Example)]
    assert sorted(ids) == ["c1", "c1", "c1", "s1"]


def test_build_examples_attaches_spans_only_to_same_category_matches():
    msgs = [Message("m1", "us_ssn", "positive", "code_help", "en", "my ssn 078-05-1120 ok", False, 7, "m1", "claude", 18)]
    rules = [Rule("r1", "us_ssn", "en", "discloses an SSN", "claude"),
             Rule("r2", "password", "en", "discloses a password", "claude")]
    pairs = [Pair("p1", "m1", "r1"), Pair("p2", "m1", "r2")]
    labels = [Label("p1", 0.95, "single"), Label("p2", 0.05, "single")]
    ex = build_examples(msgs, rules, pairs, labels, CATEGORIES)
    assert ex[0].spans == ((7, 18), None)


def test_long_examples_shift_spans():
    from judge.data.examples import build_long_examples
    fill = [Message(f"b{i}", None, "benign", "chat_question", "en", "filler text. " * 40, False, None, f"b{i}", "scripted")
            for i in range(20)]
    inner = Message("p1", "us_ssn", "positive", "email_draft", "en", "ssn 078-05-1120", False, 4, "p1", "claude", 15)
    ex = Example("p1", inner.text, "en", ("r1",), ("discloses an SSN",), (1.0,), (True,), False, 4, ((4, 15),))
    long = build_long_examples([ex], fill + [inner], per_language=1, min_prefix_chars=4000, seed=1)[0]
    s, e = long.spans[0]
    assert long.message[s:e] == "078-05-1120"


def test_backfill_spans_fills_end_offsets(tmp_path):
    from judge.data.schema import write_jsonl
    old = Message("m1", "us_ssn", "positive", "code_help", "en", "ssn 078-05-1120", False, 4, "m1", "claude")
    new = Message("m1", "us_ssn", "positive", "code_help", "en", "ssn 078-05-1120", False, 4, "m1", "claude", 15)
    write_jsonl(tmp_path / "all" / "messages.jsonl", [old]); write_jsonl(tmp_path / "src" / "messages.jsonl", [new])
    pipeline.main(["backfill-spans", "--data", str(tmp_path / "all"), "--sources", str(tmp_path / "src")])
    assert read_jsonl(tmp_path / "all" / "messages.jsonl", Message)[0].violation_char_end == 15


def test_subset_keeps_scripted_and_seeded_half_of_claude(tmp_path):
    import random
    from judge.data.schema import write_jsonl
    msgs = [Message(f"c{i}", "us_ssn", "positive", "email_draft", "en", f"t{i}", False, None, f"c{i}", "claude") for i in range(6)]
    msgs += [Message("s1", "us_ssn", "positive", "email_draft", "en", "s", False, None, "tmpl:a", "scripted")]
    write_jsonl(tmp_path / "messages.jsonl", msgs)
    ex = [Example(m.id, m.text, "en", ("r",), ("x",), (1.0,), (False,), False, None) for m in msgs]
    write_jsonl(tmp_path / "train.jsonl", ex); write_jsonl(tmp_path / "val.jsonl", ex[:1])
    pipeline.main(["subset", "--data", str(tmp_path), "--out", str(tmp_path / "h"), "--claude-fraction", "0.5", "--seed", "42"])
    ids = [e.message_id for e in read_jsonl(tmp_path / "h" / "train.jsonl", Example)]
    want = set(random.Random(42).sample(sorted(f"c{i}" for i in range(6)), 3))
    assert set(ids) == want | {"s1"}


def test_devx_orders_and_ingest_round_trip(tmp_path):
    from judge.data.schema import write_jsonl
    msgs = [Message("v1", "us_ssn", "positive", "email_draft", "en", "ssn text", False, None, "v1", "claude")]
    rules = [Rule("r1", "us_ssn", "en", "a", "claude"), Rule("r2", "password", "en", "has a password", "claude")]
    write_jsonl(tmp_path / "messages.jsonl", msgs); write_jsonl(tmp_path / "rules.jsonl", rules)
    (tmp_path / "splits.json").write_text(json.dumps({"v1": "val"}))
    pipeline.main(["devx-orders", "--data", str(tmp_path), "--out", str(tmp_path / "o"), "--per-message", "3", "--seed", "1"])
    orders = [read_order(p) for p in (tmp_path / "o").glob("order_*.json")]
    assert sum(o.n for o in orders) == 1
    (tmp_path / "out").mkdir()
    for o in orders:
        (tmp_path / "out" / f"{o.id}.jsonl").write_text(
            json.dumps({"pair_id": o.payload[0]["pair_id"], "verdict": "no_match", "confidence": 0.9}), encoding="utf-8")
    pipeline.main(["devx-ingest", "--data", str(tmp_path), "--orders", str(tmp_path / "o"), "--outputs", str(tmp_path / "out"),
                   "--out", str(tmp_path / "devx.jsonl")])
    ex = read_jsonl(tmp_path / "devx.jsonl", Example)
    assert [(e.message_id, e.rule_ids, e.critical) for e in ex] == [("v1", ("r2",), (True,))] and ex[0].targets[0] < 0.5


def test_check_disjoint_catches_case_and_whitespace_variants():
    from judge.data.splits import check_disjoint
    assert check_disjoint(["Hello   World", "other"], ["hello world", "x"]) == ["hello world"]


def test_merge_refuses_training_text_that_is_in_a_forbidden_set(tmp_path):
    import pytest
    from judge.data.schema import write_jsonl
    src = tmp_path / "src"; src.mkdir()
    m = Message("c1", "us_ssn", "positive", "email_draft", "en", "My SSN is 078-05-1120", False, 10, "c1", "claude")
    write_jsonl(src / "messages.jsonl", [m]); write_jsonl(src / "rules.jsonl", [])
    write_jsonl(src / "pairs.jsonl", []); write_jsonl(src / "labels.jsonl", [])
    forbid = tmp_path / "dev.jsonl"
    forbid.write_text(json.dumps({"message": "my ssn is  078-05-1120"}) + "\n", encoding="utf-8")
    with pytest.raises(SystemExit) as e:
        pipeline.main(["merge", "--inputs", str(src), "--out", str(tmp_path / "out"), "--forbid", str(forbid)])
    assert "also appear in training" in str(e.value.code)


def test_examples_appends_long_training_messages(tmp_path):
    from judge.data.schema import write_jsonl
    msgs = [Message("c1", "us_ssn", "positive", "email_draft", "en", "ssn 078-05-1120", False, 4, "c1", "claude")]
    msgs += [Message(f"b{i}", None, "benign", "email_draft", "en", "harmless text " * 60, False, None, f"b{i}", "claude")
             for i in range(10)]
    rules = [Rule("r1", "us_ssn", "en", "discloses an SSN", "claude")]
    write_jsonl(tmp_path / "messages.jsonl", msgs); write_jsonl(tmp_path / "rules.jsonl", rules)
    write_jsonl(tmp_path / "pairs.jsonl", [Pair("pc1", "c1", "r1")])
    write_jsonl(tmp_path / "labels.jsonl", [Label("pc1", 1.0, "single")])
    (tmp_path / "splits.json").write_text(json.dumps({m.id: "train" for m in msgs}))
    pipeline.main(["examples", "--data", str(tmp_path), "--seed", "1", "--long-train-per-language", "3"])
    train = read_jsonl(tmp_path / "train.jsonl", Example)
    longs = [e for e in train if e.message_id.startswith("long_")]
    assert len(longs) == 1 and longs[0].violation_char_start >= 4000
