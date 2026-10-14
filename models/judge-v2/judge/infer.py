import json
from pathlib import Path

import numpy as np
import onnxruntime as ort

from judge.config import JudgeConfig
from judge.sequence import Step, causal_step, chunk_spans, message_windows, rules_step
from judge.tokenize import JudgeTokenizer


class OnnxJudge:
    def __init__(self, model_dir: Path, threads: int | None = None):
        self.cfg = JudgeConfig.load(model_dir / "judge_config.json")
        remap = model_dir / self.cfg.vocab_remap_file if self.cfg.vocab_remap_file else None
        self.tok = JudgeTokenizer.load(model_dir, self.cfg, remap)
        so = ort.SessionOptions()
        so.enable_cpu_mem_arena = False
        if threads:
            so.intra_op_num_threads = threads
        self.sess = ort.InferenceSession(str(model_dir / "judge.onnx"), so)
        spec = json.loads((model_dir / "backbone_spec.json").read_text(encoding="utf-8"))
        empty = np.zeros((spec["num_layers"], 1, spec["num_kv_heads"], 0, spec["head_dim"]), np.float32)
        self.prefix = self.tok.prefix_ids()
        _, self.prefix_k, self.prefix_v = self._run(causal_step(self.prefix, 0), empty, empty, True)

    def _run(self, step: Step, pk, pv, need_state: bool):
        feeds = {
            "input_ids": step.input_ids[None], "position_ids": step.position_ids[None],
            "attn_bias": step.attn_bias[None, None], "past_k": pk, "past_v": pv,
        }
        names = ["verdict", "present_k", "present_v"] if need_state else ["verdict"]
        out = self.sess.run(names, feeds)
        return (out[0][0], out[1], out[2]) if need_state else (out[0][0], None, None)

    def score(self, message: str, rules: list[str]) -> list[float]:
        if not rules:
            return []
        rule_ids = [self.tok.rule_ids(r) for r in rules]
        msg = self.tok.message_ids(message)
        best = np.zeros(len(rules))
        for a, b in message_windows(len(msg), self.cfg.max_message_tokens, self.cfg.window_overlap_tokens):
            pk, pv, p = self.prefix_k, self.prefix_v, len(self.prefix)
            for s, e in chunk_spans(b - a, self.cfg.max_chunk_tokens):
                _, pk, pv = self._run(causal_step(msg[a + s:a + e], p), pk, pv, True)
                p += e - s
            step = rules_step(rule_ids, p)
            logits, _, _ = self._run(step, pk, pv, False)
            z = logits[list(step.verdict_index)] / self.cfg.temperature
            z = z - z.max(-1, keepdims=True)
            probs = np.exp(z[:, 1]) / np.exp(z).sum(-1)
            best = np.maximum(best, probs)
        return best.tolist()
