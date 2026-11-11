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


def _tiny_bpe():
    from tokenizers import Tokenizer, decoders, models, pre_tokenizers, trainers
    tok = Tokenizer(models.BPE(byte_fallback=True, unk_token="<unk>"))
    tok.pre_tokenizer = pre_tokenizers.Metaspace()
    tok.decoder = decoders.Sequence([decoders.ByteFallback(), decoders.Fuse(), decoders.Metaspace()])
    specials = ["<unk>", "<bos>"] + [f"<0x{i:02X}>" for i in range(256)]
    trainer = trainers.BpeTrainer(vocab_size=700, special_tokens=specials, show_progress=False)
    corpus = ["the secure shell key is stored on the server", "please review the server log for errors",
              "keygen created a new ssh key for the deploy user", "our nginx firewall rules block port 22"] * 25
    tok.train_from_iterator(corpus, trainer)
    return tok


def test_pruned_tokenizer_keeps_kept_text_identical_and_never_emits_unk():
    from tokenizers import Tokenizer
    from judge.vocab import prune_tokenizer_json
    full = _tiny_bpe()
    tj = json.loads(full.to_str())
    kept_text = "please review the server log"
    kept = set(full.encode(kept_text).ids) | {full.token_to_id("<unk>"), full.token_to_id("<bos>")}
    pruned_json, old_ids = prune_tokenizer_json(tj, kept)
    pruned = Tokenizer.from_str(json.dumps(pruned_json))
    assert pruned.get_vocab_size() < full.get_vocab_size()
    assert pruned.encode(kept_text).tokens == full.encode(kept_text).tokens
    unseen = "keygen ssh nginx Ñandú"
    enc = pruned.encode(unseen)
    assert pruned.token_to_id("<unk>") not in enc.ids
    assert pruned.decode(enc.ids, skip_special_tokens=False).replace(" ", "") == unseen.replace(" ", "")
    for token, new_id in pruned_json["model"]["vocab"].items():
        assert tj["model"]["vocab"][token] == old_ids[new_id]


def test_pruned_tokenizer_remaps_added_tokens_and_keeps_bytes():
    from judge.vocab import prune_tokenizer_json
    full = _tiny_bpe()
    tj = json.loads(full.to_str())
    pruned_json, old_ids = prune_tokenizer_json(tj, {full.token_to_id("<bos>")})
    vocab = pruned_json["model"]["vocab"]
    assert all(f"<0x{i:02X}>" in vocab for i in range(256))
    for added in pruned_json["added_tokens"]:
        assert vocab[added["content"]] == added["id"]


@pytest.mark.gated
def test_real_gemma_pruning_never_unknown():
    from tokenizers import Tokenizer
    from huggingface_hub import hf_hub_download
    from judge.vocab import prune_tokenizer_json
    tj = json.loads(open(hf_hub_download("google/gemma-3-270m", "tokenizer.json"), encoding="utf-8").read())
    full = Tokenizer.from_str(json.dumps(tj))
    kept = set(full.encode("please summarize the quarterly report").ids)
    pruned_json, _ = prune_tokenizer_json(tj, kept)
    pruned = Tokenizer.from_str(json.dumps(pruned_json))
    text = "ssh-keygen -t rsa\tnginx VLAN 并购 ibuprofen"
    ids = pruned.encode(text, add_special_tokens=False).ids
    assert pruned.token_to_id("<unk>") not in ids and pruned.decode(ids) == text


def test_select_by_frequency_caps_and_keeps_specials(tiny_tokenizer_dir):
    from transformers import AutoTokenizer
    from judge.vocab import select_by_frequency
    hf = AutoTokenizer.from_pretrained(tiny_tokenizer_dir)
    texts = ["the password the password the", "salary report"]
    kept = select_by_frequency(hf, texts, words=[], max_tokens=3, include_symbols=False)
    the, password = hf.convert_tokens_to_ids("the"), hf.convert_tokens_to_ids("password")
    assert {the, password} <= kept and set(hf.all_special_ids) <= kept
    assert len(kept - set(hf.all_special_ids)) == 3


def test_save_pruned_tokenizer_roundtrip(tmp_path, tiny_tokenizer_dir):
    from transformers import AutoTokenizer
    from judge.vocab import save_pruned_tokenizer
    hf = AutoTokenizer.from_pretrained(tiny_tokenizer_dir)
    kept = {hf.convert_tokens_to_ids(t) for t in ["the", "password", "salary"]} | set(hf.all_special_ids)
    old_ids = save_pruned_tokenizer(hf, kept, tmp_path / "pruned")
    pruned = AutoTokenizer.from_pretrained(tmp_path / "pruned")
    assert len(pruned) == len(old_ids) == len(kept)
    assert json.loads((tmp_path / "pruned" / "old_ids.json").read_text()) == old_ids
    ids = pruned.encode("the password", add_special_tokens=False)
    assert [old_ids[i] for i in ids] == hf.encode("the password", add_special_tokens=False)
    assert pruned.bos_token == hf.bos_token


def test_byte_level_pruning_keeps_all_byte_symbols():
    from judge.vocab import prune_tokenizer_json
    vocab = {chr(0x100 + i): i for i in range(256)}
    vocab["ab"] = 256
    tj = {"model": {"type": "BPE", "vocab": vocab, "merges": []}, "pre_tokenizer": {"type": "ByteLevel"},
          "added_tokens": []}
    out, old_ids = prune_tokenizer_json(tj, kept={256})
    assert len(out["model"]["vocab"]) == 257
