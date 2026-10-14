"""Phase 0 probe: can a vocabulary-trimmed Gemma 3 270M be fully fine-tuned on this GPU?

Measures peak memory and seconds per example by sequence length and precision, the longest
length that fits, and whether fp16 mixed precision stays numerically stable. Writes train_probe.json.
"""
import json
import math
import time
from pathlib import Path

import torch
from torch import nn
from transformers import AutoModelForCausalLM, AutoTokenizer

MODEL = "google/gemma-3-270m"
HERE = Path(__file__).resolve().parent
VOCAB = 80000
LENGTHS = [128, 256, 512, 1024, 1536, 2048, 3072, 4096]
STAGE1_PAIRS = 400_000
STAGE2_PAIRS = 40_000
STAGE2_EPOCHS = 2


class Probe(nn.Module):
    def __init__(self, base, hidden):
        super().__init__()
        self.base, self.head = base, nn.Linear(hidden, 2)

    def forward(self, ids):
        return self.head(self.base(input_ids=ids).last_hidden_state[:, -1].float())


def build(checkpointing: bool) -> Probe:
    base = AutoModelForCausalLM.from_pretrained(MODEL, torch_dtype=torch.float32).model
    base.embed_tokens.weight = nn.Parameter(base.embed_tokens.weight.data[:VOCAB].clone())
    base.embed_tokens.num_embeddings = VOCAB
    base.config.use_cache = False
    if checkpointing:
        base.gradient_checkpointing_enable()
    return Probe(base, base.config.hidden_size).cuda()


def _step(model, opt, scaler, ids, y, precision):
    with torch.autocast("cuda", dtype=torch.float16, enabled=precision == "fp16"):
        loss = nn.functional.cross_entropy(model(ids), y)
    scaler.scale(loss).backward()
    scaler.step(opt)
    scaler.update()
    opt.zero_grad(set_to_none=True)
    return loss.item()


def measure(seq: int, precision: str, checkpointing: bool, steps: int = 8) -> dict:
    row = {"seq": seq, "precision": precision, "checkpointing": checkpointing, "ok": False}
    model = opt = None
    torch.cuda.empty_cache()
    torch.cuda.reset_peak_memory_stats()
    try:
        model = build(checkpointing)
        model.train()
        opt = torch.optim.AdamW(model.parameters(), lr=1e-5)
        scaler = torch.amp.GradScaler("cuda", enabled=precision == "fp16")
        ids = torch.randint(0, VOCAB, (1, seq), device="cuda")
        y = torch.tensor([1], device="cuda")
        times = []
        for _ in range(steps):
            torch.cuda.synchronize()
            t = time.perf_counter()
            _step(model, opt, scaler, ids, y, precision)
            torch.cuda.synchronize()
            times.append(time.perf_counter() - t)
        warm = sorted(times[2:])
        row.update(ok=True, sec_per_example=warm[len(warm) // 2], peak_gb=torch.cuda.max_memory_allocated() / 1e9)
    except torch.OutOfMemoryError:
        pass
    finally:
        del model, opt
        torch.cuda.empty_cache()
    return row


def stability(precision: str, steps: int = 300) -> dict:
    from datasets import load_dataset
    tok = AutoTokenizer.from_pretrained(MODEL)
    rows = [r for r in load_dataset("stanfordnlp/snli", split="train[:3000]") if r["label"] in (0, 1, 2)][:steps]
    torch.manual_seed(0)
    model = build(checkpointing=True)
    model.train()
    opt = torch.optim.AdamW(model.parameters(), lr=2e-5)
    scaler = torch.amp.GradScaler("cuda", enabled=precision == "fp16")
    losses, skipped = [], 0
    for r in rows:
        ids = tok(r["premise"] + " Claim: " + r["hypothesis"], return_tensors="pt").input_ids[:, :128] % VOCAB
        y = torch.tensor([1 if r["label"] == 0 else 0])
        before = scaler.get_scale() if precision == "fp16" else 1.0
        losses.append(_step(model, opt, scaler, ids.cuda(), y.cuda(), precision))
        if precision == "fp16" and scaler.get_scale() < before:
            skipped += 1
    del model, opt
    torch.cuda.empty_cache()
    return {"precision": precision, "finite": all(math.isfinite(l) for l in losses), "skipped_steps": skipped,
            "loss_first50": sum(losses[:50]) / 50, "loss_last50": sum(losses[-50:]) / 50}


def main():
    assert torch.cuda.is_available(), "CUDA GPU required"
    out = {"gpu": torch.cuda.get_device_name(0), "vocab": VOCAB, "measurements": [], "max_seq": {}, "stability": {}}
    for precision in ("fp32", "fp16"):
        out["max_seq"][precision] = 0
        for seq in LENGTHS:
            row = measure(seq, precision, checkpointing=True)
            out["measurements"].append(row)
            print(row, flush=True)
            if not row["ok"]:
                break
            out["max_seq"][precision] = seq
        out["stability"][precision] = stability(precision)
        print(out["stability"][precision], flush=True)
    for seq in (128, 512):
        row = measure(seq, "fp32", checkpointing=False)
        out["measurements"].append(row)
        print(row, flush=True)

    def sec(precision, seq):
        rows = [m for m in out["measurements"] if m["ok"] and m["precision"] == precision and m["checkpointing"]
                and m["seq"] == seq]
        return rows[0]["sec_per_example"] if rows else None

    out["estimates"] = {}
    for precision in ("fp32", "fp16"):
        s128, s512, s2048 = sec(precision, 128), sec(precision, 512), sec(precision, 2048)
        long_sec = s2048 if s2048 is not None else s512
        out["estimates"][precision] = {
            "stage1_hours": None if s128 is None else STAGE1_PAIRS * s128 / 3600,
            "stage2_hours": None if (s512 is None or long_sec is None)
            else STAGE2_PAIRS * STAGE2_EPOCHS * (0.8 * s512 + 0.2 * long_sec) / 3600,
        }
    (HERE / "train_probe.json").write_text(json.dumps(out, indent=2), encoding="utf-8")
    print(json.dumps(out["estimates"], indent=2))


if __name__ == "__main__":
    main()
