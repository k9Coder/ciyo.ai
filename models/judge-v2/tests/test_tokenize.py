from pathlib import Path

import pytest

from judge.config import JudgeConfig
from judge.tokenize import JudgeTokenizer, char_span_to_tokens, tokens_to_char_span

CFG = JudgeConfig(model_version="t", base_model="t")
TEXT = "שלום 078-05-1120 你好 🙂 ok"
REAL_VOCAB = Path(__file__).resolve().parents[1] / "runs" / "vocab"


def _round_trip(tok):
    offs = tok.message_offsets(TEXT)
    assert len(offs) == len(tok.message_ids(TEXT))
    s = TEXT.index("078")
    e = s + len("078-05-1120")
    t0, t1 = char_span_to_tokens(offs, s, e)
    cs, ce = tokens_to_char_span(offs, t0, t1)
    assert cs <= s and ce >= e and "078-05-1120" in TEXT[cs:ce]


def test_offsets_round_trip_on_non_ascii(tiny_tokenizer_dir):
    _round_trip(JudgeTokenizer.load(tiny_tokenizer_dir, CFG))


@pytest.mark.skipif(not (REAL_VOCAB / "tokenizer.json").exists(), reason="pruned tokenizer not built")
def test_offsets_round_trip_on_real_pruned_tokenizer():
    _round_trip(JudgeTokenizer.load(REAL_VOCAB, CFG))


def test_char_span_outside_returns_none():
    assert char_span_to_tokens([(0, 2), (2, 4)], 10, 12) is None
