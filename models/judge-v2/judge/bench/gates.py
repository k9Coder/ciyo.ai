import argparse
import json
import sys
from pathlib import Path

MAX_RSS_MB = 400
MAX_SIZE_MB = 140


def check(results: list[dict], model_size_mb: float) -> dict:
    rep = {"scenarios": {}}
    for r in results:
        for sc in r["scenarios"]:
            if sc["gate_ms"]:
                rep["scenarios"][sc["name"]] = {"ms": sc["ms"], "gate_ms": sc["gate_ms"], "pass": sc["ms"] <= sc["gate_ms"]}
    native = [r for r in results if r["platform"] == "native"]
    if native:
        rss = max(r["peak_rss_mb"] for r in native)
        rep["peak_rss_mb"] = {"value": rss, "bar": MAX_RSS_MB, "pass": rss <= MAX_RSS_MB}
    rep["size_mb"] = {"value": model_size_mb, "bar": MAX_SIZE_MB, "pass": model_size_mb <= MAX_SIZE_MB}
    rep["pass"] = (all(s["pass"] for s in rep["scenarios"].values()) and rep["size_mb"]["pass"]
                   and rep.get("peak_rss_mb", {"pass": True})["pass"])
    return rep


def main(argv=None):
    ap = argparse.ArgumentParser(prog="judge.bench.gates")
    ap.add_argument("--size-mb-of", type=Path, required=True)
    ap.add_argument("--json-out", type=Path)
    ap.add_argument("results", type=Path, nargs="+")
    a = ap.parse_args(argv)
    rep = check([json.loads(p.read_text(encoding="utf-8")) for p in a.results], a.size_mb_of.stat().st_size / 1e6)
    print(json.dumps(rep, indent=2))
    if a.json_out:
        a.json_out.write_text(json.dumps(rep, indent=2), encoding="utf-8")
    if not rep["pass"]:
        sys.exit(1)


if __name__ == "__main__":
    main()
