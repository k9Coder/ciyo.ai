import json
from pathlib import Path

import numpy as np
import torch
from torch import nn

from judge.backbone import Backbone, spec_from_json
from judge.sequence import Step


SPAN_DIM = 64


class JudgeModel(nn.Module):
    """Verdict head plus a pointer span head.

    Message tokens emit span keys; each rule's verdict position emits a start query and an end query. Span
    scores are dot products, so the span costs almost nothing and the one-pass design is kept.
    """

    def __init__(self, backbone: Backbone):
        super().__init__()
        self.backbone = backbone
        h = backbone.spec.hidden_size
        self.head = nn.Linear(h, 2)
        self.span_key = nn.Linear(h, SPAN_DIM)
        self.span_query = nn.Linear(h, 2 * SPAN_DIM)

    def forward(self, input_ids, position_ids, attn_bias, past_k, past_v):
        hidden, k, v = self.backbone(input_ids, position_ids, attn_bias, past_k, past_v)
        return self.head(hidden), self.span_key(hidden), self.span_query(hidden), k, v


def span_scores(keys, query):
    """Start and end scores of each message token for one rule's span query."""
    return keys @ query[:SPAN_DIM], keys @ query[SPAN_DIM:]


def best_span(start, end, max_len: int = 128) -> tuple[int, int]:
    """(t0, t1) maximising start[t0] + end[t1] with t0 <= t1 < t0 + max_len."""
    best, arg = -float("inf"), (0, 0)
    for t0 in range(len(start)):
        seg = end[t0:t0 + max_len]
        j = int(np.argmax(seg))
        if start[t0] + seg[j] > best:
            best, arg = start[t0] + seg[j], (t0, t0 + j)
    return arg


def step_tensors(step: Step, device=None):
    return (
        torch.from_numpy(step.input_ids)[None].to(device),
        torch.from_numpy(step.position_ids)[None].to(device),
        torch.from_numpy(step.attn_bias)[None, None].to(device),
    )


def load_judge(run_dir: Path) -> JudgeModel:
    spec = spec_from_json(json.loads((run_dir / "backbone_spec.json").read_text(encoding="utf-8")))
    model = JudgeModel(Backbone(spec))
    missing, unexpected = model.load_state_dict(
        torch.load(run_dir / "best.pt", map_location="cpu", weights_only=True), strict=False)
    # Checkpoints from before the span head lack only span_* weights; anything else is a real mismatch.
    if unexpected or any(not k.startswith("span_") for k in missing):
        raise RuntimeError(f"checkpoint mismatch: missing={missing} unexpected={unexpected}")
    return model.eval()
