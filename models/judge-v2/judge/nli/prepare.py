import argparse
import random
from pathlib import Path

from judge.data.schema import Example, stable_id, write_jsonl

SOURCES = {
    "mnli": ("nyu-mll/multi_nli", "train", "label"),
    "snli": ("stanfordnlp/snli", "train", "label"),
    "wanli": ("alisawuffles/WANLI", "train", "gold"),
}
_STRINGS = {"entailment": 1, "neutral": 0, "contradiction": 0}


def to_binary(label) -> int | None:
    if label is None:
        return None
    if isinstance(label, str):
        return _STRINGS.get(label)
    if label < 0 or label > 2:
        return None
    return 1 if label == 0 else 0


def to_example(source: str, premise: str, hypothesis: str, y: int, language: str = "en") -> Example:
    mid = stable_id("nli", source, language, premise, hypothesis)
    return Example(mid, premise, language, (stable_id("hyp", language, hypothesis),), (hypothesis,), (float(y),),
                   (False,), False, None)


def load_examples(source: str, limit: int, seed: int, load=None) -> list[Example]:
    if load is None:
        from datasets import load_dataset
        load = lambda name, split: load_dataset(name, split=split)
    name, split, field = SOURCES[source]
    ds = load(name, split)
    order = list(range(len(ds)))
    random.Random(seed).shuffle(order)
    out = []
    for i in order:
        row = ds[i]
        y = to_binary(row[field])
        if y is None or not row["premise"].strip() or not row["hypothesis"].strip():
            continue
        out.append(to_example(source, row["premise"], row["hypothesis"], y))
        if len(out) >= limit:
            break
    return out


def main(argv=None):
    ap = argparse.ArgumentParser(prog="judge.nli.prepare")
    ap.add_argument("--out", type=Path, required=True)
    ap.add_argument("--per-source", type=int, required=True)
    ap.add_argument("--seed", type=int, default=1234)
    a = ap.parse_args(argv)
    examples = [e for s in SOURCES for e in load_examples(s, a.per_source, a.seed)]
    write_jsonl(a.out / "en.jsonl", examples)
    print(f"wrote {len(examples)} English NLI examples")


if __name__ == "__main__":
    main()
