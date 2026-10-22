import torch
from torch import nn

from judge.lora import add_lora, merged_state_dict


class Tiny(nn.Module):
    def __init__(self):
        super().__init__()
        self.q_proj = nn.Linear(8, 8, bias=False)
        self.other = nn.Linear(8, 2)

    def forward(self, x):
        return self.other(self.q_proj(x))


def test_lora_output_matches_merged_weights_and_freezes_base():
    torch.manual_seed(0)
    m = Tiny()
    add_lora(m, rank=2, alpha=4, targets=("q_proj",), frozen_fp16=True)
    with torch.no_grad():
        m.q_proj.lora_b.normal_()
    trainable = {n for n, p in m.named_parameters() if p.requires_grad}
    assert trainable == {"q_proj.lora_a", "q_proj.lora_b", "other.weight", "other.bias"}
    x = torch.randn(3, 8)
    ref = m(x)
    plain = Tiny()
    plain.load_state_dict(merged_state_dict(m))
    torch.testing.assert_close(plain(x), ref, atol=2e-3, rtol=2e-3)
