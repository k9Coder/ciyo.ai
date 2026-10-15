import json
import random

from judge.data.schema import Example, write_jsonl
from judge.train.train import main as train_main
from tests.conftest import tiny_llama

KEYS = ["password", "salary", "address", "diagnosis"]


def _examples(n, seed):
    rng = random.Random(seed)
    out = []
    for i in range(n):
        key = rng.choice(KEYS)
        other = rng.choice([k for k in KEYS if k != key])
        out.append(Example(f"m{i}", f"please help me with this {key} report thanks", "en", ("r1", "r2"),
                           (f"message discloses {key}", f"message discloses {other}"), (1.0, 0.0), (True, False), False, None))
    return out


def _base(tmp_path, tiny_tokenizer_dir):
    base = tmp_path / "base"
    tiny_llama().save_pretrained(base)
    for f in tiny_tokenizer_dir.iterdir():
        (base / f.name).write_bytes(f.read_bytes())
    data = tmp_path / "data"
    write_jsonl(data / "train.jsonl", _examples(160, 1))
    write_jsonl(data / "val.jsonl", _examples(20, 2))
    return base, data


def test_training_reduces_loss_and_writes_run_dir(tmp_path, tiny_tokenizer_dir):
    base, data = _base(tmp_path, tiny_tokenizer_dir)
    out = tmp_path / "run"
    train_main(["--base", str(base), "--data", str(data), "--out", str(out), "--epochs", "3", "--lr", "3e-3",
                "--warmup", "5", "--grad-accum", "4", "--eval-every", "40", "--seed", "1", "--grad-checkpointing"])
    for name in ["best.pt", "backbone_spec.json", "judge_config.json", "train_log.jsonl", "val_metrics.json"]:
        assert (out / name).exists(), name
    losses = [json.loads(l)["loss"] for l in (out / "train_log.jsonl").read_text().splitlines()]
    assert sum(losses[-10:]) / 10 < sum(losses[:10]) / 10
    assert "f2" in json.loads((out / "val_metrics.json").read_text())


def test_stage2_init_from_previous_run_and_max_tokens(tmp_path, tiny_tokenizer_dir):
    base, data = _base(tmp_path, tiny_tokenizer_dir)
    stage1 = tmp_path / "stage1"
    train_main(["--base", str(base), "--data", str(data), "--out", str(stage1), "--epochs", "1", "--lr", "1e-3",
                "--warmup", "2", "--grad-accum", "4", "--eval-every", "1000", "--seed", "1"])
    stage2 = tmp_path / "stage2"
    train_main(["--init-from", str(stage1), "--data", str(data), "--out", str(stage2), "--epochs", "1", "--lr", "1e-3",
                "--warmup", "2", "--grad-accum", "4", "--eval-every", "1000", "--seed", "1", "--max-tokens", "200"])
    metrics = json.loads((stage2 / "val_metrics.json").read_text())
    assert metrics["skipped_long"] == 0 and (stage2 / "tokenizer" / "tokenizer_config.json").exists()
    stage2b = tmp_path / "stage2b"
    train_main(["--init-from", str(stage1), "--data", str(data), "--out", str(stage2b), "--epochs", "1",
                "--grad-accum", "4", "--eval-every", "1000", "--seed", "1", "--max-tokens", "10"])
    assert json.loads((stage2b / "val_metrics.json").read_text())["skipped_long"] == 160


def test_training_with_pruned_tokenizer_shrinks_embeddings(tmp_path, tiny_tokenizer_dir):
    from transformers import AutoTokenizer
    from judge.vocab import save_pruned_tokenizer
    base, data = _base(tmp_path, tiny_tokenizer_dir)
    hf = AutoTokenizer.from_pretrained(base)
    words = "please help me with this report thanks message discloses password salary address diagnosis".split()
    kept = {hf.convert_tokens_to_ids(w) for w in words} | set(hf.all_special_ids)
    old_ids = save_pruned_tokenizer(hf, kept, tmp_path / "pruned")
    out = tmp_path / "run"
    train_main(["--base", str(base), "--pruned-tokenizer", str(tmp_path / "pruned"), "--data", str(data), "--out", str(out),
                "--epochs", "1", "--grad-accum", "4", "--eval-every", "1000", "--seed", "1"])
    spec = json.loads((out / "backbone_spec.json").read_text())
    assert spec["vocab_size"] == len(old_ids) < 97
    assert len(AutoTokenizer.from_pretrained(out / "tokenizer")) == len(old_ids)


def test_optimizer_avoids_foreach_memory_spike():
    import torch
    from judge.train.train import make_optimizer
    opt = make_optimizer(torch.nn.Linear(4, 2), lr=1e-3)
    assert isinstance(opt, torch.optim.AdamW) and opt.defaults["foreach"] is False
    assert opt.defaults["weight_decay"] == 0.01
