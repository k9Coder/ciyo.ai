import json
from pathlib import Path

import numpy as np
import onnxruntime as ort

from judge.config import JudgeConfig
from judge.export import kv_names
from judge.model import SPAN_DIM, best_span, span_scores
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
        n = spec["num_layers"]
        self.past_names, self.present_names = kv_names(n, "past"), kv_names(n, "present")
        empty = [np.zeros((1, spec["num_kv_heads"], 0, spec["head_dim"]), np.float16) for _ in range(2 * n)]
        self.prefix = self.tok.prefix_ids()
        *_, self.prefix_state = self._run(causal_step(self.prefix, 0), empty, True)

    def _run(self, step: Step, state: list, need_state: bool):
        """Returns (verdict logits, span keys or None, span queries, new KV state or None)."""
        feeds = {"input_ids": step.input_ids[None], "position_ids": step.position_ids[None],
                 "attn_bias": step.attn_bias[None, None], **dict(zip(self.past_names, state))}
        if need_state:
            out = self.sess.run(["verdict", "span_key", "span_query"] + self.present_names, feeds)
            return out[0][0], out[1][0], out[2][0], out[3:]
        out = self.sess.run(["verdict", "span_query"], feeds)
        return out[0][0], None, out[1][0], None

    def score(self, message: str, rules: list[str]) -> list[float]:
        return [p for p, _ in self.score_with_spans(message, rules)]

    def score_with_spans(self, message: str, rules: list[str]) -> list[tuple[float, tuple[int, int] | None]]:
        """Calibrated probability per rule, plus the character span of the offending text when p >= 0.5.

        Long messages are scored over overlapping windows; each rule keeps the window with its highest
        probability, and that window's span (mapped back to offsets in the full message).
        """
        if not rules:
            return []
        rule_ids = [self.tok.rule_ids(r) for r in rules]
        msg = self.tok.message_ids(message)
        offs = self.tok.message_offsets(message)
        best = np.full(len(rules), -1.0)
        spans: list = [None] * len(rules)
        for a, b in message_windows(len(msg), self.cfg.max_message_tokens, self.cfg.window_overlap_tokens):
            state, p, keys = self.prefix_state, len(self.prefix), []
            for s, e in chunk_spans(b - a, self.cfg.max_chunk_tokens):
                _, k, _, state = self._run(causal_step(msg[a + s:a + e], p), state, True)
                keys.append(k)
                p += e - s
            keys = np.concatenate(keys) if keys else np.zeros((0, SPAN_DIM), np.float32)
            step = rules_step(rule_ids, p)
            logits, _, query, _ = self._run(step, state, False)
            z = logits[list(step.verdict_index)] / self.cfg.temperature
            z = z - z.max(-1, keepdims=True)
            probs = np.exp(z[:, 1]) / np.exp(z).sum(-1)
            for i, vi in enumerate(step.verdict_index):
                if probs[i] > best[i]:
                    best[i] = probs[i]
                    if len(keys):
                        t0, t1 = best_span(*span_scores(keys, query[vi]))
                        spans[i] = (offs[a + t0][0], offs[a + t1][1])
                    else:
                        spans[i] = None
        return [(float(p), spans[i] if p >= 0.5 else None) for i, p in enumerate(best)]
