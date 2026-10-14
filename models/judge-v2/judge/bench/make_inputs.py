import argparse
import json
from pathlib import Path

from judge.config import JudgeConfig
from judge.tokenize import JudgeTokenizer

SCENARIOS = [
    {"name": "web_send_after_typing_2000tok_10rules", "platform": "web", "kind": "send_after_typing", "tokens": 2000, "rules": 10, "gate_ms": 2000},
    {"name": "web_paste_then_send_1000tok_5rules", "platform": "web", "kind": "paste_then_send", "tokens": 1000, "rules": 5, "gate_ms": 5000},
    {"name": "web_paste_then_send_150tok_5rules", "platform": "web", "kind": "paste_then_send", "tokens": 150, "rules": 5, "gate_ms": None},
    {"name": "web_paste_then_send_500tok_5rules", "platform": "web", "kind": "paste_then_send", "tokens": 500, "rules": 5, "gate_ms": None},
    {"name": "native_paste_then_send_1000tok_10rules", "platform": "native", "kind": "paste_then_send", "tokens": 1000, "rules": 10, "gate_ms": 2000},
    {"name": "native_paste_then_send_2000tok_5rules", "platform": "native", "kind": "paste_then_send", "tokens": 2000, "rules": 5, "gate_ms": 5000},
    {"name": "native_paste_then_send_150tok_1rule", "platform": "native", "kind": "paste_then_send", "tokens": 150, "rules": 1, "gate_ms": None},
]
TEXT = ("Please review the following quarterly planning notes and summarize the key decisions for the team. "
        "The migration of the reporting service is on track, the dashboard redesign needs another review, and "
        "the support backlog dropped after the new triage process. ")
RULES = [
    "This message discloses a US Social Security Number, even if disguised.",
    "This message discloses an API key or access token, even if disguised.",
    "This message discloses a payment card number, even if disguised.",
    "This message discloses an identifiable patient's diagnosis, even if disguised.",
    "This message discloses details of Project Zephyr-9, even if disguised.",
    "This message discloses a named employee's salary, even if disguised.",
    "This message discloses unreleased quarterly revenue figures, even if disguised.",
    "This message discloses a database connection string with credentials, even if disguised.",
    "This message discloses a private individual's home address, even if disguised.",
    "This message discloses attorney-client privileged advice, even if disguised.",
]


def main(argv=None):
    ap = argparse.ArgumentParser(prog="judge.bench.make_inputs")
    ap.add_argument("--model-dir", type=Path, required=True)
    ap.add_argument("--out", type=Path, required=True)
    a = ap.parse_args(argv)
    cfg = JudgeConfig.load(a.model_dir / "judge_config.json")
    remap = a.model_dir / cfg.vocab_remap_file if cfg.vocab_remap_file else None
    tok = JudgeTokenizer.load(a.model_dir, cfg, remap)
    spec = json.loads((a.model_dir / "backbone_spec.json").read_text(encoding="utf-8"))
    base: list[int] = []
    while len(base) < 2000:
        base += tok.message_ids(TEXT)
    scenarios = [{**s, "messageIds": base[:s["tokens"]], "ruleIds": [tok.rule_ids(r) for r in RULES[:s["rules"]]]}
                 for s in SCENARIOS]
    a.out.write_text(json.dumps({"layers": spec["num_layers"], "kvHeads": spec["num_kv_heads"],
                                 "headDim": spec["head_dim"], "chunk": cfg.max_chunk_tokens,
                                 "prefixIds": tok.prefix_ids(), "scenarios": scenarios}), encoding="utf-8")


if __name__ == "__main__":
    main()
