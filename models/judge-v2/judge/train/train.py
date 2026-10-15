import argparse
import dataclasses
import json
import math
import random
import shutil
from pathlib import Path

import numpy as np
import torch
from transformers import AutoModelForCausalLM, AutoTokenizer

from judge.backbone import Backbone, spec_to_json
from judge.config import JudgeConfig
from judge.data.schema import Example, read_jsonl
from judge.evaluate.metrics import Row, fbeta, precision, recall
from judge.model import JudgeModel, load_judge, step_tensors
from judge.sequence import single_pass
from judge.tokenize import JudgeTokenizer


def seed_everything(seed: int) -> None:
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    torch.cuda.manual_seed_all(seed)


def soft_ce(logits: torch.Tensor, target: torch.Tensor) -> torch.Tensor:
    logp = torch.log_softmax(logits, -1)
    return -(target * logp[:, 1] + (1 - target) * logp[:, 0]).mean()


def _encode(tok, prefix, ex, max_tokens: int):
    msg = tok.message_ids(ex.message)
    rules = [tok.rule_ids(r) for r in ex.rules]
    if len(prefix) + len(msg) + sum(len(r) for r in rules) > max_tokens:
        return None
    return single_pass(prefix, msg, rules)


def evaluate(model, tok, prefix, examples, device, max_tokens) -> dict:
    model.eval()
    rows = []
    k0, v0 = model.backbone.empty_past(device)
    with torch.no_grad():
        for ex in examples:
            st = _encode(tok, prefix, ex, max_tokens)
            if st is None:
                continue
            logits, _, _ = model(*step_tensors(st, device), k0, v0)
            probs = torch.softmax(logits[0, list(st.verdict_index)].float(), -1)[:, 1].cpu().tolist()
            rows += [Row(p, int(t >= 0.5), c, ex.adversarial, None, ex.language)
                     for p, t, c in zip(probs, ex.targets, ex.critical)]
    model.train()
    return {"f2": fbeta(rows, 0.5), "recall": recall(rows, 0.5), "precision": precision(rows, 0.5), "rows": len(rows)}


def _from_base(a, out: Path):
    from judge.vocab import prune_embeddings
    hf_tok = AutoTokenizer.from_pretrained(a.pruned_tokenizer or a.base)
    hf_tok.save_pretrained(out / "tokenizer")
    hf = AutoModelForCausalLM.from_pretrained(a.base, torch_dtype=torch.float32)
    backbone = Backbone.from_hf_model(hf)
    del hf
    if a.pruned_tokenizer:
        old_ids = json.loads((a.pruned_tokenizer / "old_ids.json").read_text(encoding="utf-8"))
        prune_embeddings(backbone, {old: new for new, old in enumerate(old_ids)})
    cfg = JudgeConfig(model_version=out.name, base_model=a.base)
    return JudgeModel(backbone), JudgeTokenizer(hf_tok, cfg), cfg


def _from_run(a, out: Path):
    src = a.init_from
    model = load_judge(src).train()
    shutil.copytree(src / "tokenizer", out / "tokenizer", dirs_exist_ok=True)
    prev = JudgeConfig.load(src / "judge_config.json")
    cfg = dataclasses.replace(prev, model_version=out.name, temperature=1.0, threshold=0.5)
    remap = None
    if prev.vocab_remap_file:
        shutil.copy2(src / prev.vocab_remap_file, out / prev.vocab_remap_file)
        remap = out / prev.vocab_remap_file
    return model, JudgeTokenizer.load(out / "tokenizer", cfg, remap), cfg


def main(argv=None):
    ap = argparse.ArgumentParser(prog="judge.train.train")
    src = ap.add_mutually_exclusive_group(required=True)
    src.add_argument("--base")
    src.add_argument("--init-from", type=Path)
    ap.add_argument("--data", type=Path, required=True)
    ap.add_argument("--out", type=Path, required=True)
    ap.add_argument("--pruned-tokenizer", type=Path)
    ap.add_argument("--precision", choices=["fp32", "fp16"], default="fp32")
    ap.add_argument("--grad-checkpointing", action="store_true")
    ap.add_argument("--max-tokens", type=int, default=4096)
    ap.add_argument("--epochs", type=int, default=1)
    ap.add_argument("--lr", type=float, default=3e-5)
    ap.add_argument("--warmup", type=int, default=200)
    ap.add_argument("--grad-accum", type=int, default=16)
    ap.add_argument("--seed", type=int, default=1234)
    ap.add_argument("--limit-train", type=int, default=0)
    ap.add_argument("--eval-every", type=int, default=2000)
    a = ap.parse_args(argv)
    a.out.mkdir(parents=True, exist_ok=True)
    seed_everything(a.seed)
    device = "cuda" if torch.cuda.is_available() else "cpu"
    fp16 = a.precision == "fp16" and device == "cuda"

    train = read_jsonl(a.data / "train.jsonl", Example)
    val = read_jsonl(a.data / "val.jsonl", Example)
    if a.limit_train:
        train = random.Random(a.seed).sample(train, min(a.limit_train, len(train)))

    model, tok, cfg = (_from_base if a.base else _from_run)(a, a.out)
    seed_everything(a.seed)
    model = model.to(device)
    model.backbone.checkpointing = a.grad_checkpointing
    model.train()
    cfg.save(a.out / "judge_config.json")
    (a.out / "backbone_spec.json").write_text(json.dumps(spec_to_json(model.backbone.spec)), encoding="utf-8")

    prefix = tok.prefix_ids()
    encoded = [(st, ex) for ex in train if (st := _encode(tok, prefix, ex, a.max_tokens)) is not None]
    skipped = len(train) - len(encoded)
    total_steps = max(1, a.epochs * len(encoded) // a.grad_accum)
    opt = torch.optim.AdamW(model.parameters(), lr=a.lr, weight_decay=0.01)
    sched = torch.optim.lr_scheduler.LambdaLR(opt, lambda s: min(1.0, (s + 1) / max(1, a.warmup))
                                              * 0.5 * (1 + math.cos(math.pi * min(1.0, s / total_steps))))
    scaler = torch.amp.GradScaler("cuda", enabled=fp16)
    k0, v0 = model.backbone.empty_past(device)
    rng = random.Random(a.seed)
    best_f2, step, acc, acc_loss = -1.0, 0, 0, 0.0
    log = (a.out / "train_log.jsonl").open("w", encoding="utf-8")

    def checkpoint():
        nonlocal best_f2
        m = evaluate(model, tok, prefix, val, device, a.max_tokens)
        if m["f2"] > best_f2:
            best_f2 = m["f2"]
            torch.save(model.state_dict(), a.out / "best.pt")
            (a.out / "val_metrics.json").write_text(json.dumps({**m, "step": step, "skipped_long": skipped}),
                                                    encoding="utf-8")

    for _ in range(a.epochs):
        order = list(range(len(encoded)))
        rng.shuffle(order)
        for j in order:
            st, ex = encoded[j]
            with torch.autocast("cuda", dtype=torch.float16, enabled=fp16):
                logits, _, _ = model(*step_tensors(st, device), k0, v0)
            target = torch.tensor(ex.targets, dtype=torch.float32, device=device)
            loss = soft_ce(logits[0, list(st.verdict_index)].float(), target) / a.grad_accum
            scaler.scale(loss).backward()
            acc += 1
            acc_loss += loss.item()
            if acc == a.grad_accum:
                scaler.unscale_(opt)
                torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
                scaler.step(opt)
                scaler.update()
                sched.step()
                opt.zero_grad(set_to_none=True)
                step += 1
                log.write(json.dumps({"step": step, "loss": acc_loss}) + "\n")
                acc, acc_loss = 0, 0.0
                if step % a.eval_every == 0:
                    checkpoint()
    checkpoint()
    log.close()
    print(f"done: steps={step} best_f2={best_f2:.4f} skipped_long={skipped}")


if __name__ == "__main__":
    main()
