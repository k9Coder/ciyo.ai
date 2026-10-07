import json
import torch
import torch.nn as nn
from transformers import AutoTokenizer, AutoModelForSequenceClassification
from wordfreq import top_n_list

MODEL_ID = "microsoft/deberta-v3-small"
OUT_DIR = "deberta_vocab_pruned_backbone"

# This script's classifier head is randomly initialized (it's missing from
# the pretrained checkpoint — see the MISSING/UNEXPECTED load report below).
# Without seeding, every regeneration of this backbone bakes in a different
# random init, which train.py's own seeding can't control since it loads
# this already-initialized backbone from a separate process. Cost real time
# — two "identical" train.py runs matched only because they happened to
# reuse one backbone saved before either ran; a fresh backbone regeneration
# silently changed the result.
torch.manual_seed(11)

tok = AutoTokenizer.from_pretrained(MODEL_ID)
print(f"original vocab size: {len(tok)}")

keep_ids = set()
for t in tok.all_special_tokens:
    keep_ids.add(tok.convert_tokens_to_ids(t))

# SentencePiece byte-fallback / unk handling differs from BPE; just keep a
# generous common-word + corpus set and rely on the tokenizer's own
# subword/unk behavior for true out-of-vocab pieces.
texts = []
for fn in ["train.jsonl", "eval_heldout.jsonl"]:
    with open(fn, encoding="utf-8") as f:
        for line in f:
            row = json.loads(line)
            texts.append(row["text"])
            texts.append(row["claim"])
for t in texts:
    keep_ids.update(tok(t, add_special_tokens=False).input_ids)

common_words = top_n_list("en", 20000)
for w in common_words:
    keep_ids.update(tok(w, add_special_tokens=False).input_ids)
    keep_ids.update(tok(" " + w, add_special_tokens=False).input_ids)
    # SentencePiece's merge decisions are context-sensitive: "watermelon" at
    # string-start or after a space tokenizes as one piece, but immediately
    # after a hyphen (as in a hyphenated codename/identifier) it splits into
    # different bare subword pieces ("water" + "melon") that the two lines
    # above never produce and therefore never kept. Found via a live bug:
    # an unrelated message false-positived against a judge_prompt claim
    # naming a hyphenated invented codeword, because exactly this subword
    # fell back to UNK. Scanning the hyphen-adjacent context directly
    # reproduces the real split so those pieces get kept too.
    keep_ids.update(tok("x-" + w, add_special_tokens=False).input_ids)
    keep_ids.update(tok(w + "-x", add_special_tokens=False).input_ids)

# Same reasoning for digits: a bare number stuck to a hyphen (version
# suffixes, numbered identifiers — "-9", "v2-3", etc.) tokenizes differently
# than a standalone or space-prefixed digit.
for n in range(100):
    keep_ids.update(tok(str(n), add_special_tokens=False).input_ids)
    keep_ids.update(tok(f"-{n}", add_special_tokens=False).input_ids)
    keep_ids.update(tok(f"{n}-", add_special_tokens=False).input_ids)

keep_ids = sorted(keep_ids)
print(f"final kept vocab size: {len(keep_ids)} (of {len(tok)})")

old_to_new = {old: new for new, old in enumerate(keep_ids)}
fallback_new_id = old_to_new.get(tok.unk_token_id, 0)

model = AutoModelForSequenceClassification.from_pretrained(MODEL_ID, num_labels=2, dtype=torch.float32)
old_embed = model.deberta.embeddings.word_embeddings.weight.data
hidden = old_embed.shape[1]
new_embed = torch.zeros(len(keep_ids), hidden)
for old_id, new_id in old_to_new.items():
    new_embed[new_id] = old_embed[old_id]

model.deberta.embeddings.word_embeddings = nn.Embedding(len(keep_ids), hidden)
model.deberta.embeddings.word_embeddings.weight.data = new_embed
model.config.vocab_size = len(keep_ids)

print(f"pruned embedding params: {new_embed.numel()/1e6:.2f}M (was {old_embed.numel()/1e6:.2f}M)")

model.save_pretrained(OUT_DIR)
tok.save_pretrained(OUT_DIR)
with open(f"{OUT_DIR}/vocab_remap.json", "w") as f:
    json.dump({"old_to_new": old_to_new, "fallback_new_id": fallback_new_id, "old_vocab_size": len(tok)}, f)
print(f"saved to {OUT_DIR}/")
