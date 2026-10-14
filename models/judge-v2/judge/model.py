import json
from pathlib import Path

import torch
from torch import nn

from judge.backbone import Backbone, spec_from_json
from judge.sequence import Step


class JudgeModel(nn.Module):
    def __init__(self, backbone: Backbone):
        super().__init__()
        self.backbone = backbone
        self.head = nn.Linear(backbone.spec.hidden_size, 2)

    def forward(self, input_ids, position_ids, attn_bias, past_k, past_v):
        hidden, k, v = self.backbone(input_ids, position_ids, attn_bias, past_k, past_v)
        return self.head(hidden), k, v


def step_tensors(step: Step, device=None):
    return (
        torch.from_numpy(step.input_ids)[None].to(device),
        torch.from_numpy(step.position_ids)[None].to(device),
        torch.from_numpy(step.attn_bias)[None, None].to(device),
    )


def load_judge(run_dir: Path) -> JudgeModel:
    spec = spec_from_json(json.loads((run_dir / "backbone_spec.json").read_text(encoding="utf-8")))
    model = JudgeModel(Backbone(spec))
    model.load_state_dict(torch.load(run_dir / "best.pt", map_location="cpu", weights_only=True))
    return model.eval()
