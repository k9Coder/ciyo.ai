# Judge v2.1 (spans + second opinion) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the fast judge (`final3`) to return the offending span per rule, add a bigger second-opinion model that re-judges only uncertain rules on a ~400-token window, and expose both through one stateless JSON contract in Python and JS.

**Architecture:** The fast model keeps its one-pass design; a span head emits per-token keys during prefill and per-rule start/end queries in the rules step (dot-product pointer). A cascade routes each rule by calibrated score into fast-fine / fast-violated / second-opinion bands; the second model (Gemma 3 1B or Qwen3 0.6B, LoRA-trained on windows, 4- or 8-bit) decides the middle band. All decisions use development sets; the test set is used once at the end.

**Tech Stack:** Python 3.11, PyTorch 2.x (CUDA, GTX 1650 4GB), transformers 5.18, peft 0.21, onnxruntime 1.30 (+ quantization), onnxruntime-node / onnxruntime-web (via the main checkout's `node_modules` junctions), pytest, `node --test`.

**Spec:** `docs/superpowers/specs/2026-10-22-judge-v2-second-opinion-design.md` (builds on `docs/superpowers/specs/2026-10-14-judge-v2-zero-cost-design.md`).

All paths below are relative to `models/judge-v2/` unless they start with `docs/`. Run Python with `PYTHONIOENCODING=utf-8` from `models/judge-v2`.

## Global Constraints

- $0 budget: no paid APIs, no rented GPUs; training on the owner's GTX 1650 (4GB); teacher labels from Claude Code subagents.
- Leaks caught (recall, whole system): at least 90%.
- False alarms (whole system): at most 1 in 20 blocks (precision 0.95); stretch 1 in 50 (0.98).
- Latency, short messages (up to ~500 tokens), including any second opinion: at most 3 s.
- Latency, large pastes: at most 10 s.
- Share of messages sent to the second opinion: at most 15%.
- Span accuracy: the returned span overlaps the true offending text in at least 90% of flagged violations.
- Fast model: at most 140 MB on disk, 400 MB RAM.
- Second-opinion model: at most 400 MB on disk, 700 MB RAM, loaded only when needed.
- Same model files run in the Chrome extension and the desktop app; fully offline after download; messages never leave the device.
- Test set used once, at the end; every threshold and model choice is made on development sets.
- Never push, publish, or rent resources without the owner's explicit OK.

## Review Focus

1. **Spans on windowed long messages** — a violation inside the second or later 4096-token window must map back to correct character offsets in the original message. Test in Task 7.
2. **Non-ASCII spans (Hebrew, Arabic, Chinese, emoji)** — offsets must cut on token boundaries and round-trip to the exact substring; JS must use UTF-16 offsets consistently with Python's documented mapping. Tests in Tasks 5 and 15.
3. **Second-opinion model missing or slow** — cascade must return `pending: true` for the uncertain rules (never silently `false`) and still return fast-model decisions for the rest. Test in Task 14.
4. **Rules whose span is unknown** (topic rules, cross-category matches) — the contract must allow `span: null` on a violated rule rather than inventing a span. Test in Task 14.
5. **Empty message or zero rules** — return `violated: false`, empty `rules`, no model calls. Test in Task 14.

---

## Phase A — Data and evaluation foundations

### Task 1: Offending-text end offsets and per-rule spans in the data model

**Files:**
- Modify: `judge/data/schema.py` (Message, Example)
- Modify: `judge/data/examples.py` (`build_examples`, `build_long_examples`)
- Test: `tests/test_pipeline.py`

**Interfaces:**
- Produces: `Message.violation_char_end: int | None = None` (last field); `Example.spans: tuple | None = None` (last field; one entry per rule: `(start, end)` char offsets or `None`).
- A rule gets a span only when its category equals the message category, its target is ≥ 0.5, and the message has both offsets.

- [ ] **Step 1: Write the failing tests**

```python
def test_build_examples_attaches_spans_only_to_same_category_matches():
    msgs = [Message("m1", "us_ssn", "positive", "code_help", "en", "my ssn 078-05-1120 ok", False, 7, "m1", "claude", 18)]
    rules = [Rule("r1", "us_ssn", "en", "discloses an SSN", "claude"),
             Rule("r2", "password", "en", "discloses a password", "claude")]
    pairs = [Pair("p1", "m1", "r1"), Pair("p2", "m1", "r2")]
    labels = [Label("p1", 0.95, "single"), Label("p2", 0.05, "single")]
    ex = build_examples(msgs, rules, pairs, labels, CATEGORIES)
    assert ex[0].spans == ((7, 18), None)


def test_long_examples_shift_spans():
    from judge.data.examples import build_long_examples
    fill = [Message(f"b{i}", None, "benign", "chat_question", "en", "filler text. " * 40, False, None, f"b{i}", "scripted")
            for i in range(20)]
    inner = Message("p1", "us_ssn", "positive", "email_draft", "en", "ssn 078-05-1120", False, 4, "p1", "claude", 15)
    ex = Example("p1", inner.text, "en", ("r1",), ("discloses an SSN",), (1.0,), (True,), False, 4, ((4, 15),))
    long = build_long_examples([ex], fill + [inner], per_language=1, min_prefix_chars=4000, seed=1)[0]
    s, e = long.spans[0]
    assert long.message[s:e] == "078-05-1120"
```

- [ ] **Step 2: Run to verify they fail**

Run: `python -m pytest -q tests/test_pipeline.py -k "spans"`
Expected: FAIL (`Message` takes no 11th argument / `Example` has no `spans`).

- [ ] **Step 3: Implement**

In `judge/data/schema.py` add `violation_char_end: int | None = None` as the last `Message` field and `spans: tuple | None = None` as the last `Example` field; add `"spans"` handling to `_TUPLE_FIELDS` by converting nested lists: replace the tuple conversion in `read_jsonl` and `_parse` with:

```python
def _convert(k, v):
    if k == "spans" and v is not None:
        return tuple(None if s is None else tuple(s) for s in v)
    return tuple(v) if k in _TUPLE_FIELDS else v
```

and use `cls(**{k: _convert(k, v) for k, v in d.items()})` in both.

In `build_examples`, after computing `rs`, add:

```python
        spans = tuple((m.violation_char_start, m.violation_char_end)
                      if (r.category_id == m.category_id and target[p.id] >= 0.5
                          and m.violation_char_start is not None and m.violation_char_end is not None) else None
                      for p, r in zip(ps, rs))
```

and pass `spans if any(spans) else None` as the new last `Example` argument.

In `build_long_examples`, shift spans with the prefix:

```python
            spans = None if e.spans is None else tuple(None if s is None else (s[0] + len(prefix), s[1] + len(prefix))
                                                         for s in e.spans)
            out.append(dataclasses.replace(e, message_id="long_" + e.message_id, message=prefix + e.message,
                                           violation_char_start=start, spans=spans))
```

- [ ] **Step 4: Run the tests and the suite**

Run: `python -m pytest -q`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add models/judge-v2/judge/data/schema.py models/judge-v2/judge/data/examples.py models/judge-v2/tests/test_pipeline.py
git commit -m "feat(judge-v2): per-rule offending-text spans in the data model"
```

### Task 2: Record end offsets at the sources and backfill existing data

**Files:**
- Modify: `judge/cc/ingest.py` (`_parse_pair_row`)
- Modify: `judge/data/scripted.py` (where positives set `violation_char_start`)
- Modify: `judge/pipeline.py` (new `backfill-spans` command)
- Test: `tests/test_cc.py`, `tests/test_scripted.py`, `tests/test_pipeline.py`

**Interfaces:**
- Consumes: Task 1 fields.
- Produces: `python -m judge.pipeline backfill-spans --data DIR --sources DIR [DIR ...]` rewrites `DIR/messages.jsonl` filling `violation_char_end` from source dirs by message id; reports `{"filled": n, "missing": m}` to `DIR/backfill_report.json`.

- [ ] **Step 1: Write the failing tests**

```python
# tests/test_cc.py
def test_ingest_records_excerpt_end(tmp_path):
    from judge.cc.ingest import ingest_pairs
    from judge.cc.orders import Order
    order = Order("o1", "pairs", "en", "us_ssn", ("email_draft",), 1, ())
    row = {"message": "my ssn 078-05-1120 ok", "polarity": "positive", "style": "email_draft", "adversarial": False,
           "violating_excerpt": "078-05-1120",
           "rules": [{"text": "discloses an SSN", "category": "us_ssn", "language": "en", "verdict": "match", "confidence": 0.9},
                     {"text": "discloses a card", "category": "credit_card", "language": "en", "verdict": "no_match", "confidence": 0.9}]}
    p = tmp_path / "o1.jsonl"; p.write_text(json.dumps(row), encoding="utf-8")
    msgs = ingest_pairs(order, p)[0]
    assert (msgs[0].violation_char_start, msgs[0].violation_char_end) == (7, 18)
```

```python
# tests/test_scripted.py
def test_generated_positive_records_span_end():
    msgs, *_ = generate([EN], per_template=1, seed=3)
    pos = [m for m in msgs if m.polarity == "positive"]
    assert pos and all(m.violation_char_end is not None and m.violation_char_end > m.violation_char_start for m in pos)
```

```python
# tests/test_pipeline.py
def test_backfill_spans_fills_end_offsets(tmp_path):
    from judge.data.schema import write_jsonl
    old = Message("m1", "us_ssn", "positive", "code_help", "en", "ssn 078-05-1120", False, 4, "m1", "claude")
    new = Message("m1", "us_ssn", "positive", "code_help", "en", "ssn 078-05-1120", False, 4, "m1", "claude", 15)
    write_jsonl(tmp_path / "all" / "messages.jsonl", [old]); write_jsonl(tmp_path / "src" / "messages.jsonl", [new])
    pipeline.main(["backfill-spans", "--data", str(tmp_path / "all"), "--sources", str(tmp_path / "src")])
    assert read_jsonl(tmp_path / "all" / "messages.jsonl", Message)[0].violation_char_end == 15
```

- [ ] **Step 2: Run to verify they fail**

Run: `python -m pytest -q tests/test_cc.py tests/test_scripted.py tests/test_pipeline.py -k "end or backfill"`
Expected: FAIL (end is `None`; unknown command `backfill-spans`).

- [ ] **Step 3: Implement**

In `_parse_pair_row`: after `start = text.index(excerpt)` set `end = start + len(excerpt)`; initialise `end = None` with `start`; pass `end` as the last `Message` argument.

In `judge/data/scripted.py`, where a positive's `[[...]]` span is resolved into `violation_char_start`, also compute the end offset of the span in the rendered text and pass it as `violation_char_end` (the rendered span text is known at that point; `end = start + len(span_text)`).

In `judge/pipeline.py`:

```python
def cmd_backfill_spans(a):
    ends = {}
    for d in a.sources:
        for m in read_jsonl(d / "messages.jsonl", Message):
            if m.violation_char_end is not None:
                ends[m.id] = m.violation_char_end
    msgs = read_jsonl(a.data / "messages.jsonl", Message)
    out = [dataclasses.replace(m, violation_char_end=ends.get(m.id, m.violation_char_end)) for m in msgs]
    write_jsonl(a.data / "messages.jsonl", out)
    need = [m for m in out if m.violation_char_start is not None]
    filled = sum(m.violation_char_end is not None for m in need)
    (a.data / "backfill_report.json").write_text(json.dumps({"filled": filled, "missing": len(need) - filled}),
                                                  encoding="utf-8")
```

Register the subparser (`--data` Path required, `--sources` Path nargs="+" required) and handler; add `import dataclasses`.

- [ ] **Step 4: Run the tests and the suite**

Run: `python -m pytest -q`
Expected: all pass.

- [ ] **Step 5: Backfill real data (git-ignored)**

```bash
python -m judge.pipeline scripted --templates templates --out data/scripted_spans --per-template <same value used for data/scripted> --seed 1234
for s in cc cc2 cc3; do python -m judge.pipeline cc-ingest --orders data/$s/orders --outputs data/$s/out --out data/${s}_spans; done
for d in all2 all3; do python -m judge.pipeline backfill-spans --data data/$d --sources data/scripted_spans data/cc_spans data/cc2_spans data/cc3_spans; cat data/$d/backfill_report.json; done
```
Expected: `missing` is 0 for both (if not, stop and investigate: a regenerated scripted message id differs).
Then rebuild examples for both:
`python -m judge.pipeline examples --data data/all2 --max-test-messages 700 --seed 1234 --long-per-language 12 --oversample-claude 4` (and the same for `data/all3`).
Expected: test files unchanged except the new `spans` field (compare message ids and targets).

- [ ] **Step 6: Commit**

```bash
git add models/judge-v2/judge/cc/ingest.py models/judge-v2/judge/data/scripted.py models/judge-v2/judge/pipeline.py models/judge-v2/tests
git commit -m "feat(judge-v2): record and backfill offending-text end offsets"
```

### Task 3: Reproducible half-data training subset

**Files:**
- Modify: `judge/pipeline.py` (new `subset` command)
- Test: `tests/test_pipeline.py`

**Interfaces:**
- Produces: `python -m judge.pipeline subset --data DIR --out DIR --claude-fraction 0.5 --seed 42 [--extra-examples FILE --extra-repeat N]` writes `OUT/train.jsonl` (all scripted lines + lines of a seeded half of Claude message ids, chosen as `random.Random(seed).sample(sorted(claude_ids), len(claude_ids) // 2)`) and copies `val.jsonl`. This reproduces `data/half` exactly from `data/all2` (the recipe of `final3`).

- [ ] **Step 1: Write the failing test**

```python
def test_subset_keeps_scripted_and_seeded_half_of_claude(tmp_path):
    from judge.data.schema import write_jsonl
    msgs = [Message(f"c{i}", "us_ssn", "positive", "email_draft", "en", f"t{i}", False, None, f"c{i}", "claude") for i in range(6)]
    msgs += [Message("s1", "us_ssn", "positive", "email_draft", "en", "s", False, None, "tmpl:a", "scripted")]
    write_jsonl(tmp_path / "messages.jsonl", msgs)
    ex = [Example(m.id, m.text, "en", ("r",), ("x",), (1.0,), (False,), False, None) for m in msgs]
    write_jsonl(tmp_path / "train.jsonl", ex); write_jsonl(tmp_path / "val.jsonl", ex[:1])
    pipeline.main(["subset", "--data", str(tmp_path), "--out", str(tmp_path / "h"), "--claude-fraction", "0.5", "--seed", "42"])
    ids = [e.message_id for e in read_jsonl(tmp_path / "h" / "train.jsonl", Example)]
    import random
    want = set(random.Random(42).sample(sorted(f"c{i}" for i in range(6)), 3))
    assert set(ids) == want | {"s1"}
```

- [ ] **Step 2: Run to verify it fails**

Run: `python -m pytest -q tests/test_pipeline.py -k subset`
Expected: FAIL (unknown command).

- [ ] **Step 3: Implement**

```python
def cmd_subset(a):
    src = {m.id: m.source for m in read_jsonl(a.data / "messages.jsonl", Message)}
    lines = [l for l in (a.data / "train.jsonl").read_text(encoding="utf-8").splitlines() if l.strip()]
    mid = lambda l: json.loads(l)["message_id"]
    claude = sorted({mid(l) for l in lines if src[mid(l)] == "claude"})
    keep = set(random.Random(a.seed).sample(claude, int(len(claude) * a.claude_fraction)))
    kept = [l for l in lines if src[mid(l)] != "claude" or mid(l) in keep]
    if a.extra_examples:
        extra = [l for l in a.extra_examples.read_text(encoding="utf-8").splitlines() if l.strip()]
        kept += extra * a.extra_repeat
    a.out.mkdir(parents=True, exist_ok=True)
    (a.out / "train.jsonl").write_text("\n".join(kept) + "\n", encoding="utf-8")
    shutil.copy2(a.data / "val.jsonl", a.out / "val.jsonl")
```

Register it (`--data`, `--out` Paths; `--claude-fraction` float default 0.5; `--seed` int default 42; `--extra-examples` Path; `--extra-repeat` int default 1); add `import shutil`. Note `int(len*0.5) == len // 2` for the reproduction.

- [ ] **Step 4: Run the tests and verify reproduction**

Run: `python -m pytest -q tests/test_pipeline.py`
Expected: all pass.
Run: `python -m judge.pipeline subset --data data/all2 --out data/half_spans --claude-fraction 0.5 --seed 42` and compare message-id multisets with `data/half/train.jsonl`.
Expected: identical multisets.

- [ ] **Step 5: Commit**

```bash
git add models/judge-v2/judge/pipeline.py models/judge-v2/tests/test_pipeline.py
git commit -m "feat(judge-v2): reproducible half-data training subset"
```

### Task 4: Cross-category development set and frontier metrics

**Files:**
- Create: `judge/data/devx.py`
- Create: `judge/evaluate/frontier.py`
- Modify: `judge/pipeline.py` (commands `devx-orders`, `devx-ingest`)
- Test: `tests/test_devx.py`, `tests/test_frontier.py`

**Interfaces:**
- Produces:
  - `devx_pairs(messages, rules, splits, per_message: int, seed: int) -> list[tuple[str, str]]` — `(message_id, rule_id)` for **val-split** Claude messages × rules of other, non-held-out categories, in the message language or English.
  - `python -m judge.pipeline devx-orders --data DIR --out DIR --per-message 6 --seed 11` writes label orders (`judge.cc.orders.label_orders` format).
  - `python -m judge.pipeline devx-ingest --data DIR --orders DIR --outputs DIR --out FILE` writes `Example`s, one per message, with the labeled rules (targets from `p_from`).
  - `frontier(rows, min_recall=0.90, min_crit_recall=0.95) -> dict` with keys `best_precision`, `threshold`, `max_f2`, `f2_threshold`; `rows` are `judge.evaluate.metrics.Row`.

- [ ] **Step 1: Write the failing tests**

```python
# tests/test_devx.py
from judge.data.devx import devx_pairs
from judge.data.schema import Message, Rule

def test_devx_pairs_use_val_claude_messages_and_other_categories():
    msgs = [Message("v1", "us_ssn", "positive", "email_draft", "en", "t", False, None, "v1", "claude"),
            Message("t1", "us_ssn", "positive", "email_draft", "en", "t", False, None, "t1", "claude")]
    rules = [Rule("r1", "us_ssn", "en", "a", "claude"), Rule("r2", "password", "en", "b", "claude"),
             Rule("r3", "private_key", "en", "c", "claude"), Rule("r4", "password", "he", "d", "claude")]
    pairs = devx_pairs(msgs, rules, {"v1": "val", "t1": "train"}, per_message=5, seed=1)
    assert pairs == [("v1", "r2")]
```

```python
# tests/test_frontier.py
from judge.evaluate.frontier import frontier
from judge.evaluate.metrics import Row

def test_frontier_finds_best_precision_meeting_recall():
    rows = [Row(0.9, 1, True, False, None), Row(0.8, 1, False, False, None), Row(0.7, 0, False, False, None),
            Row(0.6, 1, True, False, None), Row(0.2, 0, False, False, None)]
    f = frontier(rows, min_recall=0.9, min_crit_recall=0.95)
    assert f["threshold"] == 0.6 and abs(f["best_precision"] - 0.75) < 1e-9
```

- [ ] **Step 2: Run to verify they fail**

Run: `python -m pytest -q tests/test_devx.py tests/test_frontier.py`
Expected: FAIL (modules missing).

- [ ] **Step 3: Implement**

```python
# judge/data/devx.py
import random
from judge.data.catalog import CATEGORIES

HELDOUT = {c.id for c in CATEGORIES if c.heldout}


def devx_pairs(messages, rules, splits, per_message: int, seed: int) -> list[tuple[str, str]]:
    rng = random.Random(seed)
    by_lang: dict[str, list] = {}
    for r in rules:
        if r.category_id not in HELDOUT:
            by_lang.setdefault(r.language, []).append(r)
    out = []
    for m in sorted(messages, key=lambda m: m.id):
        if splits.get(m.id) != "val" or m.source != "claude":
            continue
        pool = [r for r in by_lang.get(m.language, []) + (by_lang.get("en", []) if m.language != "en" else [])
                if r.category_id != m.category_id]
        out += [(m.id, r.id) for r in rng.sample(pool, min(per_message, len(pool)))]
    return out
```

```python
# judge/evaluate/frontier.py
import numpy as np
from judge.evaluate.metrics import fbeta, precision, recall


def frontier(rows, min_recall: float = 0.90, min_crit_recall: float = 0.95) -> dict:
    crit = [r for r in rows if r.critical]
    best = (0.0, None)
    for t in sorted({r.p for r in rows}):
        if recall(rows, t) >= min_recall and (not crit or recall(crit, t) >= min_crit_recall):
            best = max(best, (precision(rows, t), t), key=lambda x: x[0])
    f2 = max((fbeta(rows, t), t) for t in np.linspace(0.01, 0.99, 99))
    return {"best_precision": best[0], "threshold": best[1], "max_f2": f2[0], "f2_threshold": float(f2[1])}
```

Pipeline commands: `devx-orders` loads `messages/rules/splits`, calls `devx_pairs`, builds items `{"pair_id": stable_id("pair", mid, rid), "message": text, "rule": text}` and `write_orders(label_orders(items), a.out)`; also writes `pairs_index.json` mapping pair_id → [mid, rid]. `devx-ingest` reads each order's output (`judge.cc.ingest.ingest_labels`), groups by message, and writes `Example`s with `spans=None`, `critical` from the rule's category.

- [ ] **Step 4: Run the tests**

Run: `python -m pytest -q tests/test_devx.py tests/test_frontier.py tests/test_pipeline.py`
Expected: all pass.

- [ ] **Step 5: Label the development set (subagents)**

```bash
python -m judge.pipeline devx-orders --data data/all3 --out data/devx/orders --per-message 6 --seed 11
```
Write a batch file per 4 orders under `data/devx/batches/db_NN.txt` (`<order> -> <data/devx/out/<id>.jsonl>`), and dispatch `general-purpose` Sonnet subagents with the LABEL prompt (`judge/cc/PROMPTS.md` "## LABEL", blind, per-item judgment, no keyword heuristics), up to 4 at a time. Then:
`python -m judge.pipeline devx-ingest --data data/all3 --orders data/devx/orders --outputs data/devx/out --out data/devx/devx.jsonl`
Expected: no missing outputs; report the match rate (expected well below 50%).

- [ ] **Step 6: Record baselines**

Score `artifacts/final3` on `data/all3/val.jsonl` and `data/devx/devx.jsonl` with `frontier` (Rows from `judge.evaluate.run_eval.rows_for`); write `artifacts/devsets_baseline.json`.
Expected: numbers recorded; these are the bar every later model must beat.

- [ ] **Step 7: Commit**

```bash
git add models/judge-v2/judge/data/devx.py models/judge-v2/judge/evaluate/frontier.py models/judge-v2/judge/pipeline.py models/judge-v2/tests/test_devx.py models/judge-v2/tests/test_frontier.py
git commit -m "feat(judge-v2): cross-category development set and frontier metrics"
```

## Phase B — Fast model with spans

### Task 5: Token offsets in the tokenizer

**Files:**
- Modify: `judge/tokenize.py`
- Test: `tests/test_tokenize.py`

**Interfaces:**
- Produces:
  - `JudgeTokenizer.message_offsets(text) -> list[tuple[int, int]]` — character `(start, end)` per message token, aligned 1:1 with `message_ids(text)`.
  - `char_span_to_tokens(offsets, start, end) -> tuple[int, int] | None` — first and last token index overlapping `[start, end)`; `None` if none.
  - `tokens_to_char_span(offsets, t0, t1) -> tuple[int, int]` — `(offsets[t0][0], offsets[t1][1])`.

- [ ] **Step 1: Write the failing tests**

```python
from judge.tokenize import char_span_to_tokens, tokens_to_char_span

def test_offsets_round_trip_on_non_ascii(tiny_tokenizer_dir):
    from judge.config import JudgeConfig
    from judge.tokenize import JudgeTokenizer
    tok = JudgeTokenizer.load(tiny_tokenizer_dir, JudgeConfig(model_version="t", base_model="t"))
    text = "שלום 078-05-1120 你好 🙂 ok"
    offs = tok.message_offsets(text)
    assert len(offs) == len(tok.message_ids(text))
    s = text.index("078"); e = s + len("078-05-1120")
    t0, t1 = char_span_to_tokens(offs, s, e)
    cs, ce = tokens_to_char_span(offs, t0, t1)
    assert cs <= s and ce >= e and "078-05-1120" in text[cs:ce]

def test_char_span_outside_returns_none():
    assert char_span_to_tokens([(0, 2), (2, 4)], 10, 12) is None
```

- [ ] **Step 2: Run to verify they fail**

Run: `python -m pytest -q tests/test_tokenize.py -k offsets`
Expected: FAIL (`message_offsets` missing).

- [ ] **Step 3: Implement**

```python
    def message_offsets(self, text: str) -> list[tuple[int, int]]:
        enc = self.hf(text, add_special_tokens=False, return_offsets_mapping=True)
        return [tuple(o) for o in enc["offset_mapping"]]


def char_span_to_tokens(offsets, start: int, end: int):
    hit = [i for i, (a, b) in enumerate(offsets) if a < end and b > start]
    return (hit[0], hit[-1]) if hit else None


def tokens_to_char_span(offsets, t0: int, t1: int) -> tuple[int, int]:
    return offsets[t0][0], offsets[t1][1]
```

If `message_offsets` length differs from `message_ids` for byte-fallback tokens, split the offending offset evenly is NOT allowed; instead assert equality in the test above and, if it fails on real tokenizers, map via `hf(text).word_ids`-free fallback: encode incrementally (`len(self._encode(text[:k]))`) to assign each token the char range between boundaries. Keep whichever passes the test on the real pruned tokenizer (`runs/vocab`) — add that as a second test parametrized on `runs/vocab` when present (skip otherwise).

- [ ] **Step 4: Run the tests**

Run: `python -m pytest -q tests/test_tokenize.py`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add models/judge-v2/judge/tokenize.py models/judge-v2/tests/test_tokenize.py
git commit -m "feat(judge-v2): token character offsets for spans"
```

### Task 6: Span head in the model

**Files:**
- Modify: `judge/model.py`
- Modify: every caller of `JudgeModel.forward` (`judge/train/train.py`, `judge/train/calibrate.py`, `judge/export.py`, tests)
- Test: `tests/test_model.py`

**Interfaces:**
- Produces: `JudgeModel.forward(input_ids, position_ids, attn_bias, past_k, past_v) -> (verdict_logits [1,S,2], span_key [1,S,64], span_query [1,S,128], k, v)`; `SPAN_DIM = 64`; `span_query[..., :64]` is the start query, `[..., 64:]` the end query.
- Produces: `span_scores(span_key_msg [T,64], span_query_rule [128]) -> (start_scores [T], end_scores [T])` (torch and numpy versions).
- Produces: `best_span(start, end, max_len=128) -> (t0, t1)` maximizing `start[t0] + end[t1]` with `t0 <= t1 < t0 + max_len`.
- Loading old checkpoints: `load_judge` loads with `strict=False` only for missing `span_*` weights (new heads initialised); any other missing key raises.

- [ ] **Step 1: Write the failing tests**

```python
import numpy as np, torch
from judge.model import JudgeModel, best_span, span_scores
from judge.backbone import Backbone
from tests.conftest import tiny_gemma3

def test_forward_returns_span_outputs():
    m = JudgeModel(Backbone.from_hf_model(tiny_gemma3())).eval()
    k0, v0 = m.backbone.empty_past()
    out = m(torch.zeros(1, 5, dtype=torch.long), torch.arange(5)[None], torch.zeros(1, 1, 5, 5), k0, v0)
    assert out[0].shape == (1, 5, 2) and out[1].shape == (1, 5, 64) and out[2].shape == (1, 5, 128)

def test_best_span_respects_order_and_length():
    s = np.array([0., 5., 0., 0.]); e = np.array([9., 0., 0., 4.])
    assert best_span(s, e, max_len=3) == (1, 3)
```

- [ ] **Step 2: Run to verify they fail**

Run: `python -m pytest -q tests/test_model.py`
Expected: FAIL (forward returns 3 values; `best_span` missing).

- [ ] **Step 3: Implement**

```python
SPAN_DIM = 64


class JudgeModel(nn.Module):
    def __init__(self, backbone: Backbone):
        super().__init__()
        self.backbone = backbone
        h = backbone.spec.hidden_size
        self.head = nn.Linear(h, 2)
        self.span_key = nn.Linear(h, SPAN_DIM)
        self.span_query = nn.Linear(h, 2 * SPAN_DIM)

    def forward(self, input_ids, position_ids, attn_bias, past_k, past_v):
        hidden, k, v = self.backbone(input_ids, position_ids, attn_bias, past_k, past_v)
        return self.head(hidden), self.span_key(hidden), self.span_query(hidden), k, v


def span_scores(keys, query):
    return keys @ query[:SPAN_DIM], keys @ query[SPAN_DIM:]


def best_span(start, end, max_len: int = 128) -> tuple[int, int]:
    best, arg = -float("inf"), (0, 0)
    for t0 in range(len(start)):
        seg = end[t0:t0 + max_len]
        t1 = t0 + int(np.argmax(seg))
        if start[t0] + seg[t1 - t0] > best:
            best, arg = start[t0] + seg[t1 - t0], (t0, t1)
    return arg
```

`load_judge`: `missing, unexpected = model.load_state_dict(sd, strict=False)`; raise if `unexpected` or any missing key not starting with `span_`.
Update callers: unpack `logits, _, _, k, v = model(...)` where spans are unused (calibrate, evaluate in train); the export wrapper is updated in Task 8.

- [ ] **Step 4: Run the suite**

Run: `python -m pytest -q`
Expected: all pass (callers updated).

- [ ] **Step 5: Commit**

```bash
git add models/judge-v2/judge models/judge-v2/tests
git commit -m "feat(judge-v2): pointer span head on the fast model"
```

### Task 7: Span loss in training

**Files:**
- Modify: `judge/train/train.py` (`_encode`, training loop, CLI `--span-weight`)
- Test: `tests/test_train.py`

**Interfaces:**
- Consumes: `Example.spans`, `JudgeTokenizer.message_offsets`, `char_span_to_tokens`, model span outputs.
- Produces: `_encode(tok, prefix, ex, max_tokens) -> (Step, span_targets)` where `span_targets` is a list (one per rule) of `(t0, t1)` absolute positions in the step or `None`; loss = verdict soft-CE + `span_weight` × mean CE over message positions for start and end (rules with a target only). CLI `--span-weight` default 0.5. Examples whose message exceeds `max_tokens` keep being skipped (spans inside long messages are learned from windowed training data in Phase C and from `--long-per-language` test only).

- [ ] **Step 1: Write the failing test**

```python
def test_span_loss_trains_span_head(tmp_path, tiny_tokenizer_dir):
    # two examples whose span is a fixed word; after a few steps the predicted span hits it
    from tests.test_train import make_run_inputs  # existing helper that writes data + tokenizer for tiny runs
    data = make_run_inputs(tmp_path, tiny_tokenizer_dir, with_spans=True)
    train_main(["--base", "tiny", "--data", str(data), "--out", str(tmp_path / "run"), "--epochs", "30",
                "--lr", "3e-3", "--grad-accum", "1", "--span-weight", "1.0", "--eval-every", "1000"])
    log = [json.loads(l) for l in (tmp_path / "run" / "train_log.jsonl").read_text().splitlines()]
    assert log[-1]["span_loss"] < log[0]["span_loss"] * 0.5
```

`make_run_inputs(tmp_path, tok_dir, with_spans)` (add to `tests/test_train.py` if absent): writes `train.jsonl`/`val.jsonl` with 2 examples using words from `TINY_WORDS`, rule texts, targets `(1.0,)`, `violation_char_start`, and `spans=((s, e),)` covering one word; returns the data dir. The `--base tiny` path uses the existing tiny-model hook used by other train tests (reuse its mechanism).

- [ ] **Step 2: Run to verify it fails**

Run: `python -m pytest -q tests/test_train.py -k span_loss`
Expected: FAIL (`--span-weight` unknown / no `span_loss` in log).

- [ ] **Step 3: Implement**

In `_encode`, build the step as before; compute `msg_offsets = tok.message_offsets(ex.message)`; for each rule `i`: if `ex.spans and ex.spans[i]`: `tt = char_span_to_tokens(msg_offsets, *ex.spans[i])`; target = `(len(prefix) + tt[0], len(prefix) + tt[1])` if `tt` else `None`. Return `(step, targets)`.

In the loop:

```python
            logits, skey, squery, _, _ = model(*step_tensors(st, device), k0, v0)
            loss = soft_ce(logits[0, list(st.verdict_index)].float(), target) / a.grad_accum
            msg = slice(len(prefix), len(prefix) + n_msg)
            span_terms = []
            for vi, tgt in zip(st.verdict_index, span_targets):
                if tgt is None:
                    continue
                q = squery[0, vi].float(); keys = skey[0, msg].float()
                s_log, e_log = keys @ q[:SPAN_DIM], keys @ q[SPAN_DIM:]
                span_terms.append(F.cross_entropy(s_log[None], torch.tensor([tgt[0] - len(prefix)], device=device))
                                  + F.cross_entropy(e_log[None], torch.tensor([tgt[1] - len(prefix)], device=device)))
            span_loss = torch.stack(span_terms).mean() if span_terms else logits.sum() * 0
            loss = loss + a.span_weight * span_loss / a.grad_accum
```

(`n_msg = len(tok.message_ids(ex.message))`; return it from `_encode` too.) Log `span_loss` (accumulated like `loss`) in each `train_log.jsonl` line.

- [ ] **Step 4: Run the suite**

Run: `python -m pytest -q`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add models/judge-v2/judge/train/train.py models/judge-v2/tests/test_train.py
git commit -m "feat(judge-v2): train the span head"
```

### Task 8: Spans in export, Python runtime and JS steps

**Files:**
- Modify: `judge/export.py` (`KVExportJudge` outputs `span_key`, `span_query`)
- Modify: `judge/infer.py` (`OnnxJudge.score_with_spans`)
- Modify: `bench/judge_steps.mjs` (collect span keys during prefill; spans from the rules step)
- Test: `tests/test_export_infer.py`, `bench/judge_steps.test.mjs`

**Interfaces:**
- Produces ONNX outputs `["verdict", "span_key", "span_query", *present_names]`; dynamic axis S on both span outputs.
- Produces `OnnxJudge.score_with_spans(message, rules) -> list[tuple[float, tuple[int, int] | None]]` — calibrated probability and char span of the best window per rule (span from the window that produced the max probability; `None` if the probability is below 0.5 — span returned only for rules the caller may flag; the cascade decides).
- `OnnxJudge.score` keeps its signature (returns probabilities only).
- JS: `prefill` returns `{kv, p, keys}` where `keys` is a `Float32Array` of `T×64` for the message tokens; `rulesSpans(out, keys, verdictIndex)` returns `[t0, t1]` per rule.

- [ ] **Step 1: Write the failing tests**

```python
def test_fp32_export_spans_match_torch(run_dir, tmp_path):
    from judge.model import best_span, load_judge, span_scores
    out = export_model_dir(run_dir, tmp_path / "model", quantize=False)
    judge = OnnxJudge(out)
    msg = "please help me fix this bug in the database server log thanks"
    got = judge.score_with_spans(msg, RULES)
    m = load_judge(run_dir)
    tok = JudgeTokenizer.load(run_dir / "tokenizer", CFG)
    st = single_pass(tok.prefix_ids(), tok.message_ids(msg), [tok.rule_ids(r) for r in RULES])
    k0, v0 = m.backbone.empty_past()
    with torch.no_grad():
        _, skey, sq, _, _ = m(*step_tensors(st), k0, v0)
    n = len(tok.prefix_ids()); T = len(tok.message_ids(msg)); offs = tok.message_offsets(msg)
    for (p, span), vi in zip(got, st.verdict_index):
        s, e = span_scores(skey[0, n:n + T].numpy(), sq[0, vi].numpy())
        t0, t1 = best_span(s, e)
        if span is not None:
            assert span == (offs[t0][0], offs[t1][1])

def test_span_found_in_second_window(run_dir, tmp_path):
    out = export_model_dir(run_dir, tmp_path / "model", quantize=False)
    judge = OnnxJudge(out)
    msg = " ".join(TINY_WORDS[i % len(TINY_WORDS)] for i in range(120))  # longer than max_message_tokens=40
    for p, span in judge.score_with_spans(msg, RULES):
        assert span is None or (0 <= span[0] < span[1] <= len(msg))
```

```js
// bench/judge_steps.test.mjs (add)
test("prefill concatenates span keys across chunks", async () => {
  const made = [];
  const sess = { run: async (feeds, names) => {
    const s = feeds.input_ids.dims[1]; const out = {};
    for (const n of names) out[n] = new FakeTensor("float32", n === "span_key" ? new Float32Array(s * 64).fill(s) : new Float32Array(0), [1, s, 64]);
    return out;
  } };
  const pre = { kv: kv(), p: 1 };
  const st = await prefill(ort, sess, input, pre, [5, 6, 7, 8, 9]);
  assert.equal(st.keys.length, 5 * 64);
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `python -m pytest -q tests/test_export_infer.py -k span && node --test bench/judge_steps.test.mjs`
Expected: FAIL.

- [ ] **Step 3: Implement**

`KVExportJudge.forward` returns `(head(norm(x)), self.model.span_key(norm(x)), self.model.span_query(norm(x)), *ks, *vs)`; output names `["verdict", "span_key", "span_query", *present_names]`; axes `{"span_key": {1: "S"}, "span_query": {1: "S"}}`.

`OnnxJudge._run` requests `["verdict", "span_key", "span_query"] + present_names` when `need_state`, else `["verdict", "span_query"]`; returns `(verdict, span_key_or_None, span_query, state)`.
`score_with_spans`: per window, collect `span_key` rows for message tokens across chunks (`np.concatenate`), run the rules step, compute probabilities as in `score`, and for each rule `best_span(*span_scores(keys, span_query[vi]))` → char offsets via `message_offsets` with the window's token offset `a`; keep the span from the window with the highest probability per rule; return `(prob, span if prob >= 0.5 else None)`.

JS: in `prefill`, request `span_key` too, append `o.span_key.data` into a growing `Float32Array`, dispose the tensor; return `keys`. Add `rulesSpans(spanQuery, keys, verdictIndex, T)` computing dot products and the same `best_span` (port the Python loop). Keep disposal rules from the existing tests.

- [ ] **Step 4: Run the suite**

Run: `python -m pytest -q && node --test bench/judge_steps.test.mjs`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add models/judge-v2/judge/export.py models/judge-v2/judge/infer.py models/judge-v2/bench/judge_steps.mjs models/judge-v2/bench/judge_steps.test.mjs models/judge-v2/tests/test_export_infer.py
git commit -m "feat(judge-v2): spans through export, Python runtime and JS steps"
```

### Task 9: Retrain the fast model with spans and check its gates

**Files:**
- Generated (git-ignored): `runs/fast_spans/`, `artifacts/fast_spans/`
- Modify: `models/judge-v2/README.md` (fast-model section)

- [ ] **Step 1: Train** (laptop awake; start the keep-awake helper on the trainer PID)

```bash
python -m judge.train.train --init-from runs/stage1 --data data/half_spans --out runs/fast_spans --precision fp32 --grad-checkpointing --max-tokens 3072 --epochs 2 --lr 2e-5 --grad-accum 16 --eval-every 500 --span-weight 0.5
```
Expected: completes; `train_log.jsonl` shows `span_loss` falling.

- [ ] **Step 2: Export, calibrate, development metrics**

```bash
python -c "from pathlib import Path; from judge.export import export_model_dir; export_model_dir(Path('runs/fast_spans'), Path('artifacts/fast_spans'))"
python -m judge.train.calibrate --model-dir artifacts/fast_spans --data data/all3
```
Score `frontier` on `data/all3/val.jsonl` and `data/devx/devx.jsonl`.
Expected: within 0.02 of `final3`'s baseline on both (the span head must not cost accuracy). If worse by more, lower `--span-weight` to 0.2 and retrain once; ledger the ruling.

- [ ] **Step 3: Span accuracy on validation**

For validation examples with `spans`, count rules with probability ≥ threshold whose returned span overlaps the true span.
Expected: ≥ 0.90.

- [ ] **Step 4: Fast-model gates**

Run `judge.bench.make_inputs`, `node bench/native.mjs`, `bench/web/serve.py` (Chrome tab), `judge.bench.gates` on `artifacts/fast_spans`.
Expected: size ≤ 140 MB, RSS ≤ 400 MB, latency gates pass.

- [ ] **Step 5: Record and commit**

Append a "Fast model with spans" section to `README.md` (numbers above).
```bash
git add models/judge-v2/README.md
git commit -m "docs(judge-v2): fast model with spans results"
```

## Phase C — Second-opinion model

### Task 10: Qwen3 backbone support

**Files:**
- Modify: `judge/backbone.py` (`BackboneSpec.from_hf_config`, `Attention`, `Block`)
- Test: `tests/test_backbone.py`

**Interfaces:**
- Produces: `arch == "qwen3"`: llama layout + per-head RMSNorm on q and k **without** the `+1` offset, rope theta from config, silu, no embed scale, all layers full attention.

- [ ] **Step 1: Write the failing tests**

```python
def tiny_qwen3():
    from transformers import Qwen3Config, Qwen3ForCausalLM
    torch.manual_seed(0)
    cfg = Qwen3Config(vocab_size=128, hidden_size=64, intermediate_size=128, num_hidden_layers=2,
                      num_attention_heads=4, num_key_value_heads=2, head_dim=16, max_position_embeddings=256)
    return Qwen3ForCausalLM(cfg).eval()

def test_qwen3_full_pass_matches_hf():
    hf = tiny_qwen3(); bb = Backbone.from_hf_model(hf).eval()
    ids = torch.randint(0, 128, (1, 9))
    want = hf.model(ids).last_hidden_state
    k0, v0 = bb.empty_past()
    got, _, _ = bb(ids, torch.arange(9)[None], causal_bias(9, 0)[None, None], k0, v0)
    torch.testing.assert_close(got, want, atol=1e-4, rtol=1e-4)

@pytest.mark.slow
def test_real_qwen3_matches_hf():
    from transformers import AutoModelForCausalLM
    hf = AutoModelForCausalLM.from_pretrained("Qwen/Qwen3-0.6B", torch_dtype=torch.float32).eval()
    bb = Backbone.from_hf_model(hf).eval()
    ids = torch.tensor([[9707, 11, 1879, 0, 220, 16, 17, 18]])
    k0, v0 = bb.empty_past()
    got, _, _ = bb(ids, torch.arange(8)[None], causal_bias(8, 0)[None, None], k0, v0)
    torch.testing.assert_close(got, hf.model(ids).last_hidden_state, atol=2e-3, rtol=2e-3)
```

(`causal_bias` is the existing helper in `tests/conftest.py`; `slow` follows the existing marker for real-model parity tests.)

- [ ] **Step 2: Run to verify they fail**

Run: `python -m pytest -q tests/test_backbone.py -k qwen3`
Expected: FAIL (`unsupported model_type 'qwen3'`).

- [ ] **Step 3: Implement**

```python
        if cfg.model_type == "qwen3":
            theta, factor = _rope_params(getattr(cfg, "rope_parameters", None) or {"rope_theta": cfg.rope_theta})
            return BackboneSpec(
                "qwen3", cfg.vocab_size, cfg.hidden_size, cfg.num_hidden_layers, cfg.num_attention_heads,
                cfg.num_key_value_heads, cfg.head_dim, cfg.intermediate_size, cfg.rms_norm_eps,
                ("full_attention",) * cfg.num_hidden_layers, {"full_attention": theta},
                {"full_attention": factor}, None, cfg.head_dim ** -0.5, None, 1.0, "silu")
```

In `Attention.__init__`: `self.qk_norm = spec.arch in ("gemma3", "qwen3")`; norm offset `spec.arch == "gemma3"`. Ensure `Backbone.from_hf_model` copies `q_norm`/`k_norm` weights for qwen3 (same names as gemma3) and treats the model as llama otherwise (no pre/post feed-forward norms, no embed scale).

- [ ] **Step 4: Run the tests**

Run: `python -m pytest -q tests/test_backbone.py` and `python -m pytest -q -m slow tests/test_backbone.py -k real_qwen3`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add models/judge-v2/judge/backbone.py models/judge-v2/tests/test_backbone.py
git commit -m "feat(judge-v2): Qwen3 backbone support"
```

### Task 11: Windows for the second opinion

**Files:**
- Create: `judge/window.py`
- Test: `tests/test_window.py`

**Interfaces:**
- Produces:
  - `token_window(n_tokens: int, center: tuple[int, int] | None, size: int = 400) -> tuple[int, int]` — `[a, b)` of length `min(size, n)`, centred on `center` (whole message if `n <= size`, start if `center is None`).
  - `window_examples(examples, tok, size=400, negatives_per_example=1, seed=0) -> list[Example]` — for each rule with a span: a window around it (target kept, span re-based); for each rule with target < 0.5: `negatives_per_example` random windows (target kept); rules with target ≥ 0.5 but no span are kept only if the whole message fits in one window. Message text is cut on token boundaries via `message_offsets`; `message_id` gets suffix `#w<k>`.

- [ ] **Step 1: Write the failing tests**

```python
from judge.window import token_window

def test_short_message_is_one_window():
    assert token_window(120, (50, 60), size=400) == (0, 120)

def test_window_centres_on_span_and_stays_in_bounds():
    a, b = token_window(2000, (1900, 1910), size=400)
    assert b - a == 400 and a <= 1900 and b >= 1911 and b <= 2000

def test_window_examples_rebase_spans(tiny_tokenizer_dir):
    from judge.config import JudgeConfig
    from judge.data.schema import Example
    from judge.tokenize import JudgeTokenizer
    from judge.window import window_examples
    from tests.conftest import TINY_WORDS
    tok = JudgeTokenizer.load(tiny_tokenizer_dir, JudgeConfig(model_version="t", base_model="t"))
    text = " ".join(TINY_WORDS[i % len(TINY_WORDS)] for i in range(300)) + " SECRET 078-05-1120"
    s = text.index("078"); e = len(text)
    ex = Example("m", text, "en", ("r",), ("x",), (1.0,), (True,), False, s, ((s, e),))
    w = window_examples([ex], tok, size=40)[0]
    ws, we = w.spans[0]
    assert w.message[ws:we] == "078-05-1120" and w.message_id == "m#w0"
```

- [ ] **Step 2: Run to verify they fail**

Run: `python -m pytest -q tests/test_window.py`
Expected: FAIL (module missing).

- [ ] **Step 3: Implement**

```python
import dataclasses
import random
from judge.tokenize import char_span_to_tokens


def token_window(n_tokens, center, size=400):
    if n_tokens <= size:
        return 0, n_tokens
    if center is None:
        return 0, size
    mid = (center[0] + center[1]) // 2
    a = max(0, min(mid - size // 2, n_tokens - size))
    return a, a + size


def window_examples(examples, tok, size=400, negatives_per_example=1, seed=0):
    rng = random.Random(seed)
    out = []
    for ex in examples:
        offs = tok.message_offsets(ex.message)
        n = len(offs)
        k = 0
        for i, (rid, rule, t) in enumerate(zip(ex.rule_ids, ex.rules, ex.targets)):
            span = ex.spans[i] if ex.spans else None
            if span is not None:
                tt = char_span_to_tokens(offs, *span)
                if tt is None:
                    continue
                wins = [token_window(n, tt, size)]
            elif t < 0.5:
                wins = [token_window(n, None, size) if n <= size else
                        (lambda a: (a, a + size))(rng.randrange(0, n - size + 1)) for _ in range(negatives_per_example)]
            elif n <= size:
                wins = [(0, n)]
            else:
                continue
            for a, b in wins:
                cs, ce = offs[a][0], offs[b - 1][1]
                new_span = None if span is None else ((span[0] - cs, span[1] - cs),)
                out.append(dataclasses.replace(
                    ex, message_id=f"{ex.message_id}#w{k}", message=ex.message[cs:ce], rule_ids=(rid,), rules=(rule,),
                    targets=(t,), critical=(ex.critical[i],), violation_char_start=None if span is None else span[0] - cs,
                    spans=new_span))
                k += 1
    return out
```

- [ ] **Step 4: Run the tests**

Run: `python -m pytest -q tests/test_window.py`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add models/judge-v2/judge/window.py models/judge-v2/tests/test_window.py
git commit -m "feat(judge-v2): token windows for the second opinion"
```

### Task 12: LoRA training path and vocabulary pruning for byte-level BPE

**Files:**
- Modify: `judge/train/train.py` (`--lora-rank`, `--lora-alpha`, merge on save)
- Modify: `judge/vocab.py` (`prune_tokenizer_json` keeps all single-symbol base tokens of ByteLevel BPE)
- Test: `tests/test_train.py`, `tests/test_vocab.py`

**Interfaces:**
- Produces: `--lora-rank R` (0 = off) freezes the backbone, adds LoRA adapters (peft) to `q_proj,k_proj,v_proj,o_proj,gate_proj,up_proj,down_proj`; heads (`head`, `span_key`, `span_query`) stay fully trainable; `best.pt` holds **merged** weights so export and `load_judge` are unchanged.
- Produces: for tokenizers whose pre-tokenizer or decoder is `ByteLevel`, pruning always keeps every single-character vocabulary token (the 256 byte symbols), so no text becomes unencodable.

- [ ] **Step 1: Write the failing tests**

```python
# tests/test_train.py
def test_lora_trains_only_adapters_and_heads_and_saves_merged(tmp_path, tiny_tokenizer_dir):
    data = make_run_inputs(tmp_path, tiny_tokenizer_dir, with_spans=False)
    train_main(["--base", "tiny", "--data", str(data), "--out", str(tmp_path / "run"), "--epochs", "1",
                "--grad-accum", "1", "--lora-rank", "4", "--eval-every", "1000"])
    sd = torch.load(tmp_path / "run" / "best.pt", weights_only=True)
    assert not any("lora" in k for k in sd)
    from judge.model import load_judge
    load_judge(tmp_path / "run")  # loads without missing/unexpected keys
```

```python
# tests/test_vocab.py
def test_byte_level_pruning_keeps_all_byte_symbols():
    tj = {"model": {"type": "BPE", "vocab": {chr(0x100 + i): i for i in range(256)} | {"ab": 256},
                    "merges": []}, "pre_tokenizer": {"type": "ByteLevel"}, "added_tokens": []}
    out, old_ids = prune_tokenizer_json(tj, kept={256})
    assert len(out["model"]["vocab"]) == 257
```

- [ ] **Step 2: Run to verify they fail**

Run: `python -m pytest -q tests/test_train.py -k lora tests/test_vocab.py -k byte_level`
Expected: FAIL.

- [ ] **Step 3: Implement**

`prune_tokenizer_json`: after collecting `keep`, if `"ByteLevel"` appears in `json.dumps(tj.get("pre_tokenizer"))` or in `json.dumps(tj.get("decoder"))`, add `{t for t in vocab if len(t) == 1}`.

`train.py`:

```python
    if a.lora_rank:
        from peft import LoraConfig, get_peft_model
        for p in model.parameters():
            p.requires_grad_(False)
        model.backbone = get_peft_model(model.backbone, LoraConfig(
            r=a.lora_rank, lora_alpha=a.lora_alpha, lora_dropout=0.0,
            target_modules=["q_proj", "k_proj", "v_proj", "o_proj", "gate_proj", "up_proj", "down_proj"]))
        for mod in (model.head, model.span_key, model.span_query):
            for p in mod.parameters():
                p.requires_grad_(True)
```

`make_optimizer` uses only `requires_grad` parameters. When saving `best.pt`, if LoRA is on: `merged = copy.deepcopy(model); merged.backbone = merged.backbone.merge_and_unload(); torch.save(merged.state_dict(), ...)`. CLI: `--lora-rank` int default 0, `--lora-alpha` int default 16.

- [ ] **Step 4: Run the suite**

Run: `python -m pytest -q`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add models/judge-v2/judge/train/train.py models/judge-v2/judge/vocab.py models/judge-v2/tests
git commit -m "feat(judge-v2): LoRA training and byte-level vocabulary pruning"
```

### Task 13: Second-opinion candidate spike and final training

**Files:**
- Generated (git-ignored): `data/windows/`, `runs/so_<candidate>/`, `artifacts/so_<candidate>/`, `artifacts/so/`
- Create: `docs/superpowers/notes/2026-10-22-second-opinion-spike.md` (decision record)

- [ ] **Step 1: Window training data**

Build windowed examples from `data/half_spans/train.jsonl` (with the fast model's tokenizer: windows are cut in characters, so they are tokenizer-independent) plus the mined pairs (`data/half4/mined.jsonl`), validation from `data/all3/val.jsonl`, and the development set windows from `data/devx/devx.jsonl`:
`python -c "<load examples>; from judge.window import window_examples; <write data/windows/{train,val,devx}.jsonl>"`
Expected: counts printed; every span re-based correctly (assert `message[s:e]` equals the original excerpt for a sample of 200).

- [ ] **Step 2: Prune vocabularies** for `google/gemma-3-1b-pt` (reuse `runs/vocab` — same tokenizer family; verify `old_ids` cover it) and `Qwen/Qwen3-0.6B` (`python -m judge.vocab --tokenizer Qwen/Qwen3-0.6B --build data/all3/train.jsonl --gate data/all3/val.jsonl --out runs/vocab_qwen3 --max-tokens 36000`).
Expected: unknown rate ≤ 0.1% per language (gate passes).

- [ ] **Step 3: Memory/speed probe per candidate** (100 steps, LoRA rank 16, window 400, grad checkpointing, fp32 compute):
`python -m judge.train.train --base <hf id> --pruned-tokenizer <vocab dir> --data data/windows --out runs/probe_<c> --precision fp32 --grad-checkpointing --max-tokens 768 --epochs 1 --limit-train 1600 --lora-rank 16 --grad-accum 16 --eval-every 100000`
Expected: fits in 4 GB (no OOM); record s/step. If a candidate OOMs, record it and drop it.

- [ ] **Step 4: Short training per surviving candidate** (1 epoch on `data/windows`), export with `export_model_dir` in two variants: hybrid int8 (`quantize_hybrid`) and 4-bit weight-only (`MatMulNBitsQuantizer(bits=4, block_size=32)` + int8 Gather), calibrate each with `--model-dir` on `data/windows/val.jsonl`.
Measure for each variant: file size, native latency for one rule on a 400-token window (`node` probe using `bench/judge_steps.mjs`), `frontier` on `data/windows/devx.jsonl` restricted to the fast model's uncertain band (scores between 0.1 and 0.9 from `artifacts/fast_spans`).
Expected: a table in the decision note. Pick the variant with the best development precision at 90% recall that meets ≤ 400 MB and ≤ 2.5 s per routed rule. If none qualifies: STOP and report to the owner with the table.

- [ ] **Step 5: Full training of the winner** (2 epochs, same flags, laptop awake), export, calibrate on `data/windows/val.jsonl` into `artifacts/so/`.
Expected: completes; record development metrics in the decision note.

- [ ] **Step 6: Commit the decision note**

```bash
git add docs/superpowers/notes/2026-10-22-second-opinion-spike.md
git commit -m "docs(judge-v2): second-opinion candidate decision"
```

## Phase D — Cascade, contract and gates

### Task 14: Cascade and JSON contract (Python reference)

**Files:**
- Create: `judge/cascade.py`
- Test: `tests/test_cascade.py`

**Interfaces:**
- Consumes: `OnnxJudge.score_with_spans`, `token_window`.
- Produces:
  - `@dataclass Bands(low: float, high: float)`.
  - `class Cascade: __init__(self, fast, second=None, bands=Bands(0.1, 0.9), window_tokens=400, second_timeout_s=2.5)`; `judge(message: str, rules: list[dict]) -> dict` where each rule dict is `{"id": str, "text": str}` and the result follows the spec's JSON contract exactly (`violated`, `decided_by`, `latency_ms`, `pending`, `rules[]` with `rule_id`, `violated`, `confidence`, `span` as `{"start","end","text"}` or `null`).
  - Routing per rule: `p < low` → fast not violated; `p >= high` → fast violated (span from fast, may be `null`); otherwise second opinion on the window around the fast span (or message start); if `second is None` or it raises or exceeds `second_timeout_s` → that rule `violated: null`, `pending: true`.
  - `fast`/`second` are any objects with `score_with_spans(message, rule_texts)`; `second` is called per routed rule with the window text, and its span is re-based to the full message.

- [ ] **Step 1: Write the failing tests**

```python
import time
from judge.cascade import Bands, Cascade

class Fake:
    def __init__(self, out): self.out = out
    def score_with_spans(self, message, rules): return [self.out[r] for r in rules]

RULES = [{"id": "a", "text": "A"}, {"id": "b", "text": "B"}, {"id": "c", "text": "C"}]

def test_routes_by_band_and_rebases_second_span():
    fast = Fake({"A": (0.02, None), "B": (0.97, (4, 8)), "C": (0.5, (10, 14))})
    second = Fake({"C": (0.96, (0, 4))})
    r = Cascade(fast, second, Bands(0.1, 0.9), window_tokens=400).judge("x" * 20, RULES)
    by = {x["rule_id"]: x for x in r["rules"]}
    assert by["a"]["violated"] is False and by["b"]["violated"] is True and by["c"]["violated"] is True
    assert r["decided_by"] == "second_opinion" and r["violated"] is True and r["pending"] is False
    assert by["b"]["span"]["start"] == 4

def test_missing_second_opinion_marks_pending_not_false():
    fast = Fake({"A": (0.02, None), "B": (0.5, None), "C": (0.03, None)})
    r = Cascade(fast, None).judge("hello", RULES)
    by = {x["rule_id"]: x for x in r["rules"]}
    assert by["b"]["violated"] is None and r["pending"] is True and r["violated"] is False

def test_slow_second_opinion_times_out():
    class Slow(Fake):
        def score_with_spans(self, m, rules): time.sleep(0.3); return super().score_with_spans(m, rules)
    fast = Fake({"A": (0.5, None), "B": (0.02, None), "C": (0.02, None)})
    r = Cascade(fast, Slow({"A": (0.99, None)}), second_timeout_s=0.1).judge("hello", RULES)
    assert r["pending"] is True

def test_violated_rule_may_have_null_span():
    fast = Fake({"A": (0.97, None), "B": (0.02, None), "C": (0.02, None)})
    r = Cascade(fast, None).judge("hello", RULES)
    assert r["rules"][0]["violated"] is True and r["rules"][0]["span"] is None

def test_empty_message_or_no_rules_makes_no_calls():
    class Boom:
        def score_with_spans(self, m, r): raise AssertionError("called")
    assert Cascade(Boom(), Boom()).judge("", RULES)["violated"] is False
    assert Cascade(Boom(), Boom()).judge("hi", [])["rules"] == []
```

- [ ] **Step 2: Run to verify they fail**

Run: `python -m pytest -q tests/test_cascade.py`
Expected: FAIL (module missing).

- [ ] **Step 3: Implement** `judge/cascade.py` to satisfy the tests and the interface above. Use `concurrent.futures.ThreadPoolExecutor(max_workers=1)` with `future.result(timeout=...)` for the timeout; character windows: take `fast` span centre (or 0) and cut `±window_chars` where `window_chars = window_tokens * 4` clamped to the message, then re-base the returned span by the cut start. `confidence` is `p` for violated and `1 - p` for not violated, rounded to 4 decimals; `span.text` is `message[start:end]`. `latency_ms` measured with `time.perf_counter()`. For an empty message or no rules return `{"violated": False, "decided_by": "fast", "latency_ms": 0, "pending": False, "rules": [...not violated or empty]}` without calling any model.

- [ ] **Step 4: Run the tests**

Run: `python -m pytest -q tests/test_cascade.py`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add models/judge-v2/judge/cascade.py models/judge-v2/tests/test_cascade.py
git commit -m "feat(judge-v2): cascade with JSON contract"
```

### Task 15: Cascade in JS (reference runtime for Spec 2)

**Files:**
- Create: `bench/cascade.mjs`
- Create: `bench/cascade.test.mjs`
- Modify: `tests/test_bench.py` (run the new node test)

**Interfaces:**
- Produces: `createCascade({ fast, second, bands, windowChars, secondTimeoutMs })` with `judge(message, rules) -> Promise<result>` matching the Python contract field-for-field; `fast`/`second` expose `scoreWithSpans(message, ruleTexts) -> Promise<[{p, span:[start,end]|null}]>`. Character offsets are JS string (UTF-16) indices; `span.text = message.slice(start, end)`.
- `second` may be `null` or a lazy loader `() => Promise<scorer>` invoked on the first routed rule.
- `idleUnloadMs` (default 300000): after that long without a routed rule, call the loaded scorer's `dispose()` (if present) and drop it; the next routed rule loads it again. Test with fake timers: load count is 2 after two routed rules separated by more than `idleUnloadMs`, and `dispose` was called once.

- [ ] **Step 1: Write the failing tests** (`node:test`, fakes mirroring Task 14's five tests, plus one non-BMP test):

```js
test("UTF-16 offsets slice the exact text for emoji and Hebrew", async () => {
  const msg = "שלום 🙂 card 4539 1488 0343 6467";
  const s = msg.indexOf("4539"); const e = msg.length;
  const fast = { scoreWithSpans: async () => [{ p: 0.97, span: [s, e] }] };
  const r = await createCascade({ fast, second: null, bands: { low: 0.1, high: 0.9 } }).judge(msg, [{ id: "a", text: "A" }]);
  assert.equal(r.rules[0].span.text, "4539 1488 0343 6467");
});
```

Add to `tests/test_bench.py`: `test_js_cascade` running `node --test bench/cascade.test.mjs` (skip if node missing).

- [ ] **Step 2: Run to verify they fail**

Run: `node --test bench/cascade.test.mjs`
Expected: FAIL (module missing).

- [ ] **Step 3: Implement** `bench/cascade.mjs` as a direct port of `judge/cascade.py` (same routing, timeout via `Promise.race` with a timer, same result shape). The Python side's `score_with_spans` returns Python string offsets (code points); document in `judge/cascade.py`'s module docstring that the JSON contract uses UTF-16 offsets, and convert in Python with a helper `to_utf16(message, idx)` when emitting the contract (add a Python test: `to_utf16("🙂a", 1) == 2`).

- [ ] **Step 4: Run the suite**

Run: `python -m pytest -q && node --test bench/cascade.test.mjs`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add models/judge-v2/bench/cascade.mjs models/judge-v2/bench/cascade.test.mjs models/judge-v2/judge/cascade.py models/judge-v2/tests
git commit -m "feat(judge-v2): JS cascade reference runtime with UTF-16 spans"
```

### Task 16: Choose bands on development sets

**Files:**
- Create: `judge/evaluate/bands.py`
- Test: `tests/test_bands.py`
- Generated: `artifacts/bands.json`

**Interfaces:**
- Produces: `choose_bands(fast_scores, second_scores, labels, critical, min_recall=0.90, min_crit_recall=0.95, max_routed=0.15) -> dict` — grid over `low < high` (step 0.01); system decision per rule = fast if outside the band, second otherwise; returns the pair maximizing system precision subject to recall, critical recall and routed share; keys `low, high, precision, recall, routed`. Returns `None` if no pair meets the constraints.

- [ ] **Step 1: Write the failing test**

```python
from judge.evaluate.bands import choose_bands

def test_bands_route_uncertain_rules_to_a_better_second_model():
    fast   = [0.95, 0.85, 0.6, 0.55, 0.05, 0.4]
    second = [0.97, 0.10, 0.9, 0.05, 0.02, 0.92]
    labels = [1,    0,    1,   0,    0,    1]
    crit   = [True, False, False, False, False, True]
    b = choose_bands(fast, second, labels, crit, max_routed=0.7)
    assert b["precision"] == 1.0 and b["recall"] == 1.0 and b["routed"] <= 0.7
```

- [ ] **Step 2: Run to verify it fails**

Run: `python -m pytest -q tests/test_bands.py`
Expected: FAIL.

- [ ] **Step 3: Implement** the grid search exactly as specified (decision threshold 0.5 for the second model after its own calibration; fast decisions use `p >= high` as violated).

- [ ] **Step 4: Run, then choose real bands**

Run: `python -m pytest -q tests/test_bands.py` — Expected: PASS.
Score `artifacts/fast_spans` and `artifacts/so` on `data/all3/val.jsonl` + `data/devx/devx.jsonl` (second model on windows via the cascade's windowing), run `choose_bands`, write `artifacts/bands.json`.
Expected: a pair meeting recall ≥ 0.90, critical ≥ 0.95, routed ≤ 15%, with precision reported. If precision < 0.95 on development data, record it (the gate is checked on test in Task 17); if `None`, STOP and report.

- [ ] **Step 5: Commit**

```bash
git add models/judge-v2/judge/evaluate/bands.py models/judge-v2/tests/test_bands.py
git commit -m "feat(judge-v2): choose cascade bands on development sets"
```

### Task 17: End-to-end gates, the single test run, and handoff

**Files:**
- Create: `judge/evaluate/run_cascade_eval.py`
- Test: `tests/test_run_cascade_eval.py`
- Modify: `models/judge-v2/README.md`, `eval_log.jsonl`

**Interfaces:**
- Produces: `python -m judge.evaluate.run_cascade_eval --fast artifacts/fast_spans --second artifacts/so --bands artifacts/bands.json --examples data/all3/test.jsonl --out artifacts/cascade_eval.json --log eval_log.jsonl` — runs the Python cascade over every example, reports system recall, critical recall, adversarial and late-violation recall, precision, per-language recall, routed share, span accuracy, and pass/fail against the Global Constraints; appends to the log; exits 1 on any failed gate.

- [ ] **Step 1: Write the failing test** (tiny fakes through the same module function `evaluate(cascade, examples) -> dict`):

```python
def test_cascade_eval_reports_routed_share_and_span_accuracy():
    from judge.evaluate.run_cascade_eval import evaluate
    class C:
        def judge(self, m, rules):
            return {"violated": True, "decided_by": "second_opinion", "latency_ms": 5, "pending": False,
                    "rules": [{"rule_id": r["id"], "violated": True, "confidence": 0.9,
                               "span": {"start": 0, "end": 3, "text": m[:3]}} for r in rules]}
    from judge.data.schema import Example
    ex = [Example("m", "abc def", "en", ("r",), ("x",), (1.0,), (True,), False, 0, ((0, 3),))]
    rep = evaluate(C(), ex)
    assert rep["routed_share"] == 1.0 and rep["span_accuracy"] == 1.0 and rep["recall_overall"] == 1.0
```

- [ ] **Step 2: Run to verify it fails**

Run: `python -m pytest -q tests/test_run_cascade_eval.py`
Expected: FAIL.

- [ ] **Step 3: Implement** `evaluate` and the CLI (reuse `judge.evaluate.metrics` for recall/precision; a pending rule counts as "blocked" when the company setting is Hold — report both views; the gate uses Hold).

- [ ] **Step 4: Run the suite**

Run: `python -m pytest -q`
Expected: all pass.

- [ ] **Step 5: Latency gates for the whole system**

Add scenarios to `judge/bench/make_inputs.py` for a 150-token message with 5 rules where one rule is routed to the second opinion (short case: ≤ 3 s total) and a 2000-token paste with one routed rule (large case: ≤ 10 s), for native and web; extend `bench/native.mjs` and `bench/web/` to load the second model and run the cascade path. Run `judge.bench.gates` with both models' sizes.
Expected: all latency, RAM (fast ≤ 400 MB; with second loaded ≤ 400 + 700 MB) and size gates pass.

- [ ] **Step 6: The single test run**

Run the CLI above once on `data/all3/test.jsonl`.
Expected: exit 0. If any gate fails: STOP. Do not tune on the test set; send the owner the failing gates with values and options (more development data in the failing area, different second-model candidate, adjusted bands from development data).

- [ ] **Step 7: Record and hand off**

Append "Judge v2.1 results" to `README.md` (all gate values, chosen candidate and quantization, bands, routed share, span accuracy) and commit with `eval_log.jsonl`:
```bash
git add models/judge-v2/README.md models/judge-v2/eval_log.jsonl models/judge-v2/judge/evaluate/run_cascade_eval.py models/judge-v2/tests/test_run_cascade_eval.py models/judge-v2/judge/bench models/judge-v2/bench
git commit -m "feat(judge-v2): cascade gates and v2.1 results"
```
