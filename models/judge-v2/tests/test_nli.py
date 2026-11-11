from judge.data.schema import Example, read_jsonl, write_jsonl
from judge.nli.prepare import load_examples, to_binary, to_example
from judge.nli.stage1 import main as stage1_main
from judge.nli.translate import TARGET_PREFIX, translate_examples


def test_to_binary():
    assert to_binary(0) == 1 and to_binary(1) == 0 and to_binary(2) == 0 and to_binary(-1) is None
    assert to_binary("entailment") == 1 and to_binary("contradiction") == 0 and to_binary("neutral") == 0
    assert to_binary(None) is None and to_binary("weird") is None


def test_load_examples_filters_and_limits():
    rows = [{"premise": "A man sleeps.", "hypothesis": "A person rests.", "label": 0},
            {"premise": "A man sleeps.", "hypothesis": "", "label": 0},
            {"premise": "Dogs bark.", "hypothesis": "Cats meow.", "label": -1},
            {"premise": "It rains.", "hypothesis": "It is dry.", "label": 2}]
    ex = load_examples("snli", limit=5, seed=1, load=lambda name, split: rows)
    assert len(ex) == 2 and {e.targets for e in ex} == {(1.0,), (0.0,)}
    assert all(e.language == "en" and e.critical == (False,) for e in ex)
    assert len(load_examples("snli", limit=1, seed=1, load=lambda name, split: rows)) == 1


def test_translate_examples_translates_each_text_once():
    ex = [to_example("snli", "A man sleeps.", "A person rests.", 1), to_example("snli", "A man sleeps.", "Nobody sleeps.", 0)]
    calls = []

    def fake(texts):
        calls.append(list(texts))
        return [f"[he] {t}" for t in texts]

    out = translate_examples(ex, "he", fake)
    assert len(calls) == 1 and sorted(calls[0]) == sorted({"A man sleeps.", "A person rests.", "Nobody sleeps."})
    assert out[0].message == "[he] A man sleeps." and out[0].rules == ("[he] A person rests.",)
    assert out[0].language == "he" and out[0].targets == (1.0,) and out[0].message_id != ex[0].message_id
    assert TARGET_PREFIX == {"ar": ">>ara<< ", "zh": ">>cmn_Hans<< ", "pt": ">>pob<< "}


def test_stage1_combines_languages_with_small_val(tmp_path):
    nli = tmp_path / "nli"
    write_jsonl(nli / "en.jsonl", [to_example("snli", f"p{i}", f"h{i}", i % 2) for i in range(500)])
    write_jsonl(nli / "he.jsonl", [to_example("snli", f"p{i}", f"h{i}", i % 2, "he") for i in range(500)])
    stage1_main(["--nli-dir", str(nli), "--out", str(tmp_path / "stage1")])
    train = read_jsonl(tmp_path / "stage1" / "train.jsonl", Example)
    val = read_jsonl(tmp_path / "stage1" / "val.jsonl", Example)
    assert len(train) + len(val) == 1000 and 5 <= len(val) <= 40
    assert {e.language for e in train} == {"en", "he"}
    assert not ({e.message_id for e in train} & {e.message_id for e in val})
