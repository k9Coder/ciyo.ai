import numpy as np

from judge.evaluate.metrics import fbeta, precision, recall


def frontier(rows, min_recall: float = 0.90, min_crit_recall: float = 0.95) -> dict:
    """Best precision reachable while meeting the recall gates, plus the best F2 over a threshold grid."""
    crit = [r for r in rows if r.critical]
    best_p, best_t = 0.0, None
    for t in sorted({r.p for r in rows}):
        if recall(rows, t) >= min_recall and (not crit or recall(crit, t) >= min_crit_recall):
            p = precision(rows, t)
            if p > best_p:
                best_p, best_t = p, t
    f2, f2_t = max((fbeta(rows, t), t) for t in np.linspace(0.01, 0.99, 99))
    return {"best_precision": best_p, "threshold": best_t, "max_f2": f2, "f2_threshold": float(f2_t)}
