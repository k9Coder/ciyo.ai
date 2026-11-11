import argparse
import random
from pathlib import Path

from judge.data.schema import Example, read_jsonl, stable_id, write_jsonl

MODELS = {
    "he": "Helsinki-NLP/opus-mt-en-he", "es": "Helsinki-NLP/opus-mt-en-es", "fr": "Helsinki-NLP/opus-mt-en-fr",
    "de": "Helsinki-NLP/opus-mt-en-de", "pt": "Helsinki-NLP/opus-mt-tc-big-en-pt", "ru": "Helsinki-NLP/opus-mt-en-ru",
    "ar": "Helsinki-NLP/opus-mt-en-ar", "zh": "Helsinki-NLP/opus-mt-en-zh",
}
TARGET_PREFIX = {"ar": ">>ara<< ", "zh": ">>cmn_Hans<< ", "pt": ">>pob<< "}


class MarianTranslator:
    def __init__(self, language: str, device: str | None = None, batch_size: int = 32):
        import torch
        from transformers import AutoModelForSeq2SeqLM, AutoTokenizer
        self.device = device or ("cuda" if torch.cuda.is_available() else "cpu")
        self.tok = AutoTokenizer.from_pretrained(MODELS[language])
        self.model = AutoModelForSeq2SeqLM.from_pretrained(MODELS[language]).to(self.device).eval()
        self.prefix, self.batch_size = TARGET_PREFIX.get(language, ""), batch_size

    def __call__(self, texts: list[str]) -> list[str]:
        import torch
        out = []
        for i in range(0, len(texts), self.batch_size):
            batch = [self.prefix + t for t in texts[i:i + self.batch_size]]
            enc = self.tok(batch, return_tensors="pt", padding=True, truncation=True, max_length=512).to(self.device)
            with torch.no_grad():
                gen = self.model.generate(**enc, num_beams=2, max_new_tokens=512)
            out.extend(self.tok.batch_decode(gen, skip_special_tokens=True))
        return out


def translate_examples(examples: list[Example], language: str, translate) -> list[Example]:
    texts = sorted({e.message for e in examples} | {r for e in examples for r in e.rules})
    mapping = dict(zip(texts, translate(texts)))
    out = []
    for e in examples:
        rules = tuple(mapping[r] for r in e.rules)
        out.append(Example(stable_id("nli", language, e.message_id), mapping[e.message], language,
                           tuple(stable_id("hyp", language, r) for r in rules), rules, e.targets, e.critical,
                           e.adversarial, None))
    return out


def main(argv=None):
    ap = argparse.ArgumentParser(prog="judge.nli.translate")
    ap.add_argument("--src", type=Path, required=True)
    ap.add_argument("--lang", choices=sorted(MODELS), required=True)
    ap.add_argument("--limit", type=int, required=True)
    ap.add_argument("--seed", type=int, default=1234)
    ap.add_argument("--out", type=Path, required=True)
    a = ap.parse_args(argv)
    src = read_jsonl(a.src, Example)
    subset = random.Random(f"{a.seed}:{a.lang}").sample(src, min(a.limit, len(src)))
    write_jsonl(a.out, translate_examples(subset, a.lang, MarianTranslator(a.lang)))
    print(f"wrote {len(subset)} {a.lang} examples")


if __name__ == "__main__":
    main()
