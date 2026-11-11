from judge.evaluate.frontier import frontier
from judge.evaluate.metrics import Row


def test_frontier_finds_best_precision_meeting_recall():
    rows = [Row(0.9, 1, True, False, None), Row(0.8, 1, False, False, None), Row(0.7, 0, False, False, None),
            Row(0.6, 1, True, False, None), Row(0.2, 0, False, False, None)]
    f = frontier(rows, min_recall=0.9, min_crit_recall=0.95)
    assert f["threshold"] == 0.6 and abs(f["best_precision"] - 0.75) < 1e-9
