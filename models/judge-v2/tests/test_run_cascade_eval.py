from judge.data.schema import Example
from judge.evaluate.run_cascade_eval import evaluate


class AlwaysSecond:
    def judge(self, m, rules):
        return {"violated": True, "decided_by": "second_opinion", "latency_ms": 5, "pending": False,
                "rules": [{"rule_id": r["id"], "violated": True, "confidence": 0.9,
                           "span": {"start": 0, "end": 3, "text": m[:3]}} for r in rules]}


def test_cascade_eval_reports_routed_share_and_span_accuracy():
    ex = [Example("m", "abc def", "en", ("r",), ("x",), (1.0,), (True,), False, 0, ((0, 3),))]
    rep = evaluate(AlwaysSecond(), ex)
    assert rep["routed_share"] == 1.0 and rep["span_accuracy"] == 1.0 and rep["recall_overall"] == 1.0


class PendingAll:
    def judge(self, m, rules):
        return {"violated": False, "decided_by": "second_opinion", "latency_ms": 5, "pending": True,
                "rules": [{"rule_id": r["id"], "violated": None, "confidence": None, "span": None} for r in rules]}


def test_pending_counts_as_blocked_under_hold_and_passed_under_let_through():
    ex = [Example("m", "abc", "en", ("r1", "r2"), ("x", "y"), (1.0, 0.0), (True, False), False, None)]
    rep = evaluate(PendingAll(), ex)
    assert rep["hold"]["recall_overall"] == 1.0 and rep["hold"]["precision"] == 0.5
    assert rep["let_through"]["recall_overall"] == 0.0


def test_precision_first_gates_ignore_recall_and_routed_share():
    from judge.evaluate.run_cascade_eval import PRECISION_FIRST_GATES
    ex = [Example("m", "abc def", "en", ("r1", "r2"), ("x", "y"), (1.0, 1.0), (True, True), False, 0,
                  ((0, 3), (0, 3)))]

    class OneOfTwo(AlwaysSecond):
        def judge(self, m, rules):
            res = super().judge(m, rules)
            res["rules"][1].update(violated=False, span=None)
            return res

    rep = evaluate(OneOfTwo(), ex, gates=PRECISION_FIRST_GATES)
    assert rep["recall_overall"] == 0.5 and rep["routed_share"] == 1.0
    assert set(rep["gates"]) == {"precision", "span_accuracy"} and rep["pass"]


def test_policy_file_selects_confirm_or_bands(tmp_path):
    from judge.cascade import Bands, Confirm
    from judge.evaluate.run_cascade_eval import load_policy
    p = tmp_path / "policy.json"
    p.write_text('{"policy": "confirm", "fast_min": 0.69, "second_min": 0.55, "window_tokens": 150}')
    assert load_policy(p) == {"confirm": Confirm(0.69, 0.55), "window_tokens": 150}
    p.write_text('{"low": 0.1, "high": 0.9}')
    assert load_policy(p) == {"bands": Bands(0.1, 0.9)}
