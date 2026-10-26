import time

from judge.cascade import Bands, Cascade, to_utf16


class Fake:
    def __init__(self, out):
        self.out = out

    def score_with_spans(self, message, rules):
        return [self.out[r] for r in rules]


RULES = [{"id": "a", "text": "A"}, {"id": "b", "text": "B"}, {"id": "c", "text": "C"}]


def test_routes_by_band_and_rebases_second_span():
    fast = Fake({"A": (0.02, None), "B": (0.97, (4, 8)), "C": (0.5, (10, 14))})
    second = Fake({"C": (0.96, (0, 4))})
    r = Cascade(fast, second, Bands(0.1, 0.9), window_tokens=400).judge("x" * 20, RULES)
    by = {x["rule_id"]: x for x in r["rules"]}
    assert by["a"]["violated"] is False and by["b"]["violated"] is True and by["c"]["violated"] is True
    assert r["decided_by"] == "second_opinion" and r["violated"] is True and r["pending"] is False
    assert by["b"]["span"]["start"] == 4
    assert by["c"]["span"]["start"] == 0 and by["c"]["span"]["end"] == 4


def test_second_span_is_rebased_to_the_full_message():
    msg = "a" * 5000 + "SECRET" + "b" * 5000
    s = msg.index("SECRET")
    fast = Fake({"A": (0.5, (s, s + 6))})
    seen = {}

    class Second:
        def score_with_spans(self, window, rules):
            seen["window"] = window
            i = window.index("SECRET")
            return [(0.99, (i, i + 6))]

    r = Cascade(fast, Second(), Bands(0.1, 0.9), window_tokens=400).judge(msg, RULES[:1])
    span = r["rules"][0]["span"]
    assert len(seen["window"]) < len(msg) and span["text"] == "SECRET"


def test_missing_second_opinion_marks_pending_not_false():
    fast = Fake({"A": (0.02, None), "B": (0.5, None), "C": (0.03, None)})
    r = Cascade(fast, None).judge("hello", RULES)
    by = {x["rule_id"]: x for x in r["rules"]}
    assert by["b"]["violated"] is None and r["pending"] is True and r["violated"] is False


def test_slow_second_opinion_times_out():
    class Slow(Fake):
        def score_with_spans(self, m, rules):
            time.sleep(0.3)
            return super().score_with_spans(m, rules)

    fast = Fake({"A": (0.5, None), "B": (0.02, None), "C": (0.02, None)})
    r = Cascade(fast, Slow({"A": (0.99, None)}), second_timeout_s=0.1).judge("hello", RULES)
    assert r["pending"] is True and r["rules"][0]["violated"] is None


def test_violated_rule_may_have_null_span():
    fast = Fake({"A": (0.97, None), "B": (0.02, None), "C": (0.02, None)})
    r = Cascade(fast, None).judge("hello", RULES)
    assert r["rules"][0]["violated"] is True and r["rules"][0]["span"] is None


def test_empty_message_or_no_rules_makes_no_calls():
    class Boom:
        def score_with_spans(self, m, r):
            raise AssertionError("called")

    assert Cascade(Boom(), Boom()).judge("", RULES)["violated"] is False
    assert Cascade(Boom(), Boom()).judge("hi", [])["rules"] == []


def test_to_utf16_counts_surrogate_pairs():
    assert to_utf16("🙂a", 1) == 2 and to_utf16("ab", 2) == 2


def test_contract_spans_use_utf16_offsets():
    msg = "🙂 key ABC"
    s = msg.index("ABC")
    fast = Fake({"A": (0.97, (s, s + 3))})
    r = Cascade(fast, None).judge(msg, RULES[:1])
    span = r["rules"][0]["span"]
    assert (span["start"], span["end"], span["text"]) == (s + 1, s + 4, "ABC")


def test_confirm_policy_blocks_only_when_both_models_agree():
    from judge.cascade import Confirm
    fast = Fake({"A": (0.95, (0, 3)), "B": (0.95, (0, 3)), "C": (0.4, None)})
    second = Fake({"A": (0.97, (0, 3)), "B": (0.2, None)})
    r = Cascade(fast, second, confirm=Confirm(fast_min=0.7, second_min=0.7)).judge("abc def", RULES)
    by = {x["rule_id"]: x for x in r["rules"]}
    assert by["a"]["violated"] is True and by["a"]["span"]["text"] == "abc"
    assert by["b"]["violated"] is False and by["c"]["violated"] is False
    assert r["violated"] is True and r["pending"] is False and r["decided_by"] == "second_opinion"


def test_confirm_policy_without_second_model_is_pending():
    from judge.cascade import Confirm
    fast = Fake({"A": (0.95, None), "B": (0.1, None), "C": (0.1, None)})
    r = Cascade(fast, None, confirm=Confirm(0.7, 0.7)).judge("abc", RULES)
    assert r["rules"][0]["violated"] is None and r["pending"] is True and r["violated"] is False


def test_confirm_policy_makes_no_second_call_when_nothing_is_flagged():
    from judge.cascade import Confirm

    class Boom:
        def score_with_spans(self, m, r):
            raise AssertionError("called")

    fast = Fake({"A": (0.1, None), "B": (0.2, None), "C": (0.3, None)})
    r = Cascade(fast, Boom(), confirm=Confirm(0.7, 0.7)).judge("abc", RULES)
    assert r["violated"] is False and r["decided_by"] == "fast"


from judge.cascade import Confirm


class Spy:
    def __init__(self, hit):
        self.hit, self.calls = hit, []

    def score_with_spans(self, message, rules):
        self.calls.append(message)
        return [(0.99, (message.index(self.hit), message.index(self.hit) + 3)) if self.hit in message else (0.01, None)]


def test_second_window_far_from_fast_span_can_confirm():
    msg = "a" * 2000 + "LEAK" + "b" * 2000
    fast = Fake({"A": (0.95, (10, 20))})
    spy = Spy("LEAK")
    r = Cascade(fast, spy, window_tokens=150, confirm=Confirm(0.7, 0.7), max_windows=8).judge(msg, [RULES[0]])
    assert r["rules"][0]["violated"] is True and len(spy.calls) >= 2
    s = r["rules"][0]["span"]
    assert msg[s["start"]:s["end"]] == "LEA"


def test_windows_stop_at_first_confirm_and_cap_at_max():
    msg = "LEAK" + "x" * 5000
    spy = Spy("LEAK")
    Cascade(Fake({"A": (0.95, (0, 4))}), spy, window_tokens=150, confirm=Confirm(0.7, 0.7), max_windows=3).judge(msg, [RULES[0]])
    assert len(spy.calls) == 1
    spy2 = Spy("NOPE")
    Cascade(Fake({"A": (0.95, (0, 4))}), spy2, window_tokens=150, confirm=Confirm(0.7, 0.7), max_windows=3).judge(msg, [RULES[0]])
    assert len(spy2.calls) == 3


def test_timeout_in_any_window_before_a_confirm_is_pending():
    class SlowSecond:
        n = 0

        def score_with_spans(self, message, rules):
            SlowSecond.n += 1
            if SlowSecond.n == 2:
                time.sleep(0.3)
            return [(0.01, None)]

    msg = "x" * 5000
    r = Cascade(Fake({"A": (0.95, (0, 4))}), SlowSecond(), window_tokens=150, second_timeout_s=0.1,
                confirm=Confirm(0.7, 0.7), max_windows=3).judge(msg, [RULES[0]])
    assert r["pending"] is True and r["rules"][0]["violated"] is None
