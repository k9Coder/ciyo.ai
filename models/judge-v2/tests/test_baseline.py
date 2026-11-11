import torch
from transformers import AutoTokenizer, DebertaV2Config, DebertaV2ForSequenceClassification

from judge.baseline.zeroshot import ZeroShotNLI, best_threshold, rows_for
from judge.data.schema import Example
from judge.evaluate.metrics import Row


def _scorer(tiny_tokenizer_dir, max_len=24):
    cfg = DebertaV2Config(vocab_size=97, hidden_size=32, num_hidden_layers=2, num_attention_heads=2, intermediate_size=64,
                          max_position_embeddings=128, type_vocab_size=0,
                          id2label={0: "entailment", 1: "neutral", 2: "contradiction"},
                          label2id={"entailment": 0, "neutral": 1, "contradiction": 2})
    torch.manual_seed(0)
    model = DebertaV2ForSequenceClassification(cfg).eval()
    return ZeroShotNLI(model, AutoTokenizer.from_pretrained(tiny_tokenizer_dir), max_len=max_len, overlap=4)


def test_long_message_takes_max_over_windows(tiny_tokenizer_dir):
    s = _scorer(tiny_tokenizer_dir)
    words = ("hello thanks password review code bug fix team report " * 6).split()
    message = " ".join(words)
    rule = "message discloses password"
    windows = s.windows(message, rule)
    assert len(windows) > 1
    singles = [s._entail(w, rule) for w in windows]
    assert abs(s.score(message, [rule])[0] - max(singles)) < 1e-6


def test_short_message_single_window(tiny_tokenizer_dir):
    s = _scorer(tiny_tokenizer_dir, max_len=64)
    assert len(s.windows("hello thanks", "message discloses password")) == 1
    probs = s.score("hello thanks", ["message discloses password", "message discloses salary"])
    assert len(probs) == 2 and all(0.0 <= p <= 1.0 for p in probs)


def test_rows_for_marks_language_and_late(tiny_tokenizer_dir):
    s = _scorer(tiny_tokenizer_dir, max_len=64)
    ex = [Example("m1", "hello " * 600 + "password", "he", ("r1",), ("message discloses password",), (1.0,), (True,), True,
                  len("hello " * 600))]
    rows = rows_for(s, ex)
    assert rows[0].language == "he" and rows[0].late_violation is True and rows[0].label == 1


def test_best_threshold_maximizes_f2():
    rows = [Row(0.9, 1, False, False, None), Row(0.6, 1, False, False, None), Row(0.55, 0, False, False, None),
            Row(0.2, 0, False, False, None)]
    assert best_threshold(rows) == 0.6
