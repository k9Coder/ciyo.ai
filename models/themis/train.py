import json
import torch
from torch.utils.data import Dataset, DataLoader
from transformers import AutoTokenizer, AutoModelForSequenceClassification, get_linear_schedule_with_warmup
from sklearn.metrics import precision_recall_fscore_support, accuracy_score
import collections
import copy
import random

BACKBONE_DIR = "deberta_vocab_pruned_backbone"
device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
print("device:", device)
random.seed(11)

with open(f"{BACKBONE_DIR}/vocab_remap.json") as f:
    remap_info = json.load(f)
OLD_TO_NEW = {int(k): v for k, v in remap_info["old_to_new"].items()}
FALLBACK_ID = remap_info["fallback_new_id"]
print(f"vocab remap: {len(OLD_TO_NEW)} kept tokens, fallback={FALLBACK_ID}")


def remap_ids(ids):
    return [OLD_TO_NEW.get(i, FALLBACK_ID) for i in ids]


def load_jsonl(path):
    rows = []
    with open(path, encoding="utf-8") as f:
        for line in f:
            rows.append(json.loads(line))
    return rows


all_train_rows = load_jsonl("train.jsonl")
heldout_rows = load_jsonl("eval_heldout.jsonl")
random.shuffle(all_train_rows)
val_size = int(0.15 * len(all_train_rows))
val_rows = all_train_rows[:val_size]
train_rows = all_train_rows[val_size:]
print(f"train={len(train_rows)} val={len(val_rows)} heldout={len(heldout_rows)}")

tokenizer = AutoTokenizer.from_pretrained(BACKBONE_DIR)


class PairDataset(Dataset):
    def __init__(self, rows):
        self.rows = rows

    def __len__(self):
        return len(self.rows)

    def __getitem__(self, idx):
        r = self.rows[idx]
        enc = tokenizer(r["text"], r["claim"], truncation=True, max_length=96, padding="max_length", return_tensors="pt")
        ids = remap_ids(enc["input_ids"][0].tolist())
        return {
            "input_ids": torch.tensor(ids, dtype=torch.long),
            "attention_mask": enc["attention_mask"][0],
            "label": torch.tensor(r["label"], dtype=torch.long),
        }


train_ds = PairDataset(train_rows)
val_ds = PairDataset(val_rows)
heldout_ds = PairDataset(heldout_rows)

n_match = sum(r["label"] for r in train_rows)
n_no_match = len(train_rows) - n_match
weight = torch.tensor([1.0, n_no_match / n_match], dtype=torch.float32).to(device)
print(f"class weights: no_match=1.0 match={weight[1].item():.2f}")

model = AutoModelForSequenceClassification.from_pretrained(BACKBONE_DIR, num_labels=2, dtype=torch.float32).to(device)

EPOCHS = 15
BATCH_SIZE = 16
train_loader = DataLoader(train_ds, batch_size=BATCH_SIZE, shuffle=True)
val_loader = DataLoader(val_ds, batch_size=32)
heldout_loader = DataLoader(heldout_ds, batch_size=32)

optimizer = torch.optim.AdamW(model.parameters(), lr=2e-5, weight_decay=0.01)
total_steps = len(train_loader) * EPOCHS
scheduler = get_linear_schedule_with_warmup(optimizer, num_warmup_steps=int(0.1 * total_steps), num_training_steps=total_steps)
loss_fn = torch.nn.CrossEntropyLoss(weight=weight)


def evaluate(loader):
    model.eval()
    all_preds, all_labels = [], []
    with torch.no_grad():
        for batch in loader:
            input_ids = batch["input_ids"].to(device)
            attn = batch["attention_mask"].to(device)
            labels = batch["label"].to(device)
            logits = model(input_ids=input_ids, attention_mask=attn).logits
            preds = torch.argmax(logits, dim=-1)
            all_preds.extend(preds.cpu().tolist())
            all_labels.extend(labels.cpu().tolist())
    acc = accuracy_score(all_labels, all_preds)
    p, r, f1, _ = precision_recall_fscore_support(all_labels, all_preds, average="binary", zero_division=0)
    return acc, p, r, f1, all_preds, all_labels


best_val_f1 = -1
best_state = None
for epoch in range(EPOCHS):
    model.train()
    total_loss = 0.0
    for batch in train_loader:
        input_ids = batch["input_ids"].to(device)
        attn = batch["attention_mask"].to(device)
        labels = batch["label"].to(device)
        optimizer.zero_grad()
        logits = model(input_ids=input_ids, attention_mask=attn).logits
        loss = loss_fn(logits, labels)
        loss.backward()
        optimizer.step()
        scheduler.step()
        total_loss += loss.item()
    v_acc, v_p, v_r, v_f1, _, _ = evaluate(val_loader)
    marker = ""
    if v_f1 > best_val_f1:
        best_val_f1 = v_f1
        best_state = copy.deepcopy(model.state_dict())
        marker = " <- best"
    print(f"epoch {epoch+1}/{EPOCHS} train_loss={total_loss/len(train_loader):.4f} | VAL acc={v_acc:.3f} p={v_p:.3f} r={v_r:.3f} f1={v_f1:.3f}{marker}")

model.load_state_dict(best_state)
acc, p, r, f1, preds, labels = evaluate(heldout_loader)
print(f"\n=== FINAL HELD-OUT (best val checkpoint): acc={acc:.3f} precision={p:.3f} recall={r:.3f} f1={f1:.3f} ===\n")

per_cat = collections.defaultdict(lambda: {"correct": 0, "total": 0, "errors": []})
for row, pred in zip(heldout_rows, preds):
    cat = row["source"]
    per_cat[cat]["total"] += 1
    if pred == row["label"]:
        per_cat[cat]["correct"] += 1
    else:
        per_cat[cat]["errors"].append((row["text"], row["label"], pred))

for cat, stats in sorted(per_cat.items()):
    print(f"{cat}: {stats['correct']}/{stats['total']}")
    for text, true_label, pred in stats["errors"]:
        print(f"    WRONG: expected={true_label} got={pred} | \"{text[:70]}\"")

model.save_pretrained("./deberta-v3-small-vocabpruned-ft")
tokenizer.save_pretrained("./deberta-v3-small-vocabpruned-ft")
print("\nSaved to ./deberta-v3-small-vocabpruned-ft")
