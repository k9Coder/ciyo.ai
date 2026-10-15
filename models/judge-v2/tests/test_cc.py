import json

from judge.cc.ingest import ingest_labels, ingest_pairs
from judge.cc.merge import merge_second_pass, needs_second_pass, p_from
from judge.cc.orders import Order, label_orders, pair_orders, read_order, write_orders
from judge.data.catalog import CATEGORIES, LANGUAGES
from judge.data.schema import Label


def _write(path, rows):
    path.write_text("\n".join(r if isinstance(r, str) else json.dumps(r, ensure_ascii=False) for r in rows), encoding="utf-8")
    return path


def test_pair_orders_cover_languages_and_categories(tmp_path):
    orders = pair_orders(CATEGORIES, n_per_order=6, seed=1)
    assert len(orders) == len(LANGUAGES) * (len(CATEGORIES) + 1)
    assert len({o.id for o in orders}) == len(orders) and all(len(o.styles) == 3 for o in orders)
    write_orders(orders[:2], tmp_path)
    assert read_order(tmp_path / f"{orders[0].id}.json") == orders[0]


def test_label_orders_batch_payload():
    items = [{"pair_id": f"p{i}", "message": "m", "rule": "r"} for i in range(85)]
    orders = label_orders(items, batch=40)
    assert [o.n for o in orders] == [40, 40, 5] and orders[0].payload[0]["pair_id"] == "p0"


GOOD = {"message": "שלח לי את הקובץ, המפתח הוא sk-ABCDEFGHIJKLMNOP1234567890abcd", "polarity": "positive",
        "style": "code_help", "adversarial": False, "violating_excerpt": "sk-ABCDEFGHIJKLMNOP1234567890abcd",
        "rules": [{"text": "ההודעה חושפת מפתח API", "category": "api_key", "language": "he", "verdict": "match", "confidence": 0.95},
                  {"text": "This message discloses a US SSN, even if disguised.", "category": "us_ssn", "language": "en",
                   "verdict": "no_match", "confidence": 0.9}]}


def test_ingest_pairs_accepts_good_rows(tmp_path):
    order = Order("o1", "pairs", "he", "api_key", ("code_help",), 1, ())
    msgs, rules, pairs, labels, errors = ingest_pairs(order, _write(tmp_path / "o1.jsonl", [GOOD]))
    assert errors == [] and len(msgs) == 1 and len(rules) == 2 and len(pairs) == 2
    m = msgs[0]
    assert m.language == "he" and m.source == "claude" and m.group_id == m.id
    assert m.text[m.violation_char_start:].startswith("sk-")
    assert sorted(l.p_match for l in labels) == [0.09999999999999998, 0.95] and {l.status for l in labels} == {"single"}


def test_ingest_pairs_rejects_bad_rows(tmp_path):
    order = Order("o1", "pairs", "he", "api_key", ("code_help",), 6, ())
    bad = [
        "not json",
        {**GOOD, "violating_excerpt": "not in message"},
        {**GOOD, "message": "plain english only"},
        {**GOOD, "polarity": "benign"},
        {**GOOD, "rules": [GOOD["rules"][0]]},
        {**GOOD, "rules": [{**GOOD["rules"][0], "verdict": "maybe"}, GOOD["rules"][1]]},
        {**GOOD, "rules": [{**GOOD["rules"][0], "category": "nope"}, GOOD["rules"][1]]},
        {**GOOD, "style": "fax"},
    ]
    msgs, _, _, _, errors = ingest_pairs(order, _write(tmp_path / "o1.jsonl", bad))
    assert msgs == [] and len(errors) == len(bad)
    joined = "\n".join(errors)
    for needle in ["line 1", "excerpt", "script", "polarity", "2-4 rules", "verdict", "category", "style"]:
        assert needle in joined, needle


def test_ingest_labels(tmp_path):
    order = Order("o2", "label", "mixed", None, (), 2, ({"pair_id": "p1", "message": "m", "rule": "r"},
                                                          {"pair_id": "p2", "message": "m", "rule": "r"}))
    rows = [{"pair_id": "p1", "verdict": "match", "confidence": 0.8}, {"pair_id": "zzz", "verdict": "match", "confidence": 0.8},
            {"pair_id": "p2", "verdict": "no_match", "confidence": 2}]
    got, errors = ingest_labels(order, _write(tmp_path / "o2.jsonl", rows))
    assert got == {"p1": 0.8, "p2": 0.0} and len(errors) == 1 and "zzz" in errors[0]


def test_second_pass_rules_and_merge():
    assert not needs_second_pass(Label("a", 1.0, "construction"), is_test=True)
    assert needs_second_pass(Label("b", 0.97, "single"), is_test=True)
    assert needs_second_pass(Label("c", 0.7, "single"), is_test=False)
    assert not needs_second_pass(Label("d", 0.05, "single"), is_test=False)
    merged = {l.pair_id: l for l in merge_second_pass([Label("x", 0.9, "single"), Label("y", 0.8, "single"),
                                                        Label("z", 0.2, "single")], {"x": 0.7, "y": 0.1})}
    assert merged["x"].status == "agreed" and abs(merged["x"].p_match - 0.8) < 1e-9
    assert merged["y"].status == "disagreed" and merged["z"].status == "single"
    assert p_from("match", 0.2) == 0.5 and p_from("no_match", 0.9) == 0.09999999999999998


def test_pair_orders_use_training_styles_for_training_orders():
    from judge.data.catalog import HELDOUT_LANGUAGES, HELDOUT_STYLES
    from judge.data.splits import HELDOUT_CATEGORY_IDS
    orders = pair_orders(CATEGORIES, n_per_order=6, seed=1)
    train_orders = [o for o in orders if o.language not in HELDOUT_LANGUAGES and o.category_id not in HELDOUT_CATEGORY_IDS]
    assert train_orders and all(not set(o.styles) & HELDOUT_STYLES for o in train_orders)
    assert any(set(o.styles) & HELDOUT_STYLES for o in orders if o not in train_orders)
