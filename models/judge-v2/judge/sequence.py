from dataclasses import dataclass

import numpy as np

NEG = -1e9


@dataclass(frozen=True)
class Step:
    input_ids: np.ndarray
    position_ids: np.ndarray
    attn_bias: np.ndarray
    verdict_index: tuple[int, ...]


def _lower_tri(n: int) -> np.ndarray:
    return np.triu(np.full((n, n), NEG, dtype=np.float32), k=1)


def causal_step(token_ids: list[int], past_len: int) -> Step:
    s = len(token_ids)
    if s == 0:
        raise ValueError("causal_step needs at least one token")
    bias = np.zeros((s, past_len + s), dtype=np.float32)
    bias[:, past_len:] = _lower_tri(s)
    return Step(np.asarray(token_ids, np.int64), np.arange(past_len, past_len + s, dtype=np.int64), bias, ())


def rules_step(rules: list[list[int]], past_len: int) -> Step:
    if not rules or any(len(r) == 0 for r in rules):
        raise ValueError("rules_step needs at least one non-empty rule")
    s = sum(len(r) for r in rules)
    bias = np.full((s, past_len + s), NEG, dtype=np.float32)
    bias[:, :past_len] = 0.0
    ids: list[int] = []
    pos: list[int] = []
    ends: list[int] = []
    off = 0
    for r in rules:
        n = len(r)
        bias[off:off + n, past_len + off:past_len + off + n] = _lower_tri(n)
        ids.extend(r)
        pos.extend(range(past_len, past_len + n))
        off += n
        ends.append(off - 1)
    return Step(np.asarray(ids, np.int64), np.asarray(pos, np.int64), bias, tuple(ends))


def single_pass(prefix: list[int], message: list[int], rules: list[list[int]]) -> Step:
    ctx = causal_step(prefix + message, 0)
    l0 = len(prefix) + len(message)
    rs = rules_step(rules, l0)
    s = l0 + len(rs.input_ids)
    bias = np.full((s, s), NEG, dtype=np.float32)
    bias[:l0, :l0] = ctx.attn_bias
    bias[l0:, :] = rs.attn_bias
    return Step(
        np.concatenate([ctx.input_ids, rs.input_ids]),
        np.concatenate([ctx.position_ids, rs.position_ids]),
        bias,
        tuple(l0 + i for i in rs.verdict_index),
    )


def chunk_spans(n: int, max_chunk: int) -> list[tuple[int, int]]:
    return [(a, min(a + max_chunk, n)) for a in range(0, n, max_chunk)]


def message_windows(n: int, max_len: int, overlap: int) -> list[tuple[int, int]]:
    if n <= max_len:
        return [(0, n)]
    stride = max_len - overlap
    starts = list(range(0, n - max_len, stride)) + [n - max_len]
    return [(a, a + max_len) for a in starts]
