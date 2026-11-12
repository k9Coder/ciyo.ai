import argparse
import json
from pathlib import Path

import torch

from judge.data.schema import Example, read_jsonl
from judge.evaluate.metrics import Row, fbeta, gate_report

MODEL_ID = "MoritzLaurer/mDeBERTa-v3-base-xnli-multilingual-nli-2mil7"


class ZeroShotNLI:
    def __init__(self, model, tokenizer, max_len: int = 512, overlap: int = 64, device: str = "cpu"):
        self.model, self.tok, self.max_len, self.overlap, self.device = model.to(device).eval(), tokenizer, max_len, overlap, device
        self.entail = {v.lower(): k for k, v in model.config.id2label.items()}["entailment"]

    @staticmethod
    def load(model_id: str = MODEL_ID, device: str | None = None) -> "ZeroShotNLI":
        from transformers import AutoModelForSequenceClassification, AutoTokenizer
        device = device or ("cuda" if torch.cuda.is_available() else "cpu")
        return ZeroShotNLI(AutoModelForSequenceClassification.from_pretrained(model_id),
                           AutoTokenizer.from_pretrained(model_id), device=device)

    def windows(self, message: str, rule: str) -> list[str]:
        ids = self.tok.encode(message, add_special_tokens=False)
        budget = max(8, self.max_len - len(self.tok.encode(rule, add_special_tokens=False)) - 4)
        if len(ids) <= budget:
            return [message]
        stride = max(1, budget - self.overlap)
        starts = list(range(0, len(ids) - budget, stride)) + [len(ids) - budget]
        return [self.tok.decode(ids[s:s + budget]) for s in starts]

    def _entail(self, premise: str, rule: str) -> float:
        enc = self.tok(premise, rule, return_tensors="pt", truncation=True, max_length=self.max_len)
        enc = {k: v.to(self.device) for k, v in enc.items() if k in ("input_ids", "attention_mask")}
        with torch.no_grad():
            probs = torch.softmax(self.model(**enc).logits[0].float(), -1)
        return float(probs[self.entail])

    def score(self, message: str, rules: list[str]) -> list[float]:
        return [max(self._entail(w, r) for w in self.windows(message, r)) for r in rules]


def rows_for(scorer: ZeroShotNLI, examples) -> list[Row]:
    rows = []
    for ex in examples:
        probs = scorer.score(ex.message, list(ex.rules))
        pos = (len(scorer.tok.encode(ex.message[:ex.violation_char_start], add_special_tokens=False))
               if ex.violation_char_start is not None else None)
        for p, t, c in zip(probs, ex.targets, ex.critical):
            label = int(t >= 0.5)
            rows.append(Row(p, label, c, ex.adversarial, (pos >= 500) if (label and pos is not None) else None, ex.language))
    return rows


def best_threshold(rows) -> float:
    return max(sorted({r.p for r in rows}), key=lambda t: (fbeta(rows, t), t))


def main(argv=None):
    ap = argparse.ArgumentParser(prog="judge.baseline.zeroshot")
    ap.add_argument("--val", type=Path, required=True)
    ap.add_argument("--test", type=Path, required=True)
    ap.add_argument("--out", type=Path, required=True)
    a = ap.parse_args(argv)
    scorer = ZeroShotNLI.load()
    val_rows = rows_for(scorer, read_jsonl(a.val, Example))
    thr = best_threshold(val_rows)
    test_rows = rows_for(scorer, read_jsonl(a.test, Example))
    out = {"model": MODEL_ID, "threshold": thr, "val_f2": fbeta(val_rows, thr), "test_f2": fbeta(test_rows, thr),
           "report": gate_report(test_rows, thr)}
    a.out.write_text(json.dumps(out, indent=2), encoding="utf-8")
    print(json.dumps({k: out[k] for k in ("threshold", "val_f2", "test_f2")}, indent=2))


if __name__ == "__main__":
    main()
