import argparse
import hashlib
from pathlib import Path

from judge.data.schema import Example, read_jsonl, write_jsonl

VAL_FRACTION = 0.02


def _is_val(message_id: str) -> bool:
    return int(hashlib.sha1(message_id.encode("utf-8")).hexdigest()[:8], 16) / 0xFFFFFFFF < VAL_FRACTION


def main(argv=None):
    ap = argparse.ArgumentParser(prog="judge.nli.stage1")
    ap.add_argument("--nli-dir", type=Path, required=True)
    ap.add_argument("--out", type=Path, required=True)
    a = ap.parse_args(argv)
    examples = [e for p in sorted(a.nli_dir.glob("*.jsonl")) for e in read_jsonl(p, Example)]
    write_jsonl(a.out / "train.jsonl", [e for e in examples if not _is_val(e.message_id)])
    write_jsonl(a.out / "val.jsonl", [e for e in examples if _is_val(e.message_id)])
    print(f"stage1: {len(examples)} examples")


if __name__ == "__main__":
    main()
