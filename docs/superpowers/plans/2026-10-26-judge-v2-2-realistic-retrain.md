# Judge v2.2 Realistic Retrain Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Retrain the fast judge and the second opinion on realistic, rule-varied, long-message data so the confirm policy reaches ≥ 99% precision on `data/dev2` with as much recall as possible, then measure it once on a fresh test set.

**Architecture:** Four small code changes come first:
- a `custom_other` rule category plus wave-tagged training orders
- multiplied pairs (extra rules per message, labeled blind)
- an overlap guard against dev2 and test texts, plus long training examples
- a multi-window second opinion

Then two data waves written by Sonnet subagents, the existing training recipes (Gemma 270M fast, Qwen3-0.6B LoRA second), thresholds chosen on dev2, and a fresh test run once.

**Tech Stack:**
- Python 3.11, PyTorch, onnxruntime, pytest
- Node (`bench/*.mjs`, `node --test`)
- Claude Code subagents (Sonnet writers and labelers, Opus tie-break)

**Spec:** `docs/superpowers/specs/2026-10-26-judge-v2-2-realistic-retrain-design.md`

All paths below are relative to `models/judge-v2/` in the worktree `C:/Users/yarin/Documents/mykka.ai-judge-v2` (branch `feat/judge-v2-zero-cost`). Scratchpad = `C:/Users/yarin/AppData/Local/Temp/claude/c--Users-yarin-Documents-mykka-ai/13d93020-b666-421a-be92-51e2b5db463a/scratchpad`.

## Global Constraints

- Budget: the owner's current Claude plan only. No extra credit, no paid API, $0. When a subagent fails with a usage-limit error, stop dispatching, tell the owner the reset time, and resume from the files on disk after the reset (writers skip existing valid outputs).
- dev2 (`data/dev2/dev2.jsonl`), the spent test set (`data/all3/test.jsonl`) and the fresh test set are never trained on. Every training message is checked with `check_disjoint` before training.
- Held-out languages (it, nl), held-out categories (`c.heldout`) and held-out styles (`HELDOUT_STYLES`) never appear in training data.
- Owner bar: blocks must be real leaks, precision ≥ 0.99 on dev2. Recall is reported, not gated.
- Latency (v2.1 limits): short input ≤ 3 s, large input ≤ 10 s end to end. Second model RAM ≤ 700 MB. Disk: fast ≤ 150 MB, second ≤ 400 MB.
- No push, PR or publish without the owner's OK.
- Writers and labelers run on Sonnet, 4 at a time. Tie-breaks run on Opus.

## Review Focus

- A training message that is a near-copy of a dev2 or test message (same text, different whitespace or case): it must be rejected by `check_disjoint` (test in Task 4).
- A long message whose leak is far from the fast model's span: some window among the first 3 must cover it (test in Task 6).
- An invented `custom_other` rule on a held-out-language message: it must never reach training (merge drops it; test in Task 2).
- An extra-pair rule from a held-out category: it must never be paired (test in Task 3).
- A multi-window run where a second-opinion call times out: the rule must be pending, never "fine" (test in Task 6).

---

### Task 1: Re-score existing fast checkpoints on dev2 (no Claude usage)

Decides whether the earlier rule-variety and mined-data runs (rejected on the old, unrepresentative validation set) are better starting mixes.

**Files:**
- Create: `<scratchpad>/fast_dev2.py`
- Output: `artifacts/fast_candidates_dev2.json`

- [ ] **Step 1: Export each candidate**

```bash
cd models/judge-v2
for r in stage2b stage2_v3 stage2_v4; do PYTHONIOENCODING=utf-8 python -c "from pathlib import Path; from judge.export import export_model_dir; export_model_dir(Path('runs/$r'), Path('artifacts/cand_$r'), quantize='hybrid')"; done
```
Expected: `artifacts/cand_*/judge.onnx` exists for all three.

- [ ] **Step 2: Score dev2 fast-only and report AUC plus precision at each threshold**

`fast_dev2.py`:
```python
import bisect, json, sys
from pathlib import Path
from judge.data.schema import Example, read_jsonl
from judge.infer import OnnxJudge

def auc(s, y):
    P = [a for a, b in zip(s, y) if b]; N = sorted(a for a, b in zip(s, y) if not b)
    return sum(bisect.bisect_left(N, p) + 0.5 * (bisect.bisect_right(N, p) - bisect.bisect_left(N, p)) for p in P) / len(P) / len(N)

ex = read_jsonl(Path("data/dev2/dev2.jsonl"), Example)
out = {}
for d in sys.argv[1:]:
    j = OnnxJudge(Path(d)); s, y = [], []
    for e in ex:
        s += j.score(e.message, list(e.rules)); y += [int(t >= 0.5) for t in e.targets]
    out[d] = {"auc": auc(s, y)}
    print(d, round(out[d]["auc"], 3), flush=True)
Path("artifacts/fast_candidates_dev2.json").write_text(json.dumps(out, indent=1))
```
Run: `PYTHONPATH=. python <scratchpad>/fast_dev2.py artifacts/fast_spans artifacts/cand_stage2b artifacts/cand_stage2_v3 artifacts/cand_stage2_v4`
Expected: four AUC lines. `fast_spans` is about 0.831.

- [ ] **Step 3: Ledger the result and the data-mix ruling**

The highest-AUC lineage decides which older data goes into the Task 10 mix (`data/half` for final3, `data/half3` for v3, `data/half4` for v4). Append `Task 1: ... Ruling: base mix = <x> — <AUCs> — cost if wrong: weaker starting mix` to the ledger.

---

### Task 2: `custom_other` rule category and wave-tagged training orders

**Files:**
- Modify: `judge/data/catalog.py` (add one category)
- Modify: `judge/cc/orders.py` (add `train_orders`)
- Modify: `judge/pipeline.py` (add `train-orders` command)
- Test: `tests/test_cc.py`

**Interfaces:**
- Produces: `train_orders(categories, n_per_order: int, seed: int, tag: str) -> list[Order]`. These are orders only for non-held-out language × non-held-out category, plus one benign order per training language, with training styles only and ids `stable_id("order", tag, lang, cid or "benign")`.
- Produces: CLI `python -m judge.pipeline train-orders --out DIR --per-order N --seed S --tag T`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/test_cc.py`:
```python
def test_train_orders_skip_heldout_and_use_training_styles():
    from judge.cc.orders import train_orders
    from judge.data.catalog import CATEGORIES, HELDOUT_LANGUAGES, HELDOUT_STYLES
    heldout = {c.id for c in CATEGORIES if c.heldout}
    orders = train_orders(CATEGORIES, 4, 7, "wave1")
    assert orders and all(o.language not in HELDOUT_LANGUAGES for o in orders)
    assert all(o.category_id not in heldout for o in orders)
    assert all(not set(o.styles) & HELDOUT_STYLES for o in orders)
    assert any(o.category_id is None for o in orders)
    assert len({o.id for o in orders}) == len(orders)


def test_train_orders_ids_differ_between_waves():
    from judge.cc.orders import train_orders
    from judge.data.catalog import CATEGORIES
    a = {o.id for o in train_orders(CATEGORIES, 4, 7, "wave1")}
    b = {o.id for o in train_orders(CATEGORIES, 4, 7, "wave2")}
    assert not a & b


def test_custom_other_rules_are_accepted_and_trainable():
    from judge.data.catalog import CATEGORIES
    c = {x.id: x for x in CATEGORIES}["custom_other"]
    assert c.heldout is False and c.critical is False
```

- [ ] **Step 2: Run them to verify they fail**

Run: `python -m pytest tests/test_cc.py -q -k "train_orders or custom_other"`
Expected: FAIL with `ImportError: cannot import name 'train_orders'` and `KeyError: 'custom_other'`.

- [ ] **Step 3: Implement**

`judge/data/catalog.py`, append as the last `CATEGORIES` entry:
```python
    _c("custom_other", "custom", False, "a company-specific confidential item described in the rule itself"),
```
`judge/cc/orders.py`, after `pair_orders`:
```python
def train_orders(categories, n_per_order: int, seed: int, tag: str) -> list[Order]:
    """Orders for training data only: no held-out language, category or style; ids unique per wave tag."""
    rng = random.Random(seed)
    styles = sorted(set(MESSAGE_STYLES) - HELDOUT_STYLES)
    cids = [c.id for c in categories if not c.heldout] + [None]
    out = []
    for lang in LANGUAGES:
        if lang in HELDOUT_LANGUAGES:
            continue
        for cid in cids:
            n = n_per_order * 2 if cid is None else n_per_order
            out.append(Order(stable_id("order", tag, lang, cid or "benign"), "pairs", lang, cid,
                             tuple(rng.sample(styles, 3)), n, ()))
    return out
```
`judge/pipeline.py`: add
```python
def cmd_train_orders(a):
    write_orders(train_orders(CATEGORIES, a.per_order, a.seed, a.tag), a.out)
```
and the parser:
```python
    s = sub.add_parser("train-orders")
    s.add_argument("--out", type=Path, required=True)
    s.add_argument("--per-order", type=int, required=True)
    s.add_argument("--seed", type=int, default=1234)
    s.add_argument("--tag", required=True)
```
Add `"train-orders": cmd_train_orders` to `handlers` and `train_orders` to the `judge.cc.orders` import.

- [ ] **Step 4: Run the tests and the existing merge test**

Run: `python -m pytest tests/test_cc.py tests/test_pipeline.py -q`
Expected: all pass. `test_merge_drops_heldout_category_rules_from_training_messages` still passes: `custom_other` is not test-only, and held-out-language rules are still dropped by `rule_is_test_only`.

- [ ] **Step 5: Commit**

```bash
git add judge/data/catalog.py judge/cc/orders.py judge/pipeline.py tests/test_cc.py
git commit -m "feat(judge-v2): custom_other category and wave-tagged training orders"
```

---

### Task 3: Multiplied pairs (extra rules per new message)

**Files:**
- Create: `judge/data/extra.py`
- Modify: `judge/pipeline.py` (`extra-orders`, `extra-ingest`)
- Test: `tests/test_extra.py`

**Interfaces:**
- Produces: `extra_pairs(messages, rules, message_ids: set[str], per_message: int, seed: int) -> list[tuple[str, str]]`. It returns rules in the same language or English, from non-held-out categories, never a rule already paired with that message, and never a rule of the message's own category.
- Produces: CLI `extra-orders --data D --message-ids FILE --out DIR --per-message 4 --seed S`, which writes label orders plus `pairs_index.json`.
- Produces: CLI `extra-ingest --data D --orders DIR --outputs DIR`, which appends `Pair` rows and `Label(status="single")` rows to `D/pairs.jsonl` and `D/labels.jsonl`.

- [ ] **Step 1: Write the failing tests**

`tests/test_extra.py`:
```python
import json

from judge import pipeline
from judge.data.extra import extra_pairs
from judge.data.schema import Label, Message, Pair, Rule, read_jsonl, write_jsonl


def _m(i, lang="en", cat="us_ssn"):
    return Message(f"m{i}", cat, "positive", "email_draft", lang, f"text {i}", False, None, f"m{i}", "claude")


RULES = [Rule("r_ssn", "us_ssn", "en", "an SSN", "claude"), Rule("r_card", "credit_card", "en", "a card", "claude"),
         Rule("r_key", "private_key", "en", "a private key", "claude"), Rule("r_de", "password", "de", "ein Passwort", "claude"),
         Rule("r_fr", "salary_of_named_person", "fr", "un salaire", "claude")]


def test_extra_pairs_skip_heldout_own_category_and_other_languages():
    pairs = extra_pairs([_m(1)], RULES, {"m1"}, per_message=10, seed=0)
    assert {r for _, r in pairs} == {"r_card"}


def test_extra_pairs_only_for_given_messages_and_allow_english_rules_for_other_languages():
    msgs = [_m(1), _m(2, lang="de")]
    pairs = extra_pairs(msgs, RULES, {"m2"}, per_message=10, seed=0)
    assert {m for m, _ in pairs} == {"m2"} and {r for _, r in pairs} == {"r_card", "r_de"}


def test_extra_orders_and_ingest_append_pairs_and_labels(tmp_path):
    d = tmp_path / "data"; d.mkdir()
    write_jsonl(d / "messages.jsonl", [_m(1)]); write_jsonl(d / "rules.jsonl", RULES)
    write_jsonl(d / "pairs.jsonl", [Pair("p0", "m1", "r_ssn")]); write_jsonl(d / "labels.jsonl", [Label("p0", 1.0, "agreed")])
    (tmp_path / "ids.json").write_text(json.dumps(["m1"]))
    pipeline.main(["extra-orders", "--data", str(d), "--message-ids", str(tmp_path / "ids.json"),
                   "--out", str(tmp_path / "o"), "--per-message", "4", "--seed", "0"])
    order = next((tmp_path / "o").glob("order_*.json"))
    item = json.loads(order.read_text(encoding="utf-8"))["payload"][0]
    (tmp_path / "out").mkdir()
    (tmp_path / "out" / f"{order.stem}.jsonl").write_text(
        json.dumps({"pair_id": item["pair_id"], "verdict": "no_match", "confidence": 0.9}) + "\n", encoding="utf-8")
    pipeline.main(["extra-ingest", "--data", str(d), "--orders", str(tmp_path / "o"), "--outputs", str(tmp_path / "out")])
    assert len(read_jsonl(d / "pairs.jsonl", Pair)) == 2
    labels = {l.pair_id: l for l in read_jsonl(d / "labels.jsonl", Label)}
    assert abs(labels[item["pair_id"]].p_match - 0.1) < 1e-9 and labels[item["pair_id"]].status == "single"
```

- [ ] **Step 2: Run them to verify they fail**

Run: `python -m pytest tests/test_extra.py -q`
Expected: FAIL with `ModuleNotFoundError: No module named 'judge.data.extra'`.

- [ ] **Step 3: Implement**

`judge/data/extra.py`:
```python
"""Extra rules for new training messages: cheap labeled pairs that teach the judge to read the rule.

Writing a message costs far more teacher effort than labeling one more (message, rule) pair, so every new
message is re-paired with rules written for other messages and labeled blind.
"""
import random

from judge.data.catalog import CATEGORIES

HELDOUT = {c.id for c in CATEGORIES if c.heldout}


def extra_pairs(messages, rules, message_ids: set, per_message: int, seed: int) -> list[tuple[str, str]]:
    rng = random.Random(seed)
    by_lang: dict[str, list] = {}
    for r in sorted(rules, key=lambda r: r.id):
        if r.category_id not in HELDOUT:
            by_lang.setdefault(r.language, []).append(r)
    out = []
    for m in sorted(messages, key=lambda m: m.id):
        if m.id not in message_ids:
            continue
        pool = by_lang.get(m.language, []) + (by_lang.get("en", []) if m.language != "en" else [])
        pool = [r for r in pool if r.category_id != m.category_id]
        out += [(m.id, r.id) for r in rng.sample(pool, min(per_message, len(pool)))]
    return out
```
Already-paired rules are excluded at the command level. `judge/pipeline.py`:
```python
def cmd_extra_orders(a):
    msgs = read_jsonl(a.data / "messages.jsonl", Message)
    rules = read_jsonl(a.data / "rules.jsonl", Rule)
    existing = {(p.message_id, p.rule_id) for p in read_jsonl(a.data / "pairs.jsonl", Pair)}
    ids = set(json.loads(a.message_ids.read_text(encoding="utf-8")))
    text, rtext = {m.id: m.text for m in msgs}, {r.id: r.text for r in rules}
    index, items = {}, []
    for mid, rid in extra_pairs(msgs, rules, ids, a.per_message, a.seed):
        if (mid, rid) in existing:
            continue
        pid = stable_id("pair", mid, rid)
        index[pid] = [mid, rid]
        items.append({"pair_id": pid, "message": text[mid], "rule": rtext[rid]})
    write_orders(label_orders(items), a.out)
    (a.out / "pairs_index.json").write_text(json.dumps(index), encoding="utf-8")


def cmd_extra_ingest(a):
    index = json.loads((a.orders / "pairs_index.json").read_text(encoding="utf-8"))
    pairs = read_jsonl(a.data / "pairs.jsonl", Pair)
    labels = read_jsonl(a.data / "labels.jsonl", Label)
    missing = []
    for p in sorted(a.orders.glob("order_*.json")):
        order = read_order(p)
        out = a.outputs / f"{order.id}.jsonl"
        if not out.exists():
            missing.append(order.id)
            continue
        got, errors = ingest_labels(order, out)
        if errors:
            sys.exit("\n".join(errors))
        for pid, prob in got.items():
            pairs.append(Pair(pid, *index[pid]))
            labels.append(Label(pid, prob, "single"))
    if missing:
        sys.exit(f"missing outputs: {missing}")
    write_jsonl(a.data / "pairs.jsonl", _dedup(pairs))
    write_jsonl(a.data / "labels.jsonl", _dedup(labels))
```
Parsers:
```python
    s = sub.add_parser("extra-orders")
    s.add_argument("--data", type=Path, required=True)
    s.add_argument("--message-ids", type=Path, required=True)
    s.add_argument("--out", type=Path, required=True)
    s.add_argument("--per-message", type=int, default=4)
    s.add_argument("--seed", type=int, default=5)
    s = sub.add_parser("extra-ingest")
    s.add_argument("--data", type=Path, required=True)
    s.add_argument("--orders", type=Path, required=True)
    s.add_argument("--outputs", type=Path, required=True)
```
Register both in `handlers`. Import `extra_pairs` from `judge.data.extra`. Make sure `Pair`, `Label` and `write_jsonl` are imported in `pipeline.py`; add them if missing. Check that `_dedup` dedups by `.id`/`.pair_id`; if it dedups by whole value, a pair is never duplicated here anyway.

- [ ] **Step 4: Run the tests**

Run: `python -m pytest tests/test_extra.py tests/test_pipeline.py -q`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add judge/data/extra.py judge/pipeline.py tests/test_extra.py
git commit -m "feat(judge-v2): extra rule pairs for new training messages"
```

---

### Task 4: Overlap guard against dev2 and test, and long training examples

**Files:**
- Modify: `judge/data/splits.py` (add `check_disjoint`)
- Modify: `judge/pipeline.py` (`merge --forbid`, `examples --long-train-per-language`)
- Test: `tests/test_pipeline.py`

**Interfaces:**
- Produces: `check_disjoint(train_texts, forbidden_texts) -> list[str]`, which returns forbidden texts that also appear in training after lowercasing and whitespace normalization.
- Produces: `merge --forbid FILE...` (jsonl files with a `message` field). It exits non-zero listing overlaps when any non-test message overlaps.
- Produces: `examples --long-train-per-language N`, which buries N training positives per language using training-split benign fillers only.

- [ ] **Step 1: Write the failing tests**

Append to `tests/test_pipeline.py`:
```python
def test_check_disjoint_catches_case_and_whitespace_variants():
    from judge.data.splits import check_disjoint
    assert check_disjoint(["Hello   World", "other"], ["hello world", "x"]) == ["hello world"]


def test_merge_refuses_training_text_that_is_in_a_forbidden_set(tmp_path):
    import pytest
    from judge.data.schema import write_jsonl
    src = tmp_path / "src"; src.mkdir()
    m = Message("c1", "us_ssn", "positive", "email_draft", "en", "My SSN is 078-05-1120", False, 10, "c1", "claude")
    write_jsonl(src / "messages.jsonl", [m]); write_jsonl(src / "rules.jsonl", [])
    write_jsonl(src / "pairs.jsonl", []); write_jsonl(src / "labels.jsonl", [])
    forbid = tmp_path / "dev.jsonl"
    forbid.write_text(json.dumps({"message": "my ssn is  078-05-1120"}) + "\n", encoding="utf-8")
    with pytest.raises(SystemExit):
        pipeline.main(["merge", "--inputs", str(src), "--out", str(tmp_path / "out"), "--forbid", str(forbid)])


def test_examples_appends_long_training_messages(tmp_path):
    from judge.data.schema import write_jsonl
    msgs = [Message("c1", "us_ssn", "positive", "email_draft", "en", "ssn 078-05-1120", False, 4, "c1", "claude")]
    msgs += [Message(f"b{i}", None, "benign", "email_draft", "en", "harmless text " * 60, False, None, f"b{i}", "claude")
             for i in range(10)]
    rules = [Rule("r1", "us_ssn", "en", "discloses an SSN", "claude")]
    write_jsonl(tmp_path / "messages.jsonl", msgs); write_jsonl(tmp_path / "rules.jsonl", rules)
    write_jsonl(tmp_path / "pairs.jsonl", [Pair("pc1", "c1", "r1")])
    write_jsonl(tmp_path / "labels.jsonl", [Label("pc1", 1.0, "single")])
    (tmp_path / "splits.json").write_text(json.dumps({m.id: "train" for m in msgs}))
    pipeline.main(["examples", "--data", str(tmp_path), "--seed", "1", "--long-train-per-language", "3"])
    train = read_jsonl(tmp_path / "train.jsonl", Example)
    longs = [e for e in train if e.message_id.startswith("long_")]
    assert len(longs) == 1 and longs[0].violation_char_start >= 4000
```

- [ ] **Step 2: Run them to verify they fail**

Run: `python -m pytest tests/test_pipeline.py -q -k "disjoint or forbidden or long_training"`
Expected: FAIL. You'll see an ImportError for `check_disjoint`, and argparse `unrecognized arguments: --forbid` / `--long-train-per-language`.

- [ ] **Step 3: Implement**

`judge/data/splits.py`:
```python
def check_disjoint(train_texts, forbidden_texts) -> list[str]:
    """Forbidden (development/test) texts that also occur in training, compared case- and space-insensitively."""
    seen = {_norm(t) for t in train_texts}
    return [t for t in forbidden_texts if _norm(t) in seen]
```
`cmd_merge`, after `splits = assign_splits(msgs)`:
```python
    forbidden = [json.loads(l)["message"] for f in (a.forbid or []) for l in f.read_text(encoding="utf-8").splitlines() if l.strip()]
    clash = check_disjoint([m.text for m in msgs if splits[m.id] != "test"], forbidden)
    if clash:
        sys.exit(f"{len(clash)} development/test texts also appear in training, e.g. {clash[0][:80]!r}")
```
Parser: `s.add_argument("--forbid", type=Path, nargs="*")`. Import `check_disjoint`.

`cmd_examples`, inside the split loop after the oversampling block:
```python
        if split == "train" and a.long_train_per_language:
            train_msgs = [m for mid, m in msgs.items() if splits[mid] == "train"]
            built += build_long_examples(built, train_msgs, a.long_train_per_language, 4000, a.seed)
```
Parser: `s.add_argument("--long-train-per-language", type=int, default=0)`.

- [ ] **Step 4: Run the whole pipeline test file**

Run: `python -m pytest tests/test_pipeline.py -q`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add judge/data/splits.py judge/pipeline.py tests/test_pipeline.py
git commit -m "feat(judge-v2): overlap guard against dev/test and long training examples"
```

---

### Task 5: Second-model training windows of the runtime size

**Files:**
- Modify: `judge/window.py` docstring only (size is already a parameter)
- Create: `<scratchpad>/make_windows.py`
- Test: `tests/test_window.py`

**Interfaces:**
- Consumes: `window_examples(examples, tok, size, negatives_per_example, seed)`.
- Produces: `data/windows150/{train,val}.jsonl`, built with `size=150` from the Task 9 merged data.

- [ ] **Step 1: Write the failing test**

Append to `tests/test_window.py`, reusing that file's tokenizer fixture or helper as the other tests do:
```python
def test_window_examples_respect_runtime_size_150(tok):
    from judge.data.schema import Example
    from judge.window import window_examples
    msg = "word " * 600 + "SECRET-123 " + "word " * 600
    s = msg.index("SECRET-123")
    ex = Example("m", msg, "en", ("r",), ("a secret",), (1.0,), (True,), False, s, ((s, s + 10),))
    out = window_examples([ex], tok, size=150)
    assert out and all(len(tok.message_offsets(w.message)) <= 150 for w in out)
    assert any("SECRET-123" in w.message for w in out)
```
If `tests/test_window.py` has no `tok` fixture, use the same tokenizer construction its existing tests use.

- [ ] **Step 2: Run it**

Run: `python -m pytest tests/test_window.py -q`
Expected: PASS. `size` is already honoured, so this test pins the runtime size instead of driving new code. Ledger: `Task 5: Ruling: test passes first — window_examples already parameterised; the test guards the 150 contract — cost if wrong: none`.

- [ ] **Step 3: Update the docstring and write the build script**

In `judge/window.py`, change the module docstring's "about 400 tokens" to "about 150 tokens (the runtime window; see cascade.py)".
`make_windows.py`:
```python
import sys
from pathlib import Path
from judge.data.schema import Example, read_jsonl, write_jsonl
from judge.tokenize import JudgeTokenizer
from judge.window import window_examples

src, out = Path(sys.argv[1]), Path(sys.argv[2]); out.mkdir(parents=True, exist_ok=True)
tok = JudgeTokenizer.from_run_dir(Path("runs/vocab_qwen3"))
for split in ("train", "val"):
    write_jsonl(out / f"{split}.jsonl", window_examples(read_jsonl(src / f"{split}.jsonl", Example), tok, size=150, seed=0))
```
Before running it, open how `data/windows` was built in the v2.1 ledger (Task 13 Steps 1-2) and use the same tokenizer constructor; adjust the import line to match.

- [ ] **Step 4: Commit**

```bash
git add judge/window.py tests/test_window.py
git commit -m "test(judge-v2): pin second-opinion training windows to the 150-token runtime size"
```

---

### Task 6: Multi-window second opinion (Python and JS)

**Files:**
- Modify: `judge/cascade.py`
- Modify: `bench/cascade.mjs`
- Modify: `judge/evaluate/run_cascade_eval.py` (`load_policy` passes `max_windows`)
- Test: `tests/test_cascade.py`, `bench/cascade.test.mjs`, `tests/test_run_cascade_eval.py`

**Interfaces:**
- Produces: `Cascade(..., max_windows: int = 1)` and `Cascade._windows(message, span) -> list[tuple[int, int]]`. The first window is centred on the span; the rest tile the message left to right, skipping tiles that overlap the first by more than half; at most `max_windows`.
- Produces: under confirm, a rule is violated if any window's second score ≥ `second_min`, and windows run in order with the first confirm stopping the loop. Any failed or timed-out call before a confirm makes the rule pending.
- Produces: JS `createCascade({..., maxWindows = 1})` with the same behaviour.
- Produces: `load_policy` returns `max_windows` when the policy file has it.

- [ ] **Step 1: Write the failing Python tests**

Append to `tests/test_cascade.py`:
```python
from judge.cascade import Confirm


class Spy:
    def __init__(self, hit):
        self.hit, self.calls = hit, []

    def score_with_spans(self, message, rules):
        self.calls.append(message)
        return [(0.99, (0, 3)) if self.hit in message else (0.01, None)]


def test_second_window_far_from_fast_span_can_confirm():
    msg = "a" * 2000 + "LEAK" + "b" * 2000
    fast = Fake({"A": (0.95, (10, 20))})
    spy = Spy("LEAK")
    r = Cascade(fast, spy, window_tokens=150, confirm=Confirm(0.7, 0.7), max_windows=8).judge(msg, [RULES[0]])
    assert r["rules"][0]["violated"] is True and len(spy.calls) >= 2
    s = r["rules"][0]["span"]
    assert msg[s["start"]:s["end"]] == "LEA"


def test_windows_stop_at_first_confirm_and_cap_at_max():
    msg = "LEAK" + "x" * 5000
    spy = Spy("LEAK")
    Cascade(Fake({"A": (0.95, (0, 4))}), spy, window_tokens=150, confirm=Confirm(0.7, 0.7), max_windows=3).judge(msg, [RULES[0]])
    assert len(spy.calls) == 1
    spy2 = Spy("NOPE")
    Cascade(Fake({"A": (0.95, (0, 4))}), spy2, window_tokens=150, confirm=Confirm(0.7, 0.7), max_windows=3).judge(msg, [RULES[0]])
    assert len(spy2.calls) == 3


def test_timeout_in_any_window_before_a_confirm_is_pending():
    class SlowSecond:
        n = 0

        def score_with_spans(self, message, rules):
            SlowSecond.n += 1
            if SlowSecond.n == 2:
                time.sleep(0.3)
            return [(0.01, None)]

    msg = "x" * 5000
    r = Cascade(Fake({"A": (0.95, (0, 4))}), SlowSecond(), window_tokens=150, second_timeout_s=0.1,
                confirm=Confirm(0.7, 0.7), max_windows=3).judge(msg, [RULES[0]])
    assert r["pending"] is True and r["rules"][0]["violated"] is None
```

- [ ] **Step 2: Run them to verify they fail**

Run: `python -m pytest tests/test_cascade.py -q -k "window or timeout_in_any"`
Expected: FAIL with `TypeError: Cascade.__init__() got an unexpected keyword argument 'max_windows'`.

- [ ] **Step 3: Implement in Python**

`judge/cascade.py`: add `max_windows: int = 1` to `__init__` and store it as `self.max_windows`. Add:
```python
    def _windows(self, message: str, span) -> list[tuple[int, int]]:
        first = self._window(message, span)
        out, w = [first], self.window_chars
        if len(message) <= w:
            return out
        for a in range(0, len(message), w):
            b = min(a + w, len(message))
            overlap = max(0, min(b, first[1]) - max(a, first[0]))
            if overlap <= w // 2:
                out.append((a, b))
        return out[:self.max_windows]

    def _second_any(self, message: str, rule: str, span):
        best = (0.0, None)
        for a, b in self._windows(message, span):
            future = self.pool.submit(self.second.score_with_spans, message[a:b], [rule])
            p, s = future.result(timeout=self.timeout)[0]
            s = None if s is None else (s[0] + a, s[1] + a)
            if p >= self.confirm.second_min:
                return p, s
            best = max(best, (p, s), key=lambda x: x[0])
        return best
```
In the confirm branch of `judge`, replace `p2, span2 = self._second(message, r["text"], span)` with `p2, span2 = self._second_any(message, r["text"], span)`. The existing exception handler already makes a timeout pending. With `max_windows=1` the behaviour equals v2.1.

- [ ] **Step 4: Run the Python tests**

Run: `python -m pytest tests/test_cascade.py -q`
Expected: all pass, old tests included.

- [ ] **Step 5: Write the failing JS test**

Append to `bench/cascade.test.mjs`:
```javascript
test("confirm policy checks further windows on long messages", async () => {
  const msg = "a".repeat(2000) + "LEAK" + "b".repeat(2000);
  const calls = [];
  const second = { scoreWithSpans: async (m) => { calls.push(m); return [m.includes("LEAK") ? { p: 0.99, span: [0, 3] } : { p: 0.01, span: null }]; } };
  const fast = { scoreWithSpans: async () => [{ p: 0.95, span: [10, 20] }] };
  const r = await createCascade({ fast, second, windowTokens: 150, maxWindows: 8, confirm: { fastMin: 0.7, secondMin: 0.7 } })
    .judge(msg, [{ id: "a", text: "A" }]);
  assert.equal(r.rules[0].violated, true); assert.ok(calls.length >= 2);
  assert.equal(r.rules[0].span.text, "LEA");
});
```
Run: `node --test bench/cascade.test.mjs`
Expected: FAIL. `violated` is false because only one window is checked.

- [ ] **Step 6: Implement in JS**

In `bench/cascade.mjs`, add `maxWindows = 1` to the options and:
```javascript
  function windowsFor(message, span) {
    const first = windowFor(message, span);
    const out = [first];
    if (message.length <= windowChars) return out;
    for (let a = 0; a < message.length; a += windowChars) {
      const b = Math.min(a + windowChars, message.length);
      const overlap = Math.max(0, Math.min(b, first[1]) - Math.max(a, first[0]));
      if (overlap <= Math.floor(windowChars / 2)) out.push([a, b]);
    }
    return out.slice(0, maxWindows);
  }
```
In the confirm branch, replace the single-window call with:
```javascript
          let best = { p: 0, span: null }, hit = null;
          for (const [a, b] of windowsFor(message, span)) {
            const [res] = await withTimeout(scorer.scoreWithSpans(message.slice(a, b), [rules[i].text]));
            const s = res.span ? [res.span[0] + a, res.span[1] + a] : null;
            if (res.p >= confirm.secondMin) { hit = { p: res.p, span: s ?? span }; break; }
            if (res.p > best.p) best = { p: res.p, span: s };
          }
          const out = hit ?? best;
          entries.push(entry(message, rules[i].id, hit !== null, out.p, out.span));
```

- [ ] **Step 7: Run the JS tests**

Run: `node --test bench/`
Expected: all pass.

- [ ] **Step 8: Policy file passes max_windows (TDD)**

Append to `tests/test_run_cascade_eval.py`:
```python
def test_policy_file_passes_max_windows(tmp_path):
    from judge.cascade import Confirm
    from judge.evaluate.run_cascade_eval import load_policy
    p = tmp_path / "policy.json"
    p.write_text('{"policy": "confirm", "fast_min": 0.7, "second_min": 0.6, "window_tokens": 150, "max_windows": 3}')
    assert load_policy(p) == {"confirm": Confirm(0.7, 0.6), "window_tokens": 150, "max_windows": 3}
```
Run it and see it fail (the dict has no `max_windows`). In `load_policy` add `if "max_windows" in d: out["max_windows"] = d["max_windows"]`. Run it and see it pass.

- [ ] **Step 9: Full suite and commit**

Run: `python -m pytest -q -m "not slow"`
Expected: all pass.
```bash
git add judge/cascade.py bench/cascade.mjs judge/evaluate/run_cascade_eval.py tests/test_cascade.py bench/cascade.test.mjs tests/test_run_cascade_eval.py
git commit -m "feat(judge-v2): multi-window second opinion for long messages"
```

---

### Task 7: Wave 1 messages (Sonnet writers)

**Files:**
- Create: `<scratchpad>/TRAIN_WRITE_PROMPT.md`
- Output: `data/w1/{orders,batches,out}`

- [ ] **Step 1: Orders and batches**

```bash
python -m judge.pipeline train-orders --out data/w1/orders --per-order 4 --seed 3101 --tag wave1
```
Then write `data/w1/batches/batch_NN.txt` with 10 orders per batch, in the dev2 format (`<order abs path> -> <out abs path>`), using the same one-liner used for dev2.
Expected: 9 languages × 49 categories, plus 9 benign orders of 8: about 1,836 messages, about 46 batches.

- [ ] **Step 2: Writer prompt**

`TRAIN_WRITE_PROMPT.md` is `DEV2_WRITE_PROMPT.md` with the batch path changed to `data/w1/batches/batch_<BATCH>.txt`, the helper suffix `_w1<BATCH>`, and these extra bullets:
- Mix per order: about half `positive` and half `hard_negative`. Hard negatives look risky but disclose nothing the category describes. They only discuss or ask about the topic, show masked or placeholder values, quote the policy, or contain sensitive data of a different kind.
- Every message's `rules` include one invented company-specific rule with category `custom_other`, written the way that company's admin would write it, such as "Never share details of the Q3 hiring freeze" or "Block any mention of Project Lantern's launch date". About a third of these invented rules are satisfied by the message.
- Rule categories must not be any of: national_id_non_us, date_of_birth_with_name, private_key, prescription_record, performance_review, m_and_a, internal_infrastructure.
- Never write in Italian or Dutch.

- [ ] **Step 3: Dispatch**

Run 4 Sonnet subagents at a time with the prompt `BATCH = NN. Read and follow <scratchpad>/TRAIN_WRITE_PROMPT.md exactly, substituting <BATCH> with NN.` Start a new one as each finishes. On a usage-limit failure, stop, tell the owner the reset time, and resume later. Writers skip valid existing outputs; run the dev2 validity check first and delete partial files.

- [ ] **Step 4: Ingest**

Run: `python -m judge.pipeline cc-ingest --orders data/w1/orders --outputs data/w1/out --out data/w1/ing`
Expected: `ingest_report.json` shows `missing_outputs: []` and `errors: []`. Spot-check 3 files for length mix and realism. Ledger the counts.

---

### Task 8: Wave 1 labels (blind second pass, extra pairs, tie-break)

**Files:**
- Output: `data/w1/ing/{pairs,labels}.jsonl` updated

- [ ] **Step 1: Extra pairs**

```bash
python -c "import json; from pathlib import Path; from judge.data.schema import Message, read_jsonl; json.dump([m.id for m in read_jsonl(Path('data/w1/ing/messages.jsonl'), Message) if m.polarity != 'benign'], open('data/w1/ids.json', 'w'))"
python -m judge.pipeline extra-orders --data data/w1/ing --message-ids data/w1/ids.json --out data/w1/extra_orders --per-message 4 --seed 3102
```
Expected: about 1,750 × 4 = 7,000 pairs, so about 175 orders.

- [ ] **Step 2: Label the extra pairs (Sonnet, blind)**

Batch them 8 orders per file (`data/w1/label_batches/xb_NN.txt`). Use `DEV2_LABEL_PROMPT.md` with the batch path and suffix swapped. Dispatch 4 at a time. Then:
`python -m judge.pipeline extra-ingest --data data/w1/ing --orders data/w1/extra_orders --outputs data/w1/extra_out`

- [ ] **Step 3: Blind second pass on the writers' own pairs, only where needed**

Write `data/w1/ing/splits.json` with every message set to `"train"`. `label-orders` then picks only low-confidence writer labels (`needs_second_pass`). Run `label-orders`, label them (Sonnet), run `label-ingest`. Send disagreements to the Opus tie-break as in dev2 (`status="resolved"`, using a script like `<scratchpad>/build_dev2.py` but writing `labels.jsonl` back).

- [ ] **Step 4: Ledger**

Record pair counts, agreement rate and tie-break count.

---

### Task 9: Merge, guard and build training data (after wave 1, again after wave 2)

**Files:**
- Output: `data/all4/`, `data/mix4/`, `data/windows150/`

- [ ] **Step 1: Merge with the overlap guard**

```bash
python -c "import json; from pathlib import Path; from judge.data.schema import Example, read_jsonl; [open(f'data/forbid_{n}.jsonl','w',encoding='utf-8').writelines(json.dumps({'message': e.message}, ensure_ascii=False)+'\n' for e in read_jsonl(Path(p), Example)) for n, p in (('dev2','data/dev2/dev2.jsonl'), ('test1','data/all3/test.jsonl'))]"
python -m judge.pipeline merge --inputs data/all3 data/w1/ing --out data/all4 --forbid data/forbid_dev2.jsonl data/forbid_test1.jsonl
cp data/all3/human_labels.json data/all4/
```
Expected: exit 0, plus a `merge_report.json` with the dropped held-out pairs. After wave 2, add `data/w2/ing` to `--inputs` and `data/forbid_test2.jsonl` (from Task 13) to `--forbid`.

- [ ] **Step 2: Examples**

`python -m judge.pipeline examples --data data/all4 --oversample-claude 4 --long-per-language 12 --long-train-per-language 40 --seed 1234`
Expected: `train.jsonl` grows by the new messages × 4 plus about 360 long training examples. `test.jsonl` is unchanged.

- [ ] **Step 3: Training mix**

Create `data/mix4` using `pipeline subset` with the base mix chosen in Task 1 (`--extra-examples` pointing at the new examples). Copy `data/dev2/dev2.jsonl` to `data/mix4/val.jsonl`: validation during training now uses the representative set (dev only, never trained on). Ledger: `Task 9: Ruling: training validation = dev2 — matches the test distribution — cost if wrong: checkpoint selection overfits dev2 slightly; the fresh test catches it`.

- [ ] **Step 4: Windows for the second model**

`PYTHONPATH=. python <scratchpad>/make_windows.py data/mix4 data/windows150`
Expected: train and val files. Spot-check that window lengths are ≤ 150 tokens.

---

### Task 10: Retrain the fast model

- [ ] **Step 1: Train**

```bash
python -m judge.train.train --init-from runs/stage1 --data data/mix4 --out runs/stage2_v5 --precision fp32 --grad-checkpointing --max-tokens 3072 --epochs 2 --lr 2e-5 --grad-accum 16 --eval-every 500 > runs/stage2_v5.log 2>&1
```
Run it in the background with the keep-awake helper tied to the trainer PID (`<scratchpad>/keepawake.ps1`).
Expected: `done: steps=...` in the log.

- [ ] **Step 2: Span head only**

```bash
python -m judge.train.train --init-from runs/stage2_v5 --data data/mix4 --out runs/fast_v5 --precision fp32 --max-tokens 3072 --epochs 1 --lr 1e-3 --warmup 50 --grad-accum 16 --eval-every 100000 --span-only > runs/fast_v5.log 2>&1
```

- [ ] **Step 3: Export, calibrate, compare**

```bash
python -c "from pathlib import Path; from judge.export import export_model_dir; export_model_dir(Path('runs/fast_v5'), Path('artifacts/fast_v5'), quantize='hybrid')"
python -m judge.train.calibrate --model-dir artifacts/fast_v5 --data data/mix4
PYTHONPATH=. python <scratchpad>/fast_dev2.py artifacts/fast_spans artifacts/fast_v5
```
Expected: the new model's dev2 AUC is above 0.831 and its size is ≤ 150 MB. If the AUC isn't higher, ledger it and continue anyway (wave 2 adds data), but tell the owner at the wave-1 progress note.

---

### Task 11: Retrain the second model

- [ ] **Step 1: Train**

```bash
python -m judge.train.train --base Qwen/Qwen3-0.6B --pruned-tokenizer runs/vocab_qwen3 --data data/windows150 --out runs/so_v5 --precision fp32 --grad-checkpointing --max-tokens 320 --epochs 1 --lora-rank 16 --frozen-fp16 --lr 2e-4 --warmup 100 --grad-accum 16 --eval-every 100000 --span-weight 0.5 > runs/so_v5.log 2>&1
```
`--max-tokens 320` is rule plus prompt plus a 150-token window. Check that the log's `skipped_long` is 0; if not, raise it to 384.

- [ ] **Step 2: Export 4-bit and calibrate**

```bash
python -c "from pathlib import Path; from judge.export import export_model_dir; export_model_dir(Path('runs/so_v5'), Path('artifacts/so_v5'), quantize='4bit')"
python -m judge.train.calibrate --model-dir artifacts/so_v5 --data data/windows150
```
Expected: about 301 MB, and a temperature is printed.

---

### Task 12: Thresholds and whole-system check on dev2

- [ ] **Step 1: Score dev2 with the new pair**

Point `<scratchpad>/score_dev2.py` at `artifacts/fast_v5` / `artifacts/so_v5`, with `max_windows=3`: replace the single-window call with `cut._windows` and keep the max `p2` over windows, stopping early like the cascade. Write `artifacts/dev2_scores_v5.json`.

- [ ] **Step 2: Choose thresholds**

`choose_confirm` at 0.99, 0.98 and 0.95. Write `artifacts/policy.json` with the 0.99 point plus `"window_tokens": 150, "max_windows": 3, "chosen_on": "dev2"`.
Expected: dev2 recall at 0.99 is well above the 0.002 baseline. If it's under 0.30 after wave 2, stop here and report to the owner (spec).

- [ ] **Step 3: Whole-system run on dev2**

```bash
python -m judge.evaluate.run_cascade_eval --fast artifacts/fast_v5 --second artifacts/so_v5 --policy artifacts/policy.json --examples data/dev2/dev2.jsonl --out artifacts/dev2_report_v5.json --log runs/eval_log.jsonl
```
Expected: the precision gate passes.

- [ ] **Step 4: Latency and RAM**

Re-run `<scratchpad>/so_probe.mjs` against `artifacts/so_v5` for 150-token windows. Time the whole cascade natively on the 1000-token / 10-rule input with 3 windows on one flagged rule. Expected: ≤ 10 s large, ≤ 3 s short, second-model RSS ≤ 700 MB. Ledger the numbers.

- [ ] **Step 5: Wave-1 progress note to the owner**

A short tl;dr in plain words: what changed on dev2 versus the baseline. Then start wave 2 (Task 7 to Task 12 again, with tag `wave2`, seeds 3201/3202, output `data/w2`, run names `_v6`). No approval is needed (owner chose B) unless a stop condition fired.

---

### Task 13: Fresh test set, single run, report

- [ ] **Step 1: Generate the fresh test set (dev2 recipe, new seed)**

Run the dev2 order script with `random.Random(2027)`, `pair_orders(CATEGORIES, 4, 2027)`, ids tagged `test2` / `test2style` / `test2benign`, output `data/test2`. Write it, label it blind, tie-break it, and build it with `<scratchpad>/build_dev2.py` paths switched to `data/test2` (output `data/test2/test2.jsonl`). Check: 0 overlap with all training data, dev2 and test1, using `check_disjoint`. Do this before wave 2's merge, so `data/forbid_test2.jsonl` exists for the Task 9 guard.

- [ ] **Step 2: Single run**

```bash
python -m judge.evaluate.run_cascade_eval --fast artifacts/fast_v6 --second artifacts/so_v6 --policy artifacts/policy.json --examples data/test2/test2.jsonl --out artifacts/test2_report.json --log runs/eval_log.jsonl
```
Run it once. Report honestly whatever comes out.

- [ ] **Step 3: README and commit**

Add a "v2.2 results" section to `README.md` covering: dev2 and test2 precision and recall, long-message recall, latency, sizes, and the data recipe.
```bash
git add README.md
git commit -m "docs(judge-v2): v2.2 realistic retrain results"
```

- [ ] **Step 4: Final review and handoff**

Run the whole-branch review (fresh reviewer, most capable model), then the rulings list to the owner, then superpowers:finishing-a-development-branch. No push without the owner's OK.
