import numpy as np


def choose_bands(fast_scores, second_scores, labels, critical, min_recall: float = 0.90,
                 min_crit_recall: float = 0.95, max_routed: float = 0.15):
    """Pick (low, high) maximising system precision under the recall gates and the routed-share limit.

    Fast scores at or above `high` block, below `low` pass; the second model (calibrated, threshold 0.5)
    decides everything in between. Ties prefer fewer routed rules. Returns None if no pair qualifies.
    """
    f, s = np.asarray(fast_scores, float), np.asarray(second_scores, float)
    y, c = np.asarray(labels, int), np.asarray(critical, bool)
    grid = np.round(np.arange(0.0, 1.0001, 0.01), 2)
    best = None
    for low in grid:
        for high in grid[grid > low]:
            band = (f >= low) & (f < high)
            routed = band.mean()
            if routed > max_routed:
                continue
            pred = np.where(band, s >= 0.5, f >= high)
            tp = int((pred & (y == 1)).sum())
            pos, flagged = int((y == 1).sum()), int(pred.sum())
            rec = tp / pos if pos else 1.0
            crit_pos = int(((y == 1) & c).sum())
            crit_rec = int((pred & (y == 1) & c).sum()) / crit_pos if crit_pos else 1.0
            if rec < min_recall or crit_rec < min_crit_recall:
                continue
            prec = tp / flagged if flagged else 1.0
            key = (prec, -routed)
            if best is None or key > best[0]:
                best = (key, {"low": float(low), "high": float(high), "precision": prec, "recall": rec,
                              "crit_recall": crit_rec, "routed": float(routed)})
    return None if best is None else best[1]
