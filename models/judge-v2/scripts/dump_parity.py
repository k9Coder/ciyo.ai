"""Dump Python reference outputs that the TypeScript scorer (packages/judge-v2) must reproduce.

For each model: 24 dev2 messages (8 en, 4 he, 4 zh, 2 ar, 2 with emoji, 4 longer than 600 chars), up to 3 rules each,
plus 2 long cases (~26k chars, built by joining dev2 messages) that exceed max_message_tokens and exercise the
multi-window path; their rules are those of the joined message placed mid-text (case 1) or last (case 2).
Offsets are converted from Python code-point indices to UTF-16 indices, which is what JS strings use.

Usage (from models/judge-v2):
  PYTHONPATH=. python scripts/dump_parity.py --artifacts artifacts --out ../../packages/judge-v2/tests/fixtures
"""
import argparse
import json
from pathlib import Path

from judge.data.schema import Example, read_jsonl
from judge.infer import OnnxJudge

QUOTA = [("en", 8), ("he", 4), ("zh", 4), ("ar", 2)]


def utf16(text: str, i: int) -> int:
    return len(text[:i].encode("utf-16-le")) // 2


def has_emoji(text: str) -> bool:
    return any(ord(c) > 0xFFFF for c in text)


def pick(examples: list[Example]) -> list[Example]:
    out, used = [], set()

    def take(pred, n):
        for e in examples:
            if n == 0:
                return
            if e.message_id not in used and pred(e) and len(e.message) <= 3000:
                out.append(e)
                used.add(e.message_id)
                n -= 1

    for lang, n in QUOTA:
        take(lambda e, lang=lang: e.language == lang and len(e.message) <= 600, n)
    take(lambda e: has_emoji(e.message), 2)
    take(lambda e: len(e.message) > 600, 4)
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--artifacts", type=Path, required=True)
    ap.add_argument("--examples", type=Path, default=Path("data/dev2/dev2.jsonl"))
    ap.add_argument("--out", type=Path, required=True)
    ap.add_argument("--long-examples", type=Path, default=Path("data/dev2/dev2_extra_long.jsonl"))
    a = ap.parse_args()
    chosen = pick(list(read_jsonl(a.examples, Example)))
    if len(chosen) < 20:
        raise SystemExit(f"only {len(chosen)} examples matched the quota")
    pool = list(read_jsonl(a.long_examples, Example))
    long_cases = []
    for target, start in (("mid", 0), ("last", 20)):
        parts, n = [], 0
        while n < 26_000:
            e = pool[(start + len(parts)) % len(pool)]
            parts.append(e)
            n += len(e.message) + 2
        key = parts[len(parts) // 2] if target == "mid" else parts[-1]
        long_cases.append(("\n\n".join(e.message for e in parts), list(key.rules)[:3]))
    a.out.mkdir(parents=True, exist_ok=True)
    for name in ("fast_v7", "so_v7"):
        judge = OnnxJudge(a.artifacts / name)
        cases = []
        for msg, rules in [(e.message, list(e.rules)[:3]) for e in chosen] + long_cases:
            offs = judge.tok.message_offsets(msg)
            res = judge.score_with_spans(msg, rules)
            cases.append({
                "message": msg,
                "rules": rules,
                "prefix_ids": judge.prefix,
                "message_ids": judge.tok.message_ids(msg),
                "offsets": [[utf16(msg, s), utf16(msg, t)] for s, t in offs],
                "rule_ids": [judge.tok.rule_ids(r) for r in rules],
                "results": [{"p": p, "span": None if span is None else [utf16(msg, span[0]), utf16(msg, span[1])]}
                            for p, span in res],
            })
        (a.out / f"parity_{name}.json").write_text(json.dumps(cases, ensure_ascii=False), encoding="utf-8")
        print(name, len(cases), "cases")


if __name__ == "__main__":
    main()
