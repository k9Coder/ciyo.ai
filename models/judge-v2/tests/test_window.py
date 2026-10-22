from judge.config import JudgeConfig
from judge.data.schema import Example
from judge.tokenize import JudgeTokenizer
from judge.window import token_window, window_examples
from tests.conftest import TINY_WORDS


def test_short_message_is_one_window():
    assert token_window(120, (50, 60), size=400) == (0, 120)


def test_window_centres_on_span_and_stays_in_bounds():
    a, b = token_window(2000, (1900, 1910), size=400)
    assert b - a == 400 and a <= 1900 and b >= 1911 and b <= 2000


def test_window_examples_rebase_spans(tiny_tokenizer_dir):
    tok = JudgeTokenizer.load(tiny_tokenizer_dir, JudgeConfig(model_version="t", base_model="t"))
    text = " ".join(TINY_WORDS[i % len(TINY_WORDS)] for i in range(300)) + " SECRET 078-05-1120"
    s = text.index("078")
    e = len(text)
    ex = Example("m", text, "en", ("r",), ("x",), (1.0,), (True,), False, s, ((s, e),))
    w = window_examples([ex], tok, size=40)[0]
    ws, we = w.spans[0]
    assert w.message[ws:we] == "078-05-1120" and w.message_id == "m#w0"


def test_negative_rule_gets_a_window_and_keeps_its_target(tiny_tokenizer_dir):
    tok = JudgeTokenizer.load(tiny_tokenizer_dir, JudgeConfig(model_version="t", base_model="t"))
    text = " ".join(TINY_WORDS[i % len(TINY_WORDS)] for i in range(300))
    ex = Example("m", text, "en", ("r",), ("x",), (0.0,), (False,), False, None)
    w = window_examples([ex], tok, size=40, seed=1)
    assert len(w) == 1 and w[0].targets == (0.0,) and len(tok.message_ids(w[0].message)) <= 40
