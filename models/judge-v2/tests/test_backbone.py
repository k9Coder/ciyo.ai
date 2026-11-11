import pytest
import torch

from judge.backbone import Backbone, BackboneSpec, spec_from_json, spec_to_json
from tests.conftest import causal_bias, tiny_gemma3, tiny_llama, tiny_qwen3


@pytest.mark.parametrize("factory", [tiny_llama, tiny_gemma3, tiny_qwen3], ids=["llama", "gemma3", "qwen3"])
def test_full_pass_matches_hf(factory):
    hf = factory()
    bb = Backbone.from_hf_model(hf).eval()
    ids = torch.randint(0, 97, (1, 40), generator=torch.Generator().manual_seed(1))
    k0, v0 = bb.empty_past()
    with torch.no_grad():
        ref = hf.model(input_ids=ids).last_hidden_state
        out, pk, pv = bb(ids, torch.arange(40)[None], causal_bias(40, 0), k0, v0)
    torch.testing.assert_close(out, ref, atol=1e-4, rtol=1e-4)
    assert pk.shape == (bb.spec.num_layers, 1, bb.spec.num_kv_heads, 40, bb.spec.head_dim)


@pytest.mark.parametrize("factory", [tiny_llama, tiny_gemma3, tiny_qwen3], ids=["llama", "gemma3", "qwen3"])
def test_chunked_with_cache_matches_single_pass(factory):
    bb = Backbone.from_hf_model(factory()).eval()
    ids = torch.randint(0, 97, (1, 40), generator=torch.Generator().manual_seed(2))
    k0, v0 = bb.empty_past()
    with torch.no_grad():
        full, _, _ = bb(ids, torch.arange(40)[None], causal_bias(40, 0), k0, v0)
        a, pk, pv = bb(ids[:, :25], torch.arange(25)[None], causal_bias(25, 0), k0, v0)
        b, _, _ = bb(ids[:, 25:], torch.arange(25, 40)[None], causal_bias(15, 25), pk, pv)
    torch.testing.assert_close(torch.cat([a, b], 1), full, atol=1e-4, rtol=1e-4)


def test_spec_json_roundtrip():
    spec = BackboneSpec.from_hf_config(tiny_gemma3().config)
    assert spec_from_json(spec_to_json(spec)) == spec
    assert spec.layer_types == ("sliding_attention", "sliding_attention", "full_attention")


def test_unsupported_model_type_raises():
    class Cfg:
        model_type = "gpt2"
    with pytest.raises(ValueError, match="unsupported model_type"):
        BackboneSpec.from_hf_config(Cfg())


@pytest.mark.slow
def test_real_smollm2_matches_hf():
    from transformers import AutoModelForCausalLM, AutoTokenizer
    name = "HuggingFaceTB/SmolLM2-135M"
    hf = AutoModelForCausalLM.from_pretrained(name, torch_dtype=torch.float32).eval()
    tok = AutoTokenizer.from_pretrained(name)
    ids = torch.tensor([tok.encode("Please summarize this quarterly report for project zephyr-9.")])
    bb = Backbone.from_hf_model(hf).eval()
    k0, v0 = bb.empty_past()
    n = ids.shape[1]
    with torch.no_grad():
        ref = hf.model(input_ids=ids).last_hidden_state
        out, _, _ = bb(ids, torch.arange(n)[None], causal_bias(n, 0), k0, v0)
    torch.testing.assert_close(out, ref, atol=2e-3, rtol=2e-3)


@pytest.mark.gated
def test_real_gemma3_matches_hf():
    from transformers import AutoModelForCausalLM, AutoTokenizer
    name = "google/gemma-3-270m"
    hf = AutoModelForCausalLM.from_pretrained(name, torch_dtype=torch.float32).eval()
    tok = AutoTokenizer.from_pretrained(name)
    ids = torch.tensor([tok.encode("Please summarize this quarterly report for project zephyr-9.")])
    bb = Backbone.from_hf_model(hf).eval()
    k0, v0 = bb.empty_past()
    n = ids.shape[1]
    with torch.no_grad():
        ref = hf.model(input_ids=ids).last_hidden_state
        out, _, _ = bb(ids, torch.arange(n)[None], causal_bias(n, 0), k0, v0)
    torch.testing.assert_close(out, ref, atol=2e-3, rtol=2e-3)


@pytest.mark.slow
def test_real_qwen3_matches_hf():
    from transformers import AutoModelForCausalLM, AutoTokenizer
    name = "Qwen/Qwen3-0.6B"
    hf = AutoModelForCausalLM.from_pretrained(name, torch_dtype=torch.float32).eval()
    tok = AutoTokenizer.from_pretrained(name)
    ids = torch.tensor([tok.encode("Please summarize this quarterly report for project zephyr-9.")])
    bb = Backbone.from_hf_model(hf).eval()
    k0, v0 = bb.empty_past()
    n = ids.shape[1]
    with torch.no_grad():
        ref = hf.model(input_ids=ids).last_hidden_state
        out, _, _ = bb(ids, torch.arange(n)[None], causal_bias(n, 0), k0, v0)
    torch.testing.assert_close(out, ref, atol=2e-3, rtol=2e-3)
