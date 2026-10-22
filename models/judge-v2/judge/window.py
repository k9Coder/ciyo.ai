"""Token windows for the second-opinion model.

The second opinion reads one rule plus about 400 tokens around the fast model's span, which keeps it under the
latency limits even for large pastes. Training uses the same kind of windows.
"""
import dataclasses
import random

from judge.tokenize import char_span_to_tokens


def token_window(n_tokens: int, center, size: int = 400) -> tuple[int, int]:
    """[a, b) of length min(size, n_tokens), centred on the (t0, t1) token span when given."""
    if n_tokens <= size:
        return 0, n_tokens
    if center is None:
        return 0, size
    mid = (center[0] + center[1]) // 2
    a = max(0, min(mid - size // 2, n_tokens - size))
    return a, a + size


def window_examples(examples, tok, size: int = 400, negatives_per_example: int = 1, seed: int = 0) -> list:
    """One single-rule example per window, cut on token boundaries, with spans re-based to the window.

    Rules with a span get a window around it; non-matching rules get random windows; matching rules without a
    span are kept only when the whole message fits in one window (otherwise the window might miss the match).
    """
    rng = random.Random(seed)
    out = []
    for ex in examples:
        offs = tok.message_offsets(ex.message)
        n = len(offs)
        k = 0
        for i, (rid, rule, target) in enumerate(zip(ex.rule_ids, ex.rules, ex.targets)):
            span = ex.spans[i] if ex.spans else None
            if span is not None:
                tt = char_span_to_tokens(offs, *span)
                if tt is None:
                    continue
                wins = [token_window(n, tt, size)]
            elif target < 0.5:
                wins = []
                for _ in range(negatives_per_example):
                    a = 0 if n <= size else rng.randrange(0, n - size + 1)
                    wins.append((a, min(n, a + size)))
            elif n <= size:
                wins = [(0, n)]
            else:
                continue
            for a, b in wins:
                if b <= a:
                    continue
                cs, ce = offs[a][0], offs[b - 1][1]
                new_span = None if span is None else ((span[0] - cs, span[1] - cs),)
                out.append(dataclasses.replace(
                    ex, message_id=f"{ex.message_id}#w{k}", message=ex.message[cs:ce], rule_ids=(rid,),
                    rules=(rule,), targets=(target,), critical=(ex.critical[i],),
                    violation_char_start=None if span is None else span[0] - cs, spans=new_span))
                k += 1
    return out
