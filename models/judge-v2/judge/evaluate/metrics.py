import math
from dataclasses import dataclass


@dataclass(frozen=True)
class Row:
    p: float
    label: int
    critical: bool
    adversarial: bool
    late_violation: bool | None
    language: str = ""


GATES = (("recall_critical", 0.95), ("recall_overall", 0.90), ("recall_late_violation", 0.90),
         ("recall_adversarial", 0.85), ("precision", 0.85))
LANG_GATE = 0.85
LANG_MIN_POSITIVES = 50


def recall(rows, thr: float) -> float:
    pos = [r for r in rows if r.label == 1]
    return sum(r.p >= thr for r in pos) / len(pos) if pos else float("nan")


def precision(rows, thr: float) -> float:
    flagged = [r for r in rows if r.p >= thr]
    return sum(r.label for r in flagged) / len(flagged) if flagged else float("nan")


def fbeta(rows, thr: float, beta: float = 2.0) -> float:
    p, r = precision(rows, thr), recall(rows, thr)
    if math.isnan(p) or math.isnan(r) or p + r == 0:
        return 0.0
    b2 = beta * beta
    return (1 + b2) * p * r / (b2 * p + r)


def _gate(value: float, bar: float) -> dict:
    return {"value": value, "bar": bar, "pass": (not math.isnan(value)) and value >= bar}


def gate_report(rows, thr: float, baseline_f2: float | None = None) -> dict:
    values = {
        "recall_critical": recall([r for r in rows if r.critical], thr),
        "recall_overall": recall(rows, thr),
        "recall_late_violation": recall([r for r in rows if r.late_violation], thr),
        "recall_adversarial": recall([r for r in rows if r.adversarial], thr),
        "precision": precision(rows, thr),
    }
    rep = {name: _gate(values[name], bar) for name, bar in GATES}
    for lang in sorted({r.language for r in rows}):
        lang_rows = [r for r in rows if r.language == lang]
        if sum(r.label for r in lang_rows) >= LANG_MIN_POSITIVES:
            rep[f"recall_lang_{lang}"] = _gate(recall(lang_rows, thr), LANG_GATE)
    if baseline_f2 is not None:
        rep["beats_baseline"] = _gate(fbeta(rows, thr), baseline_f2)
    gates = [k for k in rep if isinstance(rep[k], dict)]
    rep["threshold"] = thr
    rep["pass"] = all(rep[k]["pass"] for k in gates)
    return rep
