"""Whole-system evaluation of the cascade against the Judge v2.1 gates.

A pending rule (second opinion unavailable) counts as blocked under the default company setting (Hold) and as
passed under "Let through and flag"; both views are reported and the gates use Hold.
"""
import argparse
import json
import sys
import time
from pathlib import Path

from judge.cascade import Bands, Cascade, Confirm, to_utf16
from judge.data.schema import Example, read_jsonl
from judge.evaluate.metrics import Row, precision, recall

GATES = {"recall_overall": 0.90, "recall_critical": 0.95, "recall_adversarial": 0.85,
         "recall_late_violation": 0.90, "precision": 0.95, "span_accuracy": 0.90}
MAX_ROUTED = 0.15
LANG_GATE, LANG_MIN_POSITIVES = 0.85, 50
# Owner decision 2026-10-23: blocks must be real leaks; leaks caught is reported, not gated.
PRECISION_FIRST_GATES = {"precision": 0.99, "span_accuracy": 0.90}


def load_policy(path: Path) -> dict:
    """Cascade keyword arguments from a policy file: confirm thresholds, or the older low/high bands."""
    d = json.loads(path.read_text(encoding="utf-8"))
    if d.get("policy") == "confirm":
        out = {"confirm": Confirm(d["fast_min"], d["second_min"], d.get("warn_fast_min"), d.get("warn_second_min"))}
        if "window_tokens" in d:
            out["window_tokens"] = d["window_tokens"]
        if "max_windows" in d:
            out["max_windows"] = d["max_windows"]
        return out
    return {"bands": Bands(d["low"], d["high"])}


def _view(rows) -> dict:
    out = {"recall_overall": recall(rows, 0.5), "precision": precision(rows, 0.5),
           "recall_critical": recall([r for r in rows if r.critical], 0.5),
           "recall_adversarial": recall([r for r in rows if r.adversarial], 0.5),
           "recall_late_violation": recall([r for r in rows if r.late_violation], 0.5)}
    for lang in sorted({r.language for r in rows}):
        lr = [r for r in rows if r.language == lang]
        if sum(r.label for r in lr) >= LANG_MIN_POSITIVES:
            out[f"recall_lang_{lang}"] = recall(lr, 0.5)
    return out


def evaluate(cascade, examples, tok=None, gates=None) -> dict:
    precision_first = gates is not None
    hold, let, tiers, routed, span_hits, span_total = [], [], [], 0, 0, 0
    for ex in examples:
        res = cascade.judge(ex.message, [{"id": f"r{i}", "text": t} for i, t in enumerate(ex.rules)])
        routed += res["decided_by"] == "second_opinion"
        late = None
        if ex.violation_char_start is not None and tok is not None:
            late = tok.char_to_token_index(ex.message, ex.violation_char_start) >= 500
        for i, (target, crit) in enumerate(zip(ex.targets, ex.critical)):
            e = res["rules"][i]
            label = int(target >= 0.5)
            row_late = late if label == 1 else None
            for rows, pending_blocks in ((hold, True), (let, False)):
                v = pending_blocks if e["violated"] is None else e["violated"]
                rows.append(Row(1.0 if v else 0.0, label, crit, ex.adversarial, row_late, ex.language))
            # Block or warn (pending held): what the user is stopped or warned on.
            bw = e["violated"] is None or e["violated"] or e.get("warn", False)
            tiers.append(Row(1.0 if bw else 0.0, label, crit, ex.adversarial, row_late, ex.language))
            true_span = ex.spans[i] if ex.spans else None
            if label == 1 and e["violated"] and true_span is not None and e["span"] is not None:
                span_total += 1
                ts, te = to_utf16(ex.message, true_span[0]), to_utf16(ex.message, true_span[1])
                span_hits += e["span"]["start"] < te and e["span"]["end"] > ts
    rep = {**_view(hold), "hold": _view(hold), "let_through": _view(let), "block_or_warn": _view(tiers),
           "routed_share": routed / len(examples) if examples else 0.0,
           "span_accuracy": span_hits / span_total if span_total else float("nan")}
    gates = {k: {"value": rep[k], "bar": bar, "pass": rep[k] >= bar} for k, bar in (gates or GATES).items()}
    if not precision_first:
        gates["routed_share"] = {"value": rep["routed_share"], "bar": MAX_ROUTED,
                                 "pass": rep["routed_share"] <= MAX_ROUTED}
        for k, v in rep["hold"].items():
            if k.startswith("recall_lang_"):
                gates[k] = {"value": v, "bar": LANG_GATE, "pass": v >= LANG_GATE}
    rep["gates"] = gates
    rep["pass"] = all(g["pass"] for g in gates.values())
    return rep


def main(argv=None):
    from judge.infer import OnnxJudge
    ap = argparse.ArgumentParser(prog="judge.evaluate.run_cascade_eval")
    ap.add_argument("--fast", type=Path, required=True)
    ap.add_argument("--second", type=Path)
    ap.add_argument("--bands", type=Path, help="policy file: confirm thresholds or low/high bands")
    ap.add_argument("--policy", type=Path, help="alias of --bands")
    ap.add_argument("--examples", type=Path, required=True)
    ap.add_argument("--out", type=Path, required=True)
    ap.add_argument("--log", type=Path, required=True)
    a = ap.parse_args(argv)
    policy_path = a.policy or a.bands
    if policy_path is None:
        ap.error("--policy (or --bands) is required")
    kw = load_policy(policy_path)
    b = json.loads(policy_path.read_text(encoding="utf-8"))
    fast = OnnxJudge(a.fast)
    second = OnnxJudge(a.second) if a.second else None
    cascade = Cascade(fast, second, second_timeout_s=60, **kw)
    gates = PRECISION_FIRST_GATES if "confirm" in kw else None
    rep = evaluate(cascade, read_jsonl(a.examples, Example), fast.tok, gates=gates)
    a.out.write_text(json.dumps(rep, indent=2), encoding="utf-8")
    with a.log.open("a", encoding="utf-8") as f:
        f.write(json.dumps({"ts": time.time(), "kind": "cascade", "fast": str(a.fast), "second": str(a.second),
                            "bands": b, "pass": rep["pass"], "gates": rep["gates"]}) + "\n")
    print(json.dumps(rep["gates"], indent=2))
    if not rep["pass"]:
        sys.exit(1)


if __name__ == "__main__":
    main()
