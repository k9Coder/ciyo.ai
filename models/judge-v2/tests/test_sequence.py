import numpy as np
import pytest

from judge.sequence import NEG, causal_step, chunk_spans, message_windows, rules_step, single_pass


def test_causal_step_sees_past_and_earlier_tokens_only():
    st = causal_step([5, 6, 7], past_len=2)
    assert st.input_ids.tolist() == [5, 6, 7]
    assert st.position_ids.tolist() == [2, 3, 4]
    assert st.attn_bias.shape == (3, 5)
    assert (st.attn_bias[:, :2] == 0).all()
    assert st.attn_bias[0, 3] == NEG and st.attn_bias[0, 2] == 0
    assert st.attn_bias[2, 4] == 0
    assert st.verdict_index == ()


def test_rules_step_blocks_are_isolated():
    st = rules_step([[1, 2], [3, 4, 5]], past_len=10)
    assert st.input_ids.tolist() == [1, 2, 3, 4, 5]
    assert st.position_ids.tolist() == [10, 11, 10, 11, 12]
    assert st.verdict_index == (1, 4)
    b = st.attn_bias
    assert b.shape == (5, 15)
    assert (b[:, :10] == 0).all()
    assert b[1, 10] == 0 and b[1, 11] == 0
    assert (b[2:, 10:12] == NEG).all()
    assert (b[:2, 12:] == NEG).all()
    assert b[2, 13] == NEG and b[4, 12] == 0


def test_single_pass_matches_cached_layout():
    prefix, msg, rules = [9, 9], [1, 2, 3], [[4, 5], [6]]
    st = single_pass(prefix, msg, rules)
    l0 = len(prefix) + len(msg)
    assert st.input_ids.tolist() == prefix + msg + [4, 5, 6]
    assert st.position_ids.tolist() == [0, 1, 2, 3, 4, 5, 6, 5]
    assert st.verdict_index == (l0 + 1, l0 + 2)
    rs = rules_step(rules, l0)
    np.testing.assert_array_equal(st.attn_bias[l0:], rs.attn_bias)
    np.testing.assert_array_equal(st.attn_bias[:l0, :l0], causal_step(prefix + msg, 0).attn_bias)
    assert (st.attn_bias[:l0, l0:] == NEG).all()


def test_empty_inputs_raise():
    with pytest.raises(ValueError):
        causal_step([], 0)
    with pytest.raises(ValueError):
        rules_step([], 3)
    with pytest.raises(ValueError):
        rules_step([[1], []], 3)


def test_chunk_spans_cover_exactly():
    assert chunk_spans(0, 500) == []
    assert chunk_spans(1200, 500) == [(0, 500), (500, 1000), (1000, 1200)]
    assert chunk_spans(500, 500) == [(0, 500)]


def test_message_windows_short_message_is_one_window():
    assert message_windows(100, 4096, 256) == [(0, 100)]
    assert message_windows(0, 4096, 256) == [(0, 0)]


def test_message_windows_cover_every_short_span():
    n, max_len, overlap = 1000, 300, 50
    wins = message_windows(n, max_len, overlap)
    assert wins[0][0] == 0 and wins[-1][1] == n
    assert all(b - a <= max_len for a, b in wins)
    for start in range(n - overlap):
        span = (start, start + overlap)
        assert any(a <= span[0] and span[1] <= b for a, b in wins), span
