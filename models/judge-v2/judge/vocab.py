import argparse
import dataclasses
import json
import sys
from pathlib import Path
from typing import Iterable

import torch
from torch import nn

from judge.backbone import Backbone

LANGUAGE_CODES = ("en", "he", "es", "fr", "de", "pt", "ru", "ar", "zh", "it", "nl")
WORDS_PER_LANGUAGE = {"en": 20000}
DEFAULT_WORDS = 5000
PUNCT = ["-", "#", "@", ".", ",", ":", ";", "/", "_", "=", "+", "(", ")", "[", "]", "{", "}", "'", '"',
         "，", "。", "：", "、", "،", "؟"]
GATE = 0.001
REPO_ROOT = Path(__file__).resolve().parents[3]


def word_list(languages) -> list[str]:
    from wordfreq import top_n_list
    words: list[str] = []
    for lang in languages:
        words.extend(top_n_list(lang, WORDS_PER_LANGUAGE.get(lang, DEFAULT_WORDS)))
    return words


def _contexts(word: str) -> list[str]:
    cap = word[:1].upper() + word[1:]
    return [word, " " + word, "x-" + word, word + "-x", " " + word + "-x", cap, " " + cap, "-" + word]


def build_kept_ids(hf_tokenizer, texts: Iterable[str], words: Iterable[str]) -> set[int]:
    enc = lambda s: hf_tokenizer.encode(s, add_special_tokens=False)
    kept = set(hf_tokenizer.all_special_ids)
    for t in texts:
        kept.update(enc(t))
    for w in words:
        for c in _contexts(w):
            kept.update(enc(c))
    for i in range(1000):
        for c in (str(i), " " + str(i), "-" + str(i), str(i) + "-"):
            kept.update(enc(c))
    for p in PUNCT:
        kept.update(enc(p))
        kept.update(enc(" " + p))
    return kept


def make_remap(kept: set[int], fallback_old_id: int) -> tuple[dict[int, int], int]:
    if fallback_old_id not in kept:
        raise ValueError("fallback token must be in the kept set")
    remap = {old: new for new, old in enumerate(sorted(kept))}
    return remap, remap[fallback_old_id]


def prune_embeddings(backbone: Backbone, remap: dict[int, int]) -> None:
    old_ids = sorted(remap, key=remap.get)
    old = backbone.embed_tokens.weight.detach()
    emb = nn.Embedding(len(old_ids), old.shape[1])
    with torch.no_grad():
        emb.weight.copy_(old[torch.tensor(old_ids)])
    backbone.embed_tokens = emb
    backbone.spec = dataclasses.replace(backbone.spec, vocab_size=len(old_ids))


def unknown_rate(hf_tokenizer, remap: dict[int, int], texts: Iterable[str]) -> float:
    total = missing = 0
    for t in texts:
        ids = hf_tokenizer.encode(t, add_special_tokens=False)
        total += len(ids)
        missing += sum(1 for i in ids if i not in remap)
    return missing / total if total else 0.0


def unknown_rate_by_language(hf_tokenizer, remap: dict[int, int], texts_by_language: dict) -> dict[str, float]:
    return {lang: unknown_rate(hf_tokenizer, remap, texts) for lang, texts in sorted(texts_by_language.items())}


def save_remap(path: Path, remap: dict[int, int], fallback_new_id: int) -> None:
    data = {"old_to_new": {str(k): v for k, v in remap.items()}, "fallback_new_id": fallback_new_id}
    path.write_text(json.dumps(data), encoding="utf-8")


def _code_corpus(limit_chars: int = 3_000_000) -> list[str]:
    texts, total = [], 0
    for pattern in ("packages/**/*.ts", "backend/src/**/*.ts", "pretzel/src/**/*.ts", "models/**/*.py"):
        for p in sorted(REPO_ROOT.glob(pattern)):
            if "node_modules" in p.parts:
                continue
            t = p.read_text(encoding="utf-8", errors="ignore")
            texts.append(t)
            total += len(t)
            if total > limit_chars:
                return texts
    return texts


def main(argv=None):
    from transformers import AutoTokenizer
    from judge.config import INSTRUCTIONS, RULE_PREFIX, VERDICT_SUFFIX
    from judge.data.schema import Example, read_jsonl
    ap = argparse.ArgumentParser(prog="judge.vocab")
    ap.add_argument("--tokenizer", required=True)
    ap.add_argument("--build", type=Path, nargs="+", required=True)
    ap.add_argument("--gate", type=Path, required=True)
    ap.add_argument("--out", type=Path, required=True)
    a = ap.parse_args(argv)
    hf = AutoTokenizer.from_pretrained(a.tokenizer)
    build = [e for p in a.build for e in read_jsonl(p, Example)]
    texts = [e.message for e in build] + [r for e in build for r in e.rules]
    texts += [INSTRUCTIONS, RULE_PREFIX, VERDICT_SUFFIX] + _code_corpus()
    fallback = hf.unk_token_id if hf.unk_token_id is not None else hf.all_special_ids[0]
    remap, fb = make_remap(build_kept_ids(hf, texts, word_list(LANGUAGE_CODES)), fallback)
    by_lang: dict[str, list[str]] = {}
    for e in read_jsonl(a.gate, Example):
        by_lang.setdefault(e.language, []).extend([e.message, *e.rules])
    rates = unknown_rate_by_language(hf, remap, by_lang)
    a.out.mkdir(parents=True, exist_ok=True)
    save_remap(a.out / "vocab_remap.json", remap, fb)
    report = {"vocab_size": len(remap), "unknown_rate": rates, "gate": GATE,
              "pass": all(r <= GATE for r in rates.values())}
    (a.out / "vocab_report.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report, indent=2))
    if not report["pass"]:
        sys.exit(1)


if __name__ == "__main__":
    main()
