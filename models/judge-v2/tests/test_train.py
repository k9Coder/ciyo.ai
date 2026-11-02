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


def test_optimizer_is_memory_lean_adafactor():
    import torch
    from transformers.optimization import Adafactor
    from judge.train.train import make_optimizer
    opt = make_optimizer(torch.nn.Linear(4, 2), lr=1e-3)
    assert isinstance(opt, Adafactor)
    d = opt.defaults
    assert d["lr"] == 1e-3 and d["relative_step"] is False and d["scale_parameter"] is False and d["warmup_init"] is False
    assert d["weight_decay"] == 0.01



def test_training_streams_train_file_instead_of_loading_it(tmp_path, tiny_tokenizer_dir, monkeypatch):
    import judge.train.train as train_mod
    real_read = train_mod.read_jsonl

    def guarded(path, cls):
        assert path.name != "train.jsonl", "train.jsonl must be streamed, not loaded"
        return real_read(path, cls)

    monkeypatch.setattr(train_mod, "read_jsonl", guarded)
    base, data = _base(tmp_path, tiny_tokenizer_dir)
    out = tmp_path / "run"
    train_main(["--base", str(base), "--data", str(data), "--out", str(out), "--epochs", "1", "--grad-accum", "4",
                "--eval-every", "1000", "--seed", "1", "--max-tokens", "10"])
    assert json.loads((out / "val_metrics.json").read_text())["skipped_long"] == 160


def _span_examples(n, seed):
    rng = random.Random(seed)
    out = []
    for i in range(n):
        key = rng.choice(KEYS)
        other = rng.choice([k for k in KEYS if k != key])
        msg = f"please help me with this {key} report thanks"
        s = msg.index(key)
        out.append(Example(f"m{i}", msg, "en", ("r1", "r2"), (f"message discloses {key}", f"message discloses {other}"),
                           (1.0, 0.0), (True, False), False, s, ((s, s + len(key)), None)))
    return out


def test_span_loss_trains_span_head(tmp_path, tiny_tokenizer_dir):
    base, data = _base(tmp_path, tiny_tokenizer_dir)
    write_jsonl(data / "train.jsonl", _span_examples(160, 1))
    write_jsonl(data / "val.jsonl", _span_examples(20, 2))
    out = tmp_path / "run"
    train_main(["--base", str(base), "--data", str(data), "--out", str(out), "--epochs", "4", "--lr", "3e-3",
                "--warmup", "5", "--grad-accum", "4", "--eval-every", "1000", "--seed", "1", "--span-weight", "1.0"])
    spans = [json.loads(l)["span_loss"] for l in (out / "train_log.jsonl").read_text().splitlines()]
    assert sum(spans[-10:]) / 10 < 0.5 * sum(spans[:10]) / 10


def test_lora_trains_only_adapters_and_heads_and_saves_merged(tmp_path, tiny_tokenizer_dir):
    import torch
    from judge.model import load_judge
    base, data = _base(tmp_path, tiny_tokenizer_dir)
    out = tmp_path / "run"
    train_main(["--base", str(base), "--data", str(data), "--out", str(out), "--epochs", "1", "--lr", "1e-3",
                "--warmup", "5", "--grad-accum", "4", "--eval-every", "1000", "--seed", "1", "--lora-rank", "4"])
    sd = torch.load(out / "best.pt", weights_only=True)
    assert not any("lora" in k or "base_model" in k for k in sd)
    load_judge(out)


def test_span_only_training_leaves_verdict_weights_untouched(tmp_path, tiny_tokenizer_dir):
    import torch
    base, data = _base(tmp_path, tiny_tokenizer_dir)
    write_jsonl(data / "train.jsonl", _span_examples(160, 1))
    write_jsonl(data / "val.jsonl", _span_examples(20, 2))
    first = tmp_path / "first"
    train_main(["--base", str(base), "--data", str(data), "--out", str(first), "--epochs", "1", "--lr", "1e-3",
                "--warmup", "5", "--grad-accum", "4", "--eval-every", "1000", "--seed", "1", "--span-weight", "0"])
    before = torch.load(first / "best.pt", weights_only=True)
    write_jsonl(data / "train.jsonl", _span_examples(120, 1) + _examples(40, 3))  # some examples have no span
    second = tmp_path / "second"
    train_main(["--init-from", str(first), "--data", str(data), "--out", str(second), "--epochs", "3", "--lr", "3e-3",
                "--warmup", "5", "--grad-accum", "4", "--eval-every", "1000", "--seed", "1", "--span-only"])
    after = torch.load(second / "best.pt", weights_only=True)
    for k in before:
        if not k.startswith("span_"):
            torch.testing.assert_close(after[k], before[k], rtol=0, atol=0)
    spans = [json.loads(l)["span_loss"] for l in (second / "train_log.jsonl").read_text().splitlines()]
    assert sum(spans[-5:]) / 5 < 0.5 * sum(spans[:5]) / 5


class _Crash(Exception):
    pass


def test_resume_after_crash_continues_exactly_like_an_uninterrupted_run(tmp_path, tiny_tokenizer_dir, monkeypatch):
    import pytest
    import judge.train.train as T
    base, data = _base(tmp_path, tiny_tokenizer_dir)
    args = ["--base", str(base), "--data", str(data), "--epochs", "2", "--lr", "3e-3", "--warmup", "5",
            "--grad-accum", "4", "--seed", "1", "--span-weight", "0"]
    ref = tmp_path / "ref"
    train_main(args + ["--out", str(ref), "--eval-every", "1000"])
    run = tmp_path / "run"
    real_evaluate = T.evaluate
    monkeypatch.setattr(T, "evaluate", lambda *a, **k: (_ for _ in ()).throw(_Crash()))
    with pytest.raises(_Crash):
        train_main(args + ["--out", str(run), "--eval-every", "47", "--save-every", "30"])
    monkeypatch.setattr(T, "evaluate", real_evaluate)
    assert (run / "resume.pt").exists()
    train_main(args + ["--out", str(run), "--eval-every", "1000", "--save-every", "30", "--resume"])
    read = lambda d: [json.loads(l) for l in (d / "train_log.jsonl").read_text().splitlines()]
    got, want = read(run), read(ref)
    assert [r["step"] for r in got] == [r["step"] for r in want]
    assert got[-1]["loss"] == pytest.approx(want[-1]["loss"], abs=1e-4)


def test_resume_without_a_checkpoint_starts_from_the_beginning(tmp_path, tiny_tokenizer_dir):
    base, data = _base(tmp_path, tiny_tokenizer_dir)
    out = tmp_path / "run"
    train_main(["--base", str(base), "--data", str(data), "--out", str(out), "--epochs", "1", "--grad-accum", "4",
                "--seed", "1", "--eval-every", "1000", "--resume"])
    assert json.loads((out / "train_log.jsonl").read_text().splitlines()[0])["step"] == 1
