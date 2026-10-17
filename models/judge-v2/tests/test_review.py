import json

from judge.data.schema import Label, Message, Pair, Rule, write_jsonl
from judge.review.make_page import make_items, render_page
from judge.review.score import agreement, main as score_main


def _data(tmp_path):
    msgs = [Message(f"m{i}", "us_ssn", "positive", "meeting_notes", "he", f"<b>הודעה {i}</b>", False, 0, f"m{i}", "claude")
            for i in range(6)]
    rules = [Rule("r1", "us_ssn", "en", "discloses an SSN", "claude")]
    pairs = [Pair(f"p{i}", f"m{i}", "r1") for i in range(6)]
    labels = [Label(f"p{i}", 0.9 if i % 2 else 0.2, "agreed") for i in range(4)]
    labels += [Label("p4", 1.0, "construction"), Label("p5", 0.6, "disagreed")]
    for name, items in (("messages", msgs), ("rules", rules), ("pairs", pairs), ("labels", labels)):
        write_jsonl(tmp_path / f"{name}.jsonl", items)
    (tmp_path / "splits.json").write_text(json.dumps({m.id: "test" for m in msgs}))
    (tmp_path / "review_queue.jsonl").write_text(json.dumps({"pair_id": "p5", "message": "x", "rule": "r", "language": "he"},
                                                            ensure_ascii=False) + "\n", encoding="utf-8")


def test_sample_items_and_page_escaping(tmp_path):
    _data(tmp_path)
    items = make_items(tmp_path, "sample", n=10, seed=1)
    assert {i["pair_id"] for i in items} == {"p0", "p1", "p2", "p3", "p4"}
    assert {i["teacher"] for i in items} == {"match", "no_match"} and {i["language"] for i in items} == {"he"}
    html = render_page(items + [{"pair_id": "x", "language": "en", "message": "</script><img>", "rule": "r", "teacher": None}], "t")
    assert "</script><img>" not in html and "innerHTML" not in html and "textContent" in html


def test_queue_items_hide_teacher(tmp_path):
    _data(tmp_path)
    items = make_items(tmp_path, "queue", n=400, seed=1)
    assert [i["pair_id"] for i in items] == ["p5"] and items[0]["teacher"] is None


def test_agreement_excludes_unsure():
    items = [{"pair_id": "a", "teacher": "match"}, {"pair_id": "b", "teacher": "no_match"}, {"pair_id": "c", "teacher": "match"}]
    rate, n, bad = agreement(items, {"a": "match", "b": "match", "c": "unsure"})
    assert n == 2 and rate == 0.5 and bad == ["b"]


def test_queue_scoring_writes_human_labels(tmp_path):
    _data(tmp_path)
    res = tmp_path / "review_results.json"
    res.write_text(json.dumps({"p5": "no_match"}))
    score_main(["--data", str(tmp_path), "--results", str(res), "--mode", "queue"])
    assert json.loads((tmp_path / "human_labels.json").read_text()) == {"p5": 0.0}


def _bilingual(tmp_path):
    msgs = [Message(f"m{i}", "us_ssn", "positive", "meeting_notes", lang, f"text {i}", False, 0, f"m{i}", "claude")
            for i, lang in enumerate(["en", "he", "ru", "zh"])]
    rules = [Rule("r1", "us_ssn", "en", "discloses an SSN", "claude")]
    pairs = [Pair(f"p{i}", f"m{i}", "r1") for i in range(4)]
    labels = [Label(f"p{i}", 0.9, "agreed") for i in range(4)]
    for name, items in (("messages", msgs), ("rules", rules), ("pairs", pairs), ("labels", labels)):
        write_jsonl(tmp_path / f"{name}.jsonl", items)
    (tmp_path / "splits.json").write_text(json.dumps({m.id: "test" for m in msgs}))


def test_sample_can_be_limited_to_languages_the_owner_reads(tmp_path):
    _bilingual(tmp_path)
    items = make_items(tmp_path, "sample", n=10, seed=1, languages={"en", "he"})
    assert {i["language"] for i in items} == {"en", "he"}


def test_sample_page_hides_teacher_verdict(tmp_path):
    _bilingual(tmp_path)
    html = render_page(make_items(tmp_path, "sample", n=10, seed=1), "t")
    assert '"teacher": "match"' not in html and '"teacher":"match"' not in html


def test_queue_page_shows_english_translation(tmp_path):
    (tmp_path / "review_queue.jsonl").write_text(json.dumps({"pair_id": "p", "message": "привет", "rule": "r",
                                                             "language": "ru", "translation": "hello"},
                                                            ensure_ascii=False) + "\n", encoding="utf-8")
    items = make_items(tmp_path, "queue", n=10, seed=1)
    assert items[0]["translation"] == "hello"
    html = render_page(items, "t")
    assert 'id="translation"' in html and "hello" in html


def test_score_uses_the_same_language_filter(tmp_path, capsys):
    _bilingual(tmp_path)
    res = tmp_path / "r.json"
    res.write_text(json.dumps({"p0": "match", "p1": "match", "p2": "no_match", "p3": "no_match"}))
    score_main(["--data", str(tmp_path), "--results", str(res), "--mode", "sample", "--languages", "en,he"])
    assert "1.0000 over 2" in capsys.readouterr().out


def test_queue_can_be_limited_to_languages_the_owner_reads(tmp_path):
    rows = [{"pair_id": f"p{l}", "message": "x", "rule": "r", "language": l} for l in ("en", "he", "it")]
    (tmp_path / "review_queue.jsonl").write_text("".join(json.dumps(r) + "\n" for r in rows), encoding="utf-8")
    items = make_items(tmp_path, "queue", n=10, seed=1, languages={"en", "he"})
    assert [i["pair_id"] for i in items] == ["pen", "phe"]
