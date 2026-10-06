import json
import random
from categories import TRAIN_CATEGORIES, HELDOUT_CATEGORIES

random.seed(42)

GENERIC_BENIGN = [
    "the weather today is nice and sunny, going for a walk later",
    "can you help me write a poem about autumn leaves falling",
    "what's a good recipe for banana bread",
    "I'm trying to learn how to play the guitar",
    "my favorite movie genre is sci-fi",
    "let's plan a hiking trip for this weekend",
    "I just finished reading a great novel",
    "what time does the grocery store close today",
    "I need some motivation to go to the gym",
    "can you recommend a good podcast about history",
    "I'm redecorating my living room this month",
    "what's the best way to learn a new language",
    "my cat knocked a plant off the shelf again",
    "I'm trying a new coffee shop downtown tomorrow",
    "can you suggest a fun board game for family night",
    "I want to start journaling every morning",
    "what's a good beginner workout routine",
    "I'm thinking about adopting a dog soon",
    "let's brainstorm ideas for a birthday gift",
    "I love watching sunsets at the beach",
]


def build_pairs():
    pairs = []  # (message, claim, label, split, source_category)

    # same-category positives/negatives
    for cat in TRAIN_CATEGORIES:
        for msg in cat["positives"]:
            pairs.append((msg, cat["claim"], 1, "train", cat["id"]))
        for msg in cat["negatives"]:
            pairs.append((msg, cat["claim"], 0, "train", cat["id"]))

    # cross-category negatives: a positive example from one category paired
    # with another category's claim should NOT match (teaches specificity)
    all_positives = [(msg, cat["id"]) for cat in TRAIN_CATEGORIES for msg in cat["positives"]]
    for msg, own_id in all_positives:
        other_cats = [c for c in TRAIN_CATEGORIES if c["id"] != own_id]
        for other in random.sample(other_cats, 2):
            pairs.append((msg, other["claim"], 0, "train", f"{own_id}_vs_{other['id']}"))

    # generic benign negatives against random training claims
    for msg in GENERIC_BENIGN:
        for cat in random.sample(TRAIN_CATEGORIES, 3):
            pairs.append((msg, cat["claim"], 0, "train", f"generic_vs_{cat['id']}"))

    # held-out eval set: same-category pairs only (no cross-contamination into train)
    eval_pairs = []
    for cat in HELDOUT_CATEGORIES:
        for msg in cat["positives"]:
            eval_pairs.append((msg, cat["claim"], 1, "eval", cat["id"]))
        for msg in cat["negatives"]:
            eval_pairs.append((msg, cat["claim"], 0, "eval", cat["id"]))
        # cross held-out categories too, for specificity testing on novel claims
        other_cats = [c for c in HELDOUT_CATEGORIES if c["id"] != cat["id"]]
        for msg in cat["positives"][:2]:
            other = random.choice(other_cats)
            eval_pairs.append((msg, other["claim"], 0, "eval", f"{cat['id']}_vs_{other['id']}"))
    # generic benign negatives against held-out claims too
    for msg in GENERIC_BENIGN:
        cat = random.choice(HELDOUT_CATEGORIES)
        eval_pairs.append((msg, cat["claim"], 0, "eval", f"generic_vs_{cat['id']}"))

    random.shuffle(pairs)
    random.shuffle(eval_pairs)
    return pairs, eval_pairs


if __name__ == "__main__":
    train_pairs, eval_pairs = build_pairs()

    with open("train.jsonl", "w", encoding="utf-8") as f:
        for msg, claim, label, split, src in train_pairs:
            f.write(json.dumps({"text": msg, "claim": claim, "label": label, "source": src}) + "\n")

    with open("eval_heldout.jsonl", "w", encoding="utf-8") as f:
        for msg, claim, label, split, src in eval_pairs:
            f.write(json.dumps({"text": msg, "claim": claim, "label": label, "source": src}) + "\n")

    n_pos = sum(1 for p in train_pairs if p[2] == 1)
    n_neg = sum(1 for p in train_pairs if p[2] == 0)
    e_pos = sum(1 for p in eval_pairs if p[2] == 1)
    e_neg = sum(1 for p in eval_pairs if p[2] == 0)
    print(f"train.jsonl: {len(train_pairs)} pairs ({n_pos} positive, {n_neg} negative)")
    print(f"eval_heldout.jsonl: {len(eval_pairs)} pairs ({e_pos} positive, {e_neg} negative)")
    print(f"train categories: {len(TRAIN_CATEGORIES)}, held-out categories: {len(HELDOUT_CATEGORIES)}")
