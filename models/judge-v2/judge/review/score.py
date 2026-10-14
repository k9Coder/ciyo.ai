import argparse
import json
import sys
from pathlib import Path

from judge.review.make_page import make_items

GATE = 0.97


def agreement(items: list[dict], results: dict) -> tuple[float, int, list[str]]:
    decided = [it for it in items if results.get(it["pair_id"]) in ("match", "no_match") and it["teacher"]]
    bad = [it["pair_id"] for it in decided if results[it["pair_id"]] != it["teacher"]]
    rate = 1 - len(bad) / len(decided) if decided else float("nan")
    return rate, len(decided), bad


def main(argv=None):
    ap = argparse.ArgumentParser(prog="judge.review.score")
    ap.add_argument("--data", type=Path, required=True)
    ap.add_argument("--results", type=Path, required=True)
    ap.add_argument("--mode", choices=["sample", "queue"], required=True)
    ap.add_argument("--n", type=int, default=400)
    ap.add_argument("--seed", type=int, default=1)
    a = ap.parse_args(argv)
    results = json.loads(a.results.read_text(encoding="utf-8"))
    if a.mode == "queue":
        path = a.data / "human_labels.json"
        human = json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}
        human.update({pid: 1.0 if v == "match" else 0.0 for pid, v in results.items() if v in ("match", "no_match")})
        path.write_text(json.dumps(human, indent=1, sort_keys=True), encoding="utf-8")
        print(f"human labels: {len(human)}")
        return
    rate, n, bad = agreement(make_items(a.data, "sample", a.n, a.seed), results)
    print(f"teacher-vs-human agreement: {rate:.4f} over {n} decided items (gate {GATE})")
    for pid in bad:
        print(f"  disagree: {pid}")
    if not rate >= GATE:
        sys.exit(1)


if __name__ == "__main__":
    main()
