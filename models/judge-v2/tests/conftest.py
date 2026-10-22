import pytest
import torch

from judge.sequence import causal_step

TINY_WORDS = (
    "the a an is are was to of and or not in on for with this that it message rule discloses "
    "secret password key code project customer salary address phone email number card bank "
    "account patient diagnosis please help me write review fix bug summary translate draft "
    "quarterly revenue plan launch internal name date birth social security id token api "
    "database server log error report team manager hello thanks can you : . , ? ! - x 0 1 2 3 "
    "4 5 6 7 8 9 zephyr falcon orion apollo verdict judge"
).split()
assert len(TINY_WORDS) == len(set(TINY_WORDS)) and len(TINY_WORDS) <= 95


def causal_bias(s: int, p: int) -> torch.Tensor:
    return torch.from_numpy(causal_step(list(range(s)), p).attn_bias)[None, None]


def _randomize_norms(model):
    with torch.no_grad():
        for name, p in model.named_parameters():
            if "norm" in name:
                p.normal_(0.0, 0.1)
    return model


def tiny_llama():
    from transformers import LlamaConfig, LlamaForCausalLM
    cfg = LlamaConfig(vocab_size=97, hidden_size=64, intermediate_size=128, num_hidden_layers=2,
                      num_attention_heads=4, num_key_value_heads=2, max_position_embeddings=512)
    torch.manual_seed(0)
    return _randomize_norms(LlamaForCausalLM(cfg).eval())


def tiny_qwen3():
    from transformers import Qwen3Config, Qwen3ForCausalLM
    cfg = Qwen3Config(vocab_size=97, hidden_size=64, intermediate_size=128, num_hidden_layers=2,
                      num_attention_heads=4, num_key_value_heads=2, head_dim=16, max_position_embeddings=512)
    torch.manual_seed(0)
    return _randomize_norms(Qwen3ForCausalLM(cfg).eval())


def tiny_gemma3():
    from transformers import Gemma3ForCausalLM, Gemma3TextConfig
    cfg = Gemma3TextConfig(vocab_size=97, hidden_size=64, intermediate_size=128, num_hidden_layers=3,
                           num_attention_heads=4, num_key_value_heads=1, head_dim=16,
                           max_position_embeddings=512, sliding_window=8, query_pre_attn_scalar=16,
                           layer_types=["sliding_attention", "sliding_attention", "full_attention"])
    torch.manual_seed(0)
    return _randomize_norms(Gemma3ForCausalLM(cfg).eval())


@pytest.fixture(scope="session")
def tiny_tokenizer_dir(tmp_path_factory):
    from tokenizers import Tokenizer
    from tokenizers.models import WordLevel
    from tokenizers.pre_tokenizers import Whitespace
    from transformers import PreTrainedTokenizerFast

    vocab = {tok: i for i, tok in enumerate(["[UNK]", "[BOS]"] + TINY_WORDS)}
    tk = Tokenizer(WordLevel(vocab, unk_token="[UNK]"))
    tk.pre_tokenizer = Whitespace()
    fast = PreTrainedTokenizerFast(tokenizer_object=tk, unk_token="[UNK]", bos_token="[BOS]")
    out = tmp_path_factory.mktemp("tiny_tok")
    fast.save_pretrained(out)
    return out
