"""Minimal LoRA for the judge backbone.

Frozen base weights can be stored in fp16 (upcast per call) so a ~1B second-opinion model fits a 4 GB GPU;
merged_state_dict() folds the adapters back in, so export and load_judge see an ordinary checkpoint.
"""
import torch
import torch.nn.functional as F
from torch import nn

TARGETS = ("q_proj", "k_proj", "v_proj", "o_proj", "gate_proj", "up_proj", "down_proj")


class LoRALinear(nn.Module):
    def __init__(self, base: nn.Linear, rank: int, alpha: int, frozen_fp16: bool):
        super().__init__()
        w = base.weight.detach()
        self.register_buffer("weight", w.half() if frozen_fp16 else w.clone())
        self.register_buffer("bias", None if base.bias is None else base.bias.detach().clone())
        self.lora_a = nn.Parameter(torch.randn(rank, w.shape[1]) * (1.0 / rank))
        self.lora_b = nn.Parameter(torch.zeros(w.shape[0], rank))
        self.scale = alpha / rank

    def forward(self, x):
        y = F.linear(x, self.weight.to(x.dtype), None if self.bias is None else self.bias.to(x.dtype))
        return y + (x @ self.lora_a.t() @ self.lora_b.t()) * self.scale

    def merged_weight(self) -> torch.Tensor:
        return self.weight.float() + (self.lora_b @ self.lora_a).detach() * self.scale


def add_lora(model: nn.Module, rank: int, alpha: int, targets=TARGETS, frozen_fp16: bool = False) -> None:
    """Freeze every target Linear and wrap it with a LoRA adapter, in place. Other parameters stay as they are."""
    for name, module in list(model.named_modules()):
        for child_name, child in list(module.named_children()):
            if child_name in targets and isinstance(child, nn.Linear):
                setattr(module, child_name, LoRALinear(child, rank, alpha, frozen_fp16))


def merged_state_dict(model: nn.Module) -> dict:
    """The model's state dict with adapters merged, using the original (pre-LoRA) parameter names."""
    sd = {}
    lora_prefixes = {name for name, m in model.named_modules() if isinstance(m, LoRALinear)}
    for name, m in model.named_modules():
        if isinstance(m, LoRALinear):
            sd[f"{name}.weight"] = m.merged_weight()
            if m.bias is not None:
                sd[f"{name}.bias"] = m.bias.float()
    for key, value in model.state_dict().items():
        owner = key.rsplit(".", 1)[0]
        if owner in lora_prefixes:
            continue
        sd[key] = value
    return sd
