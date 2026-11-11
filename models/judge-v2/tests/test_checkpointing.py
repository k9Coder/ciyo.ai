import torch

from judge.backbone import Backbone
from tests.conftest import causal_bias, tiny_gemma3


def _run(bb, ids):
    k0, v0 = bb.empty_past()
    out, _, _ = bb(ids, torch.arange(ids.shape[1])[None], causal_bias(ids.shape[1], 0), k0, v0)
    out.pow(2).mean().backward()
    return out.detach(), bb.embed_tokens.weight.grad.detach().clone()


def test_checkpointing_matches_plain_forward_and_grads():
    ids = torch.randint(0, 97, (1, 30), generator=torch.Generator().manual_seed(7))
    plain = Backbone.from_hf_model(tiny_gemma3()).train()
    ckpt = Backbone.from_hf_model(tiny_gemma3()).train()
    ckpt.checkpointing = True
    out_a, grad_a = _run(plain, ids)
    out_b, grad_b = _run(ckpt, ids)
    torch.testing.assert_close(out_a, out_b, atol=1e-5, rtol=1e-5)
    torch.testing.assert_close(grad_a, grad_b, atol=1e-5, rtol=1e-5)


def test_checkpointing_is_off_by_default_and_ignored_in_eval():
    bb = Backbone.from_hf_model(tiny_gemma3())
    assert bb.checkpointing is False
    bb.checkpointing = True
    bb.eval()
    ids = torch.randint(0, 97, (1, 10))
    k0, v0 = bb.empty_past()
    with torch.no_grad():
        out, _, _ = bb(ids, torch.arange(10)[None], causal_bias(10, 0), k0, v0)
    assert out.shape == (1, 10, bb.spec.hidden_size)
