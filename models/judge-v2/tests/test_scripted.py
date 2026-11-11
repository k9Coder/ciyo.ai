import json

from judge.data.scripted import FILLERS, SENSITIVE_SLOTS, generate, load_templates, validate
from judge.data.splits import message_is_test, rule_is_test_only


def _set(tmp_path, data):
    p = tmp_path / f"{data['language']}.json"
    p.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
    return load_templates(p)


EN = {"language": "en", "messages": [
    {"id": "en-m-1", "category": "us_ssn", "polarity": "positive", "style": "email_draft",
     "text": "Hi {name}, for the payroll form [[my SSN is {us_ssn}]], thanks."},
    {"id": "en-m-2", "category": "us_ssn", "polarity": "hard_negative", "style": "chat_question",
     "text": "How many digits does a Social Security Number have?"},
    {"id": "en-m-3", "category": None, "polarity": "benign", "style": "code_help", "text": "Why does my loop never end?"},
    {"id": "en-m-4", "category": "project_codename", "polarity": "positive", "style": "document_paste",
     "text": "Summary: [[{codename} ships to beta customers on {date}]]."},
    {"id": "en-m-5", "category": "credit_card", "polarity": "positive", "style": "email_draft",
     "text": "Please charge [[card {card}]] for {company}."},
], "rules": [
    {"id": "en-r-1", "category": "us_ssn", "text": "This message discloses a US Social Security Number, even if disguised."},
    {"id": "en-r-2", "category": "project_codename", "text": "This message discloses details of Project {codename}, even if disguised."},
    {"id": "en-r-3", "category": "credit_card", "text": "This message discloses a payment card number, even if disguised."},
    {"id": "en-r-4", "category": "api_key", "text": "This message discloses an API key, even if disguised."},
    {"id": "en-r-5", "category": "private_key", "text": "This message discloses a private key, even if disguised."},
]}
HE = {"language": "he", "messages": [
    {"id": "he-m-1", "category": "us_ssn", "polarity": "positive", "style": "email_draft",
     "text": "שלום, [[מספר הביטוח הלאומי האמריקאי שלי הוא {us_ssn}]] תודה"},
], "rules": [
    {"id": "he-r-1", "category": "us_ssn", "text": "ההודעה חושפת מספר ביטוח לאומי אמריקאי"},
    {"id": "he-r-2", "category": "api_key", "text": "ההודעה חושפת מפתח API"},
]}


def test_valid_templates_pass(tmp_path):
    assert validate(_set(tmp_path, EN)) == [] and validate(_set(tmp_path, HE)) == []


def test_validate_rejects_bad_templates(tmp_path):
    bad = {"language": "he", "messages": [
        {"id": "x1", "category": "us_ssn", "polarity": "positive", "style": "email_draft", "text": "ssn {us_ssn}"},
        {"id": "x2", "category": "us_ssn", "polarity": "hard_negative", "style": "email_draft", "text": "שלום [[{us_ssn}]]"},
        {"id": "x3", "category": "home_address", "polarity": "positive", "style": "email_draft", "text": "שלום [[{address}]] {card}"},
        {"id": "x4", "category": "us_ssn", "polarity": "positive", "style": "email_draft", "text": "שלום [[{nope}]]"},
        {"id": "x5", "category": None, "polarity": "positive", "style": "email_draft", "text": "שלום [[x]]"},
        {"id": "x6", "category": "us_ssn", "polarity": "positive", "style": "fax", "text": "שלום [[{us_ssn}]]"},
        {"id": "x7", "category": "project_codename", "polarity": "positive", "style": "email_draft", "text": "שלום [[secret]]"},
    ], "rules": [{"id": "x8", "category": "us_ssn", "text": "rule with {card}"}]}
    errors = "\n".join(validate(_set(tmp_path, bad)))
    for needle in ["x1: positive needs exactly one", "x2: only positives", "x3: slot card belongs to another category",
                   "x4: unknown slot nope", "x5: benign iff no category", "x6: unknown style", "x7: codename messages",
                   "x8: rules may only use", "x1: text not in he script"]:
        assert needle in errors, needle


def test_generate_labels_offsets_and_groups(tmp_path):
    msgs, rules, pairs, labels = generate([_set(tmp_path, EN)], per_template=3, seed=1)
    by_rule = {r.id: r for r in rules}
    by_msg = {m.id: m for m in msgs}
    lab = {l.pair_id: l for l in labels}
    assert all(l.status == "construction" for l in labels)
    for p in pairs:
        m, r = by_msg[p.message_id], by_rule[p.rule_id]
        expected = 1.0 if (m.polarity == "positive" and r.category_id == m.category_id
                           and (m.category_id != "project_codename" or r.text.split("Project ")[1].split(",")[0] in m.text)) else 0.0
        assert lab[p.id].p_match == expected, (m.text, r.text)
    for m in msgs:
        assert m.group_id.startswith("tmpl:") and m.source == "scripted"
        if m.polarity == "positive":
            assert "[[" not in m.text and m.violation_char_start is not None
    ssn = [m for m in msgs if m.category_id == "us_ssn" and m.polarity == "positive"][0]
    assert ssn.text[ssn.violation_char_start:].startswith("my SSN is ")


def test_codename_pairs_match_own_and_reject_sibling(tmp_path):
    msgs, rules, pairs, labels = generate([_set(tmp_path, EN)], per_template=2, seed=3)
    lab = {l.pair_id: l.p_match for l in labels}
    by_rule = {r.id: r for r in rules}
    for m in (m for m in msgs if m.category_id == "project_codename"):
        own = [p for p in pairs if p.message_id == m.id and by_rule[p.rule_id].category_id == "project_codename"]
        assert sorted(lab[p.id] for p in own) == [0.0, 1.0]


def test_generate_makes_cross_language_pairs(tmp_path):
    msgs, rules, pairs, _ = generate([_set(tmp_path, EN), _set(tmp_path, HE)], per_template=40, seed=2,
                                     english_rule_share=0.5)
    he_ids = {m.id for m in msgs if m.language == "he"}
    langs = {r.id: r.language for r in rules}
    used = {langs[p.rule_id] for p in pairs if p.message_id in he_ids}
    assert used == {"he", "en"}


def test_non_test_messages_never_get_test_only_rules(tmp_path):
    msgs, rules, pairs, _ = generate([_set(tmp_path, EN)], per_template=20, seed=4)
    by_rule, by_msg = {r.id: r for r in rules}, {m.id: m for m in msgs}
    for p in pairs:
        r = by_rule[p.rule_id]
        if rule_is_test_only(r.category_id, r.language):
            assert message_is_test(by_msg[p.message_id])


def test_fillers_cover_sensitive_slots():
    for slots in SENSITIVE_SLOTS.values():
        assert slots <= set(FILLERS)


def test_api_key_formats_are_realistic():
    import random
    import re
    from judge.data.scripted import _api_key
    shapes = [r"AKIA[0-9A-Z]{16}", r"ghp_[A-Za-z0-9]{36}", r"sk-[A-Za-z0-9]{48}",
              r"xoxb-\d{10,13}-\d{10,13}-[A-Za-z0-9]{24}", r"AIza[0-9A-Za-z_\-]{35}"]
    rng = random.Random(1)
    keys = [_api_key(None, rng) for _ in range(300)]
    for k in keys:
        assert any(re.fullmatch(s, k) for s in shapes), k
    assert {k[:3] for k in keys} >= {"AKI", "ghp", "sk-", "xox", "AIz"}


def test_amounts_vary_in_magnitude_and_format():
    import random
    from faker import Faker
    rng = random.Random(2)
    amounts = [FILLERS["amount"](Faker("en_US"), rng) for _ in range(200)]
    assert any(a.endswith("M") for a in amounts) and any(a.endswith("K") for a in amounts)
    assert any(a.replace(",", "").isdigit() for a in amounts)


def test_generated_positive_records_span_end(tmp_path):
    msgs, *_ = generate([_set(tmp_path, EN)], per_template=1, seed=3)
    pos = [m for m in msgs if m.polarity == "positive"]
    assert pos and all(m.violation_char_end is not None and m.violation_char_end > m.violation_char_start for m in pos)
