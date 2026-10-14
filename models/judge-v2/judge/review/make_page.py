import argparse
import json
import random
from pathlib import Path

from judge.data.schema import Label, Message, Pair, Rule, read_jsonl

TEMPLATE = """<!doctype html><meta charset="utf-8"><title>__TITLE__</title>
<style>
body{font-family:system-ui,sans-serif;max-width:900px;margin:24px auto;padding:0 16px;background:#fff;color:#111}
pre{white-space:pre-wrap;background:#f4f4f5;padding:12px;border-radius:6px;max-height:420px;overflow:auto;unicode-bidi:plaintext}
button{margin-right:8px;padding:8px 14px}.on{outline:3px solid #2563eb}.meta{color:#555}
</style>
<h1>__TITLE__</h1><p class="meta" id="progress"></p>
<p class="meta">Language: <b id="language"></b> · Teacher verdict: <b id="teacher"></b></p>
<h3>Rule</h3><pre id="rule" dir="auto"></pre><h3>Message</h3><pre id="message" dir="auto"></pre>
<p><button data-v="match">Match (m)</button><button data-v="no_match">No match (n)</button>
<button data-v="unsure">Unsure (u)</button></p>
<p><button id="prev">Prev</button><button id="next">Next</button><button id="export">Export results</button></p>
<script>
const ITEMS = __ITEMS__;
const KEY = "judge-review:" + document.title;
let answers = {}; try { answers = JSON.parse(localStorage.getItem(KEY) || "{}"); } catch (e) {}
let i = 0;
function save() { try { localStorage.setItem(KEY, JSON.stringify(answers)); } catch (e) {} }
function show() {
  const it = ITEMS[i];
  document.getElementById("rule").textContent = it.rule;
  document.getElementById("message").textContent = it.message;
  document.getElementById("language").textContent = it.language;
  document.getElementById("teacher").textContent = it.teacher === null ? "(hidden)" : it.teacher;
  document.getElementById("progress").textContent = `Item ${i + 1} of ${ITEMS.length} · answered ${Object.keys(answers).length}`;
  document.querySelectorAll("button[data-v]").forEach(b => b.classList.toggle("on", answers[it.pair_id] === b.dataset.v));
}
function answer(v) { answers[ITEMS[i].pair_id] = v; save(); if (i < ITEMS.length - 1) i++; show(); }
document.querySelectorAll("button[data-v]").forEach(b => b.onclick = () => answer(b.dataset.v));
document.getElementById("prev").onclick = () => { if (i > 0) i--; show(); };
document.getElementById("next").onclick = () => { if (i < ITEMS.length - 1) i++; show(); };
const KEYS = {m: "match", n: "no_match", u: "unsure"};
document.addEventListener("keydown", e => { if (KEYS[e.key]) answer(KEYS[e.key]); });
document.getElementById("export").onclick = () => {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([JSON.stringify(answers, null, 2)], {type: "application/json"}));
  a.download = "review_results.json"; a.click();
};
show();
</script>
"""
SAMPLE_STATUSES = ("construction", "single", "agreed")


def make_items(data_dir: Path, mode: str, n: int, seed: int) -> list[dict]:
    if mode == "queue":
        rows = [json.loads(l) for l in (data_dir / "review_queue.jsonl").read_text(encoding="utf-8").splitlines() if l.strip()]
        return [{**r, "teacher": None} for r in rows]
    msgs = {m.id: m for m in read_jsonl(data_dir / "messages.jsonl", Message)}
    rules = {r.id: r for r in read_jsonl(data_dir / "rules.jsonl", Rule)}
    pairs = {p.id: p for p in read_jsonl(data_dir / "pairs.jsonl", Pair)}
    splits = json.loads((data_dir / "splits.json").read_text(encoding="utf-8"))
    labels = [l for l in read_jsonl(data_dir / "labels.jsonl", Label)
              if l.status in SAMPLE_STATUSES and splits[pairs[l.pair_id].message_id] == "test"]
    picked = random.Random(seed).sample(sorted(labels, key=lambda l: l.pair_id), min(n, len(labels)))
    out = []
    for l in picked:
        p = pairs[l.pair_id]
        m = msgs[p.message_id]
        out.append({"pair_id": p.id, "language": m.language, "message": m.text, "rule": rules[p.rule_id].text,
                    "teacher": "match" if l.p_match >= 0.5 else "no_match"})
    return out


def render_page(items: list[dict], title: str) -> str:
    payload = json.dumps(items, ensure_ascii=False).replace("<", "\\u003c").replace(">", "\\u003e")
    return TEMPLATE.replace("__TITLE__", title).replace("__ITEMS__", payload)


def main(argv=None):
    ap = argparse.ArgumentParser(prog="judge.review.make_page")
    ap.add_argument("--data", type=Path, required=True)
    ap.add_argument("--mode", choices=["sample", "queue"], required=True)
    ap.add_argument("--n", type=int, default=400)
    ap.add_argument("--seed", type=int, default=1)
    ap.add_argument("--out", type=Path, required=True)
    a = ap.parse_args(argv)
    items = make_items(a.data, a.mode, a.n, a.seed)
    a.out.write_text(render_page(items, f"Judge v2 review ({a.mode})"), encoding="utf-8")
    print(f"wrote {len(items)} items to {a.out}")


if __name__ == "__main__":
    main()
