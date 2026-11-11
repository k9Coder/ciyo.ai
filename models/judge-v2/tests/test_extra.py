import json

from judge import pipeline
from judge.data.extra import extra_pairs
from judge.data.schema import Label, Message, Pair, Rule, read_jsonl, write_jsonl


def _m(i, lang="en", cat="us_ssn"):
    return Message(f"m{i}", cat, "positive", "email_draft", lang, f"text {i}", False, None, f"m{i}", "claude")


RULES = [Rule("r_ssn", "us_ssn", "en", "an SSN", "claude"), Rule("r_card", "credit_card", "en", "a card", "claude"),
         Rule("r_key", "private_key", "en", "a private key", "claude"), Rule("r_de", "password", "de", "ein Passwort", "claude"),
         Rule("r_fr", "salary_of_named_person", "fr", "un salaire", "claude")]


def test_extra_pairs_skip_heldout_own_category_and_other_languages():
    pairs = extra_pairs([_m(1)], RULES, {"m1"}, per_message=10, seed=0)
    assert {r for _, r in pairs} == {"r_card"}


def test_extra_pairs_only_for_given_messages_and_allow_english_rules_for_other_languages():
    msgs = [_m(1), _m(2, lang="de")]
    pairs = extra_pairs(msgs, RULES, {"m2"}, per_message=10, seed=0)
    assert {m for m, _ in pairs} == {"m2"} and {r for _, r in pairs} == {"r_card", "r_de"}


def test_extra_orders_and_ingest_append_pairs_and_labels(tmp_path):
    d = tmp_path / "data"; d.mkdir()
    write_jsonl(d / "messages.jsonl", [_m(1)]); write_jsonl(d / "rules.jsonl", RULES)
    write_jsonl(d / "pairs.jsonl", [Pair("p0", "m1", "r_ssn")]); write_jsonl(d / "labels.jsonl", [Label("p0", 1.0, "agreed")])
    (tmp_path / "ids.json").write_text(json.dumps(["m1"]))
    pipeline.main(["extra-orders", "--data", str(d), "--message-ids", str(tmp_path / "ids.json"),
                   "--out", str(tmp_path / "o"), "--per-message", "4", "--seed", "0"])
    order = next((tmp_path / "o").glob("order_*.json"))
    item = json.loads(order.read_text(encoding="utf-8"))["payload"][0]
    (tmp_path / "out").mkdir()
    (tmp_path / "out" / f"{order.stem}.jsonl").write_text(
        json.dumps({"pair_id": item["pair_id"], "verdict": "no_match", "confidence": 0.9}) + "\n", encoding="utf-8")
    pipeline.main(["extra-ingest", "--data", str(d), "--orders", str(tmp_path / "o"), "--outputs", str(tmp_path / "out")])
    assert len(read_jsonl(d / "pairs.jsonl", Pair)) == 2
    labels = {l.pair_id: l for l in read_jsonl(d / "labels.jsonl", Label)}
    assert abs(labels[item["pair_id"]].p_match - 0.1) < 1e-9 and labels[item["pair_id"]].status == "single"
