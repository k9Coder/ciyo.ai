import math

import numpy as np
import pytest

from judge.evaluate.metrics import Row, fbeta, gate_report, precision, recall
from judge.train.calibrate import choose_threshold, fit_temperature


def _rows():
    return [Row(0.9, 1, True, False, True, "en"), Row(0.4, 1, False, True, None, "en"), Row(0.7, 0, False, False, None, "en"),
            Row(0.1, 0, True, False, None, "en"), Row(0.8, 1, True, True, False, "en")]


def test_recall_precision_fbeta():
    rows = _rows()
    assert recall(rows, 0.5) == pytest.approx(2 / 3) and precision(rows, 0.5) == pytest.approx(2 / 3)
    assert fbeta(rows, 0.5, 2.0) == pytest.approx(2 / 3)
    assert math.isnan(recall([Row(0.9, 0, False, False, None)], 0.5))


def test_gate_report_languages_baseline_and_empty_subsets():
    rows = [Row(0.9, 1, True, True, True, "he") for _ in range(60)] + [Row(0.1, 0, False, False, None, "he")]
    rows += [Row(0.9 if i < 40 else 0.2, 1, True, True, True, "zh") for i in range(55)]
    rows += [Row(0.9, 1, True, True, True, "it") for _ in range(10)]
    rep = gate_report(rows, 0.5, baseline_f2=0.5)
    assert rep["recall_lang_he"]["pass"] and not rep["recall_lang_zh"]["pass"]
    assert "recall_lang_it" not in rep and rep["beats_baseline"]["bar"] == 0.5 and not rep["pass"]
    only_he = [r for r in rows if r.language == "he"]
    assert gate_report(only_he, 0.5, baseline_f2=0.5)["pass"]
    assert not gate_report(only_he, 0.5, baseline_f2=1.01)["pass"]
    assert not gate_report([Row(0.9, 1, False, False, None, "en")], 0.5)["pass"]


def test_fit_temperature_recovers_scale():
    rng = np.random.default_rng(0)
    z = rng.normal(0, 3, size=4000)
    logits = np.stack([np.zeros_like(z), z], 1)
    assert fit_temperature(logits, 1 / (1 + np.exp(-z / 2.0))) == pytest.approx(2.0, rel=0.05)


def test_choose_threshold_meets_recall_and_is_maximal():
    rows = [Row(p, 1, c, False, None) for p, c in [(0.9, True), (0.8, True), (0.3, False), (0.2, True)]]
    rows += [Row(0.6, 0, False, False, None), Row(0.1, 0, False, False, None)]
    thr = choose_threshold(rows, min_recall_critical=0.95, min_recall_overall=0.75)
    assert thr == pytest.approx(0.2) and recall([r for r in rows if r.critical], thr) >= 0.95
