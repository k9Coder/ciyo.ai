import json

import pytest
import torch
from transformers import AutoTokenizer

from judge.backbone import Backbone
from judge.config import JudgeConfig
from judge.tokenize import JudgeTokenizer
from judge.vocab import (
    build_kept_ids, make_remap, prune_embeddings, save_remap, unknown_rate, unknown_rate_by_language, word_list,
)
from tests.conftest import tiny_gemma3


def test_prune_embeddings_keeps_selected_rows():
    bb = Backbone.from_hf_model(tiny_gemma3())
    old = bb.embed_tokens.weight.detach().clone()
    remap, _ = make_remap({0, 5, 9, 40}, fallback_old_id=0)
    prune_embeddings(bb, remap)
    assert bb.spec.vocab_size == 4 and bb.embed_tokens.weight.shape[0] == 4
    torch.testing.assert_close(bb.embed_tokens.weight[2], old[9])


def test_make_remap_is_sorted_dense_and_needs_fallback():
    remap, fb = make_remap({30, 2, 7}, fallback_old_id=7)
    assert remap == {2: 0, 7: 1, 30: 2} and fb == 1
    with pytest.raises(ValueError):
        make_remap({1, 2}, fallback_old_id=3)


def test_remap_file_loads_into_tokenizer(tmp_path, tiny_tokenizer_dir):
    remap, fb = make_remap({0, 1, 2, 3}, fallback_old_id=0)
    path = tmp_path / "vocab_remap.json"
    save_remap(path, remap, fb)
    assert json.loads(path.read_text())["fallback_new_id"] == 0
    tok = JudgeTokenizer.load(tiny_tokenizer_dir, JudgeConfig(model_version="t", base_model="t"), path)
    assert set(tok.message_ids("the a password")) <= {0, 1, 2, 3}


def test_word_list_covers_every_language():
    words = word_list(["en", "he", "zh"])
    assert "the" in words and "של" in words and "的" in words
    assert len(words) == 20000 + 5000 + 5000


@pytest.mark.slow
def test_unknown_rate_by_language_multiscript():
    hf = AutoTokenizer.from_pretrained("HuggingFaceTB/SmolLM2-135M")
    texts = {"he": ["שלום, תוכל לעזור לי לנסח מייל"], "zh": ["请帮我总结这份季度报告"],
             "ar": ["هل يمكنك مساعدتي في كتابة رسالة"], "en": ["project zephyr-watermelon-9 launch code 0423-77"]}
    kept = build_kept_ids(hf, [t for ts in texts.values() for t in ts], word_list(["en", "he", "zh", "ar"]))
    remap, _ = make_remap(kept, fallback_old_id=hf.all_special_ids[0])
    rates = unknown_rate_by_language(hf, remap, texts)
    assert set(rates) == {"he", "zh", "ar", "en"} and all(r == 0.0 for r in rates.values())
    assert unknown_rate(hf, {0: 0}, ["שלום"]) > 0
