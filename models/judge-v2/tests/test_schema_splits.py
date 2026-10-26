import pytest

from judge.data.catalog import (
    CATEGORIES, CRITICAL_FAMILIES, HELDOUT_LANGUAGES, HELDOUT_STYLES, LANGUAGES, MESSAGE_STYLES, TRAIN_LANGUAGES,
    has_script,
)
from judge.data.schema import Example, Message, Pair, Rule, read_jsonl, stable_id, write_jsonl
from judge.data.splits import (
    assign_splits, check_no_leakage, group_is_test_template, message_is_test, rule_is_test_only,
)


def _m(i, lang="en", cat="us_ssn", style="code_help", group=None, text=None):
    mid = f"m{i}"
    return Message(mid, cat, "positive", style, lang, text or f"text {i}", False, 0, group or mid, "claude")


def test_catalog_invariants():
    assert len(CATEGORIES) == 56 and len({c.id for c in CATEGORIES}) == 56
    assert all(c.critical == (c.family in CRITICAL_FAMILIES) for c in CATEGORIES)
    assert sum(c.heldout for c in CATEGORIES) == 7
    assert set(TRAIN_LANGUAGES) | set(HELDOUT_LANGUAGES) == set(LANGUAGES)
    assert HELDOUT_LANGUAGES == ("it", "nl") and "zh" in TRAIN_LANGUAGES
    assert HELDOUT_STYLES < set(MESSAGE_STYLES)


def test_has_script():
    assert has_script("שלום", "he") and not has_script("hello", "he")
    assert has_script("你好", "zh") and has_script("hola", "es")


def test_jsonl_roundtrip_with_tuples(tmp_path):
    ex = [Example("m1", "hi", "en", ("r1",), ("rule",), (1.0,), (True,), False, None)]
    write_jsonl(tmp_path / "e.jsonl", ex)
    assert read_jsonl(tmp_path / "e.jsonl", Example) == ex
    assert stable_id("a", "b").startswith("a_") and len(stable_id("a", "b")) == 18


def test_message_is_test_rules():
    assert message_is_test(_m(1, lang="it"))
    assert message_is_test(_m(2, style="meeting_notes"))
    assert message_is_test(_m(3, cat="private_key"))
    assert not message_is_test(_m(4))
    assert rule_is_test_only("private_key", "en") and rule_is_test_only("us_ssn", "nl")
    assert not rule_is_test_only("us_ssn", "he")


def test_test_templates_are_about_15_percent():
    share = sum(group_is_test_template(f"tmpl:t{i}") for i in range(4000)) / 4000
    assert 0.12 < share < 0.18
    assert not any(group_is_test_template(f"m{i}") for i in range(200))


def test_assign_splits_keeps_groups_together():
    msgs = [_m(i, group=f"tmpl:g{i // 4}") for i in range(400)]
    splits = assign_splits(msgs)
    for g in {m.group_id for m in msgs}:
        assert len({splits[m.id] for m in msgs if m.group_id == g}) == 1
    assert {"train", "val", "test"} <= set(splits.values())


def test_leakage_checks():
    a, b = _m(1, text="same"), _m(2, lang="it", text="same")
    with pytest.raises(ValueError, match="shared text"):
        check_no_leakage([a, b], [], [], {"m1": "train", "m2": "test"})
    c, d = _m(3, group="g"), _m(4, group="g")
    with pytest.raises(ValueError, match="group"):
        check_no_leakage([c, d], [], [], {"m3": "train", "m4": "val"})
    rule = Rule("r1", "private_key", "en", "discloses a private key", "claude")
    with pytest.raises(ValueError, match="test-only rule"):
        check_no_leakage([_m(5)], [rule], [Pair("p", "m5", "r1")], {"m5": "train"})


def test_lazy_jsonl_random_access_without_loading(tmp_path):
    from judge.data.schema import LazyJsonl
    exs = [Example(f"m{i}", f"שלום text {i}\nline", "he", ("r",), ("rule",), (1.0,), (True,), False, None)
           for i in range(50)]
    write_jsonl(tmp_path / "e.jsonl", exs)
    lazy = LazyJsonl(tmp_path / "e.jsonl", Example)
    assert len(lazy) == 50
    assert lazy[37] == exs[37] and lazy[0] == exs[0] and lazy[49] == exs[49]
    assert [e.message_id for e in (lazy[i] for i in (3, 1, 2))] == ["m3", "m1", "m2"]
