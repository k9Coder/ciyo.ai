"""
Diagnostic, not part of the shipping pipeline: fine-tune on the exact same
train/eval data but WITHOUT vocabulary pruning, to isolate whether the
"rare term in the claim causes false positives on unrelated content" bug
is caused by vocab pruning specifically, or is a deeper small-model
limitation that pruning didn't create and un-pruning won't fix.
"""
import json
import torch
from torch.utils.data import Dataset, DataLoader
from transformers import AutoTokenizer, AutoModelForSequenceClassification, get_linear_schedule_with_warmup
from sklearn.metrics import precision_recall_fscore_support, accuracy_score
import random

MODEL_ID = "microsoft/deberta-v3-small"
device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
print("device:", device)
SEED = 11
random.seed(SEED)
torch.manual_seed(SEED)
if torch.cuda.is_available():
    torch.cuda.manual_seed_all(SEED)


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

tokenizer = AutoTokenizer.from_pretrained(MODEL_ID)


class PairDataset(Dataset):
    def __init__(self, rows):
        self.rows = rows

    def __len__(self):
        return len(self.rows)

    def __getitem__(self, idx):
        r = self.rows[idx]
        enc = tokenizer(r["text"], r["claim"], truncation=True, max_length=96, padding="max_length", return_tensors="pt")
        return {
            "input_ids": enc["input_ids"][0],
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

model = AutoModelForSequenceClassification.from_pretrained(MODEL_ID, num_labels=2, dtype=torch.float32).to(device)

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
    f2 = (5 * p * r) / (4 * p + r) if (p + r) else 0.0
    return acc, p, r, f1, f2, all_preds, all_labels


best_val_f2 = -1
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
    v_acc, v_p, v_r, v_f1, v_f2, _, _ = evaluate(val_loader)
    marker = ""
    if v_f2 > best_val_f2:
        best_val_f2 = v_f2
        best_state = {k: v.clone() for k, v in model.state_dict().items()}
        marker = " <- best"
    print(f"epoch {epoch+1}/{EPOCHS} train_loss={total_loss/len(train_loader):.4f} | VAL acc={v_acc:.3f} p={v_p:.3f} r={v_r:.3f} f1={v_f1:.3f} f2={v_f2:.3f}{marker}")

model.load_state_dict(best_state)
acc, p, r, f1, f2, preds, labels = evaluate(heldout_loader)
print(f"\n=== FULL-VOCAB DIAGNOSTIC HELD-OUT: acc={acc:.3f} precision={p:.3f} recall={r:.3f} f1={f1:.3f} f2={f2:.3f} ===\n")

# The actual diagnostic question: does THIS specific case still fail?
model.eval()
text = "Can you help me write a Python script to parse CSV files?"
claim = "This message discloses the secret codeword zephyr-watermelon-9, even if disguised."
enc = tokenizer(text, claim, truncation=True, max_length=96, padding="max_length", return_tensors="pt")
with torch.no_grad():
    logits = model(input_ids=enc["input_ids"].to(device), attention_mask=enc["attention_mask"].to(device)).logits
probs = torch.softmax(logits, dim=-1)[0]
pred = int(torch.argmax(logits))
print(f"DIAGNOSTIC CASE (CSV script vs zephyr-watermelon-9 claim): verdict={'MATCH (wrong)' if pred == 1 else 'NO_MATCH (correct)'} p_match={probs[1].item():.3f}")

model.save_pretrained("./deberta-v3-small-FULLVOCAB-diagnostic-ft")
tokenizer.save_pretrained("./deberta-v3-small-FULLVOCAB-diagnostic-ft")
