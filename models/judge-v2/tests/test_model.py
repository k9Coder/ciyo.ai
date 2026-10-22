import pytest
import torch

from judge.backbone import Backbone
from judge.config import JudgeConfig
from judge.model import JudgeModel, step_tensors
from judge.sequence import causal_step, rules_step, single_pass
from judge.tokenize import JudgeTokenizer
from tests.conftest import tiny_gemma3


def _model():
    torch.manual_seed(3)
    return JudgeModel(Backbone.from_hf_model(tiny_gemma3())).eval()


def _tok(tiny_tokenizer_dir):
    return JudgeTokenizer.load(tiny_tokenizer_dir, JudgeConfig(model_version="t", base_model="tiny"))


def _verdicts(model, step, pk, pv):
    with torch.no_grad():
        logits, _, _, _, _ = model(*step_tensors(step), pk, pv)
    return logits[0, list(step.verdict_index)]


def test_cached_path_equals_single_pass(tiny_tokenizer_dir):
    m, tok = _model(), _tok(tiny_tokenizer_dir)
    prefix = tok.prefix_ids()
    msg = tok.message_ids("please help me fix this bug in the database server log")
    rules = [tok.rule_ids("this message discloses a password"), tok.rule_ids("this message discloses a card number")]
    k0, v0 = m.backbone.empty_past()
    ref = _verdicts(m, single_pass(prefix, msg, rules), k0, v0)
    with torch.no_grad():
        _, _, _, pk, pv = m(*step_tensors(causal_step(prefix, 0)), k0, v0)
        p = len(prefix)
        for a, b in [(0, 5), (5, len(msg))]:
            _, _, _, pk, pv = m(*step_tensors(causal_step(msg[a:b], p)), pk, pv)
            p += b - a
    got = _verdicts(m, rules_step(rules, p), pk, pv)
    torch.testing.assert_close(got, ref, atol=1e-4, rtol=1e-4)


def test_rules_do_not_influence_each_other(tiny_tokenizer_dir):
    m, tok = _model(), _tok(tiny_tokenizer_dir)
    prefix, msg = tok.prefix_ids(), tok.message_ids("hello can you review this code")
    r1 = tok.rule_ids("this message discloses secret code")
    k0, v0 = m.backbone.empty_past()
    a = _verdicts(m, single_pass(prefix, msg, [r1, tok.rule_ids("salary")]), k0, v0)[0]
    b = _verdicts(m, single_pass(prefix, msg, [r1, tok.rule_ids("patient diagnosis report")]), k0, v0)[0]
    torch.testing.assert_close(a, b, atol=1e-5, rtol=1e-5)


def test_prefix_starts_with_bos(tiny_tokenizer_dir):
    tok = _tok(tiny_tokenizer_dir)
    assert tok.prefix_ids()[0] == 1


def test_blank_rule_raises(tiny_tokenizer_dir):
    tok = _tok(tiny_tokenizer_dir)
    with pytest.raises(ValueError, match="rule text is empty"):
        tok.rule_ids("   \n ")


def test_unicode_and_emoji_do_not_crash(tiny_tokenizer_dir):
    tok = _tok(tiny_tokenizer_dir)
    ids = tok.message_ids("שלום 👋 can you help — ñandú 123-45-6789")
    assert len(ids) > 0


def test_remap_applies_and_falls_back(tiny_tokenizer_dir):
    cfg = JudgeConfig(model_version="t", base_model="tiny")
    base = JudgeTokenizer.load(tiny_tokenizer_dir, cfg)
    raw = base.message_ids("hello thanks")
    remapped = JudgeTokenizer(base.hf, cfg, remap={raw[0]: 0}, fallback_id=7)
    assert remapped.message_ids("hello thanks") == [0, 7]


def test_char_to_token_index(tiny_tokenizer_dir):
    tok = _tok(tiny_tokenizer_dir)
    text = "hello thanks password"
    assert tok.char_to_token_index(text, text.index("password")) == 2


def test_forward_returns_span_outputs():
    import numpy as np
    m = _model()
    k0, v0 = m.backbone.empty_past()
    out = m(torch.zeros(1, 5, dtype=torch.long), torch.arange(5)[None], torch.zeros(1, 1, 5, 5), k0, v0)
    assert out[0].shape == (1, 5, 2) and out[1].shape == (1, 5, 64) and out[2].shape == (1, 5, 128)


def test_best_span_respects_order_and_length():
    import numpy as np
    from judge.model import best_span
    s = np.array([0., 5., 0., 0.]); e = np.array([3., 0., 0., 4.])
    assert best_span(s, e, max_len=3) == (1, 3)
    assert best_span(s, e, max_len=2) == (1, 1)  # end 3 is out of reach from start 1
