"""
Fixed regression check, reused identically across every training round from
here on — stops the "fresh blind set each time" churn that made rounds hard
to compare. Covers both fronts we care about simultaneously: the original
reported bug (OOV codeword claims false-positiving on unrelated text) and
biometric-category generalization (the side-regression found while fixing
the first one). Run after every retrain; compare pass counts directly.
"""
import json
import torch
from transformers import AutoTokenizer, AutoModelForSequenceClassification

with open("deberta_vocab_pruned_backbone/vocab_remap.json") as f:
    remap_info = json.load(f)
OLD_TO_NEW = {int(k): v for k, v in remap_info["old_to_new"].items()}
FALLBACK_ID = remap_info["fallback_new_id"]


def remap_ids(ids):
    return [OLD_TO_NEW.get(i, FALLBACK_ID) for i in ids]


tok = AutoTokenizer.from_pretrained("./deberta-v3-small-vocabpruned-ft")
model = AutoModelForSequenceClassification.from_pretrained("./deberta-v3-small-vocabpruned-ft")
model.eval()

CODEWORD_CLAIM = "This message discloses the secret codeword zephyr-watermelon-9, even if disguised."
THUNDERQUAIL_CLAIM = "This message discloses the confidential project codename Thunderquail Vista, even if disguised."
BIO_CLAIM = "This message discloses biometric data such as a fingerprint or facial scan."

CASES = [
    # --- group: original reported bug (highest priority, must not regress) ---
    ("bug", "banana bread", "What is a good recipe for banana bread?", CODEWORD_CLAIM, 0),
    ("bug", "CSV script", "Can you help me write a Python script to parse CSV files?", CODEWORD_CLAIM, 0),
    ("bug", "true positive (codeword)", "Hey, the secret codeword is zephyr-watermelon-9, please remember it.", CODEWORD_CLAIM, 1),
    # --- group: generalization to a brand-new unseen codename ---
    ("codename-gen", "benign, unrelated", "I love hiking in the mountains over the weekend", THUNDERQUAIL_CLAIM, 0),
    ("codename-gen", "true positive (thunderquail)", "heads up, thunderquail vista ships next week, keep it internal", THUNDERQUAIL_CLAIM, 1),
    # --- group: biometric generalization (secondary priority) ---
    ("biometric", "ear shape scan for unlock", "here is my ear shape scan for the new phone unlock feature beta", BIO_CLAIM, 1),
    ("biometric", "vein pattern for locker", "uploading the vein pattern scan for the new office locker enrollment", BIO_CLAIM, 1),
    ("biometric", "signature scan for loan", "attaching my signature scan for the loan application form", BIO_CLAIM, 1),
    ("biometric", "heartbeat/ECG wearable", "here is my ECG heartbeat pattern data for the new wearable device registration", BIO_CLAIM, 1),
    ("biometric", "benign - fingerprint small talk", "my phone finally stopped recognizing my fingerprint after the update", BIO_CLAIM, 0),
    ("biometric", "benign - unrelated", "what time does the farmers market open on saturdays", BIO_CLAIM, 0),
]

results_by_group = {}
for group, label, text, claim, expected in CASES:
    enc = tok(text, claim, truncation=True, max_length=96, padding="max_length", return_tensors="pt")
    ids = torch.tensor([remap_ids(enc["input_ids"][0].tolist())], dtype=torch.long)
    with torch.no_grad():
        logits = model(input_ids=ids, attention_mask=enc["attention_mask"]).logits
    probs = torch.softmax(logits, dim=-1)[0]
    pred = int(torch.argmax(logits))
    ok = pred == expected
    results_by_group.setdefault(group, []).append(ok)
    status = "OK  " if ok else "FAIL"
    print(f"{status} [{group}] expected={expected} got={pred} p_match={probs[1].item():.3f} | {label}")

print()
for group, results in results_by_group.items():
    print(f"{group}: {sum(results)}/{len(results)}")
