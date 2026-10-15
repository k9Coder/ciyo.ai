import argparse
import copy
import dataclasses
import json
import re
import sys
from collections import Counter
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


BYTE_TOKEN = re.compile(r"<0x[0-9A-F]{2}>")


def _split_merge(m) -> tuple[str, str]:
    return tuple(m) if isinstance(m, list) else tuple(m.split(" ", 1))


def _remap_ids(node, new_id: dict) -> None:
    if isinstance(node, dict):
        for key, value in node.items():
            if key == "ids" and isinstance(value, list) and all(isinstance(i, int) for i in value):
                node[key] = [new_id[i] for i in value if i in new_id]
            else:
                _remap_ids(value, new_id)
    elif isinstance(node, list):
        for value in node:
            _remap_ids(value, new_id)


def prune_tokenizer_json(tj: dict, kept: set[int]) -> tuple[dict, list[int]]:
    """Shrink a byte-fallback BPE tokenizer to `kept` plus everything its merges need.

    Every token a kept token can be built from is kept too (closure over all producing merges), and
    byte tokens and special tokens are always kept, so the pruned tokenizer can still encode any
    text, with no unknown tokens. Returns (new tokenizer json, old id of each new id).
    """
    model = tj["model"]
    vocab = model["vocab"]
    id2tok = {i: t for t, i in vocab.items()}
    keep = {id2tok[i] for i in kept if i in id2tok}
    keep |= {t for t in vocab if BYTE_TOKEN.fullmatch(t)}
    keep |= {a["content"] for a in tj.get("added_tokens", []) if a.get("special") and a["content"] in vocab}
    if model.get("unk_token"):
        keep.add(model["unk_token"])
    merges = [_split_merge(m) for m in model.get("merges", [])]
    producers: dict[str, list[tuple[str, str]]] = {}
    for a, b in merges:
        producers.setdefault(a + b, []).append((a, b))
    stack = list(keep)
    while stack:
        token = stack.pop()
        for pair in producers.get(token, ()):
            for part in pair:
                if part in vocab and part not in keep:
                    keep.add(part)
                    stack.append(part)
    old_ids = sorted(vocab[t] for t in keep if t in vocab)
    new_id = {old: new for new, old in enumerate(old_ids)}
    out = copy.deepcopy(tj)
    out["model"]["vocab"] = {id2tok[o]: new_id[o] for o in old_ids}
    if "merges" in model:
        as_lists = bool(model["merges"]) and isinstance(model["merges"][0], list)
        kept_merges = [(a, b) for a, b in merges if a in keep and b in keep and a + b in keep]
        out["model"]["merges"] = [[a, b] for a, b in kept_merges] if as_lists else [f"{a} {b}" for a, b in kept_merges]
    out["added_tokens"] = [dict(a, id=new_id[a["id"]]) for a in tj.get("added_tokens", []) if a["id"] in new_id]
    if out.get("post_processor") is not None:
        _remap_ids(out["post_processor"], new_id)
    return out, old_ids


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


def select_by_frequency(hf_tokenizer, texts: Iterable[str], words: Iterable[str], max_tokens: int,
                        include_symbols: bool = True) -> set[int]:
    enc = lambda s: hf_tokenizer.encode(s, add_special_tokens=False)
    counts: Counter = Counter()
    for t in texts:
        counts.update(enc(t))
    for w in words:
        for c in _contexts(w):
            counts.update(enc(c))
    if include_symbols:
        for i in range(1000):
            for c in (str(i), " " + str(i), "-" + str(i), str(i) + "-"):
                counts.update(enc(c))
        for p in PUNCT + ["\t", "\n", "\r\n"]:
            counts.update(enc(p))
            counts.update(enc(" " + p))
    specials = set(hf_tokenizer.all_special_ids)
    ranked = [i for i, _ in counts.most_common() if i not in specials]
    return set(ranked[:max_tokens]) | specials


def save_pruned_tokenizer(hf_tokenizer, kept: set[int], out_dir: Path) -> list[int]:
    from transformers import PreTrainedTokenizerFast
    pruned, old_ids = prune_tokenizer_json(json.loads(hf_tokenizer.backend_tokenizer.to_str()), kept)
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "tokenizer.json").write_text(json.dumps(pruned, ensure_ascii=False), encoding="utf-8")
    specials = {k: getattr(hf_tokenizer, k) for k in ("bos_token", "eos_token", "unk_token", "pad_token")
                if getattr(hf_tokenizer, k, None)}
    PreTrainedTokenizerFast(tokenizer_file=str(out_dir / "tokenizer.json"), **specials).save_pretrained(out_dir)
    (out_dir / "old_ids.json").write_text(json.dumps(old_ids), encoding="utf-8")
    return old_ids


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
    ap.add_argument("--max-tokens", type=int, default=48000)
    a = ap.parse_args(argv)
    hf = AutoTokenizer.from_pretrained(a.tokenizer)
    build = [e for p in a.build for e in read_jsonl(p, Example)]
    texts = [e.message for e in build] + [r for e in build for r in e.rules]
    texts += [INSTRUCTIONS, RULE_PREFIX, VERDICT_SUFFIX] + _code_corpus()
    kept = select_by_frequency(hf, texts, word_list(LANGUAGE_CODES), a.max_tokens)
    save_pruned_tokenizer(hf, kept, a.out)
    pruned = AutoTokenizer.from_pretrained(a.out)
    by_lang: dict[str, list[str]] = {}
    for e in read_jsonl(a.gate, Example):
        by_lang.setdefault(e.language, []).extend([e.message, *e.rules])
    rates, inflation = {}, {}
    for lang, lang_texts in sorted(by_lang.items()):
        full_n = pruned_n = unk = 0
        for t in lang_texts:
            ids = pruned.encode(t, add_special_tokens=False)
            pruned_n += len(ids)
            unk += sum(1 for i in ids if i == pruned.unk_token_id)
            full_n += len(hf.encode(t, add_special_tokens=False))
        rates[lang] = unk / pruned_n if pruned_n else 0.0
        inflation[lang] = pruned_n / full_n if full_n else 1.0
    report = {"vocab_size": len(pruned), "unknown_rate": rates, "token_inflation": inflation, "gate": GATE,
              "pass": all(r <= GATE for r in rates.values())}
    (a.out / "vocab_report.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report, indent=2))
    if not report["pass"]:
        sys.exit(1)


if __name__ == "__main__":
    main()
