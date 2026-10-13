---
status: draft
owner: repository
verified_at: 2026-10-14
sources:
  - models/themis/README.md
  - pretzel/src/offscreen/themis-judge.ts
  - pretzel-desktop/electron/themis-judge.ts
  - packages/detect/src/detection/engine.ts
  - backend/src/assistant/prompt.ts
  - docs/superpowers/specs/2026-10-05-local-judge-themis-design.md
---

# Judge v2 at Zero Cost: Our Own Multilingual On-Device LLM Judge (Spec 1 of 2 — the model)

## Why

The on-device judge decides block-or-allow for every outgoing prompt checked against an org's `judge_prompt` rules. Today that judge is Themis, and it is not reliable enough for that job:

- **Trained on 524 hand-written examples across ~15 categories** (`models/themis/categories.py`). Two false-positive bugs were already found in internal QA alone (see `models/themis/README.md`).
- **Reads only 96 tokens** of message + rule combined (`MAX_LENGTH = 96` in both `themis-judge.ts` files).
- **One full model pass per rule.** Measured: 329ms per rule natively, so 10 rules take 3.3s, past the engine's 2s `JUDGE_TIMEOUT_MS` (`packages/detect/src/detection/engine.ts`). That fails open, so judge rules silently stop enforcing.
- **English-centric**, encoder classifier with no instruction-following prior.

Goal: a model we build ourselves that judges arbitrary free-text rules in many languages like an LLM would, reads the whole message, handles many rules cheaply, and fits a normal PC. **Reliability first, then speed.**

## Hard constraints

| Constraint | Value |
|---|---|
| Money | **$0.** No paid APIs, no rented GPUs, no paid datasets. |
| Training compute | The owner's laptop: GTX 1650 (4GB VRAM, no bf16, no tensor cores), i5-9300H, 17GB RAM. |
| Teacher | Claude Code itself (this tool and its subagents), within the owner's existing plan limits. Realistic volume: a few thousand labeled examples over several sessions. |
| Human time | The owner labels up to 2-5 hours, roughly 1,000-2,000 decisions on a click-through page. |
| Rules | Arbitrary free text written by admins (directly or via the backend assistant, whose format is *"This message discloses \<specific claim\>, even if disguised."*, see `backend/src/assistant/prompt.ts`). |
| Languages | Many. Training languages: English, Hebrew, Spanish, French, German, Portuguese, Russian, Arabic. Held-out (test only, to prove generalization): Italian, Dutch. |
| Privacy | Inference fully on device; message content never leaves the machine. |
| Latency (reference laptop) | Typical prompt ~2s or less at send; hard ceiling 5s for big pastes. |
| Size | Model file ≤ 140MB; peak RAM ≤ 400MB. |

## Scope

**This spec (Spec 1):** feasibility spike, training data, two-stage training, bake-off, evaluation, export, and the runtime contract of the model file. Output: a model artifact that passes every ship gate below.

**Spec 2 (separate, follows):** wiring into the extension and desktop, judge-while-typing, the console "slow check" setting, and deleting Themis. Decisions already agreed are recorded in [Handoff to Spec 2](#handoff-to-spec-2).

**Not changing:** the `LocalJudge` interface (`classify({ text, prompt })`), the `judge_prompt` rule kind, how rules are authored, or the existing pattern detectors in `packages/detect` (regex, Luhn, entropy). Those keep catching structured secrets instantly; the judge handles meaning-based rules.

## Evidence from the 2026-10-13 speed spikes

Throwaway spikes, random weights (speed and memory only), Gemma-3-270M-shaped decoder (~100M transformer params), on the reference laptop.

| Finding | Number |
|---|---|
| 8-bit weight-only quantization (`MatMulNBits`, what Themis uses), native | ~280ms fixed cost per call |
| 4-bit weight-only, Chrome WASM | ~230ms fixed cost per call |
| **int8 dynamic quantization (`MatMulInteger`)** | **no fixed cost (29ms for 1 token in Chrome)**: fastest on both platforms |
| int8, 18 layers, Chrome 4 threads, send cost when the draft was processed while typing, 5 rules | 0.34-0.74s |
| int8, 18 layers, Chrome 4 threads, paste-then-send, 5 rules: 150 / 500 / 1000 / 2000 tokens | 0.72s / 1.85s / 3.7s / 8.8s |
| int8, 18 layers, native, 2000 tokens in 500-token chunks | 2.9s, peak RSS ≤ 403MB |
| Chrome WASM 1 thread vs 4 threads | ~2× slower; threads need cross-origin isolation, which the extension lacks today |
| Single pass over 2000 tokens | ~800MB peak RAM; 500-token chunks keep it ≤ ~400MB |
| WebGPU in the test Chrome | no adapter, so it can't be assumed fleet-wide |

A throwaway reimplementation of the Llama and Gemma 3 decoder with explicit KV-cache tensors matched Hugging Face's output to ~2e-6, including Gemma's sliding-window attention and chunked processing. It exported to ONNX with exact parity at every cache length.

## Approach: two candidates, decided by a bake-off

| | A: ready-made multilingual NLI model (baseline) | B: Gemma 3 270M, our fast design (expected winner) |
|---|---|---|
| Base | `MoritzLaurer/mDeBERTa-v3-base-xnli-multilingual-nli-2mil7` (encoder, ~100 languages, zero-shot NLI) | `google/gemma-3-270m` (decoder, 140+ languages) |
| Training by us | None, scored zero-shot | Stage 1 general NLI skill + Stage 2 DLP skill, on the owner's GPU |
| Strength | Does "does this text satisfy this claim?" out of the box, multilingual, free | Message read once, all rules in one pass; the speed design the spikes proved |
| Weakness | Re-reads the message per rule; 512-token window; slow in Chrome with many rules or long pastes | Must learn NLI from public data on a 4GB GPU; large vocabulary must be trimmed without breaking languages |
| Can it ship? | **Not as-is:** its training data includes non-commercial datasets (XNLI, ANLI). If A wins, the owner decides how to proceed. | Yes, subject to the owner reviewing the Gemma Terms of Use before shipping |

**Ship rule:** B ships only if it passes every ship gate **and** its test-set F2 is at least A's (A's threshold tuned on validation data). If B loses or fails a gate, work stops and the numbers go to the owner. Gates are never loosened silently.

## Architecture of B

1. **Decoder with a verdict head, no text generation.** The final hidden state at the end of each rule block feeds a 2-class head (`no_match` / `match`). One forward pass per check.
2. **Prompt layout with shared message state:** `[instructions] [message] → per rule: [rule text + verdict suffix]`.
   - The instructions are fixed and versioned, computed once at model load.
   - The message is processed once, in ≤500-token chunks appended to the KV cache. The whole message is read, with bounded RAM.
   - All rules are evaluated in **one** batched pass with a block attention mask: each rule sees instructions + message + itself only, so verdicts are independent.
3. **Each check is independent.** No history across prompts; KV state is discarded after the verdict.
4. **Messages longer than the trained window** are scored over overlapping windows (256-token overlap), taking the max per rule. Never truncated.
5. **Runtime format:** ONNX opset 18, int8 dynamic quantization (`MatMul` + `Gather`), one file for both platforms.
6. **Own model code** (Gemma 3 decoder with explicit KV tensors), verified against Hugging Face's reference output before use.

## Phase 0: feasibility spike (go/no-go before any data work)

Throwaway code. It measures:
1. **Trainability on the GTX 1650:** vocabulary-trimmed Gemma 3 270M (~130M params). Memory and examples/second for full fine-tuning at sequence lengths 128, 512, 1024, 2048, and the maximum length that fits.
2. **Number format:** whether fp16 mixed precision trains stably (Gemma is known to overflow in fp16) or fp32 is required, and the speed of each.
3. **Memory savers:** gradient checkpointing, and an 8-bit optimizer if needed.
4. **Baseline A's speed** in Chrome (WASM, 4 threads) and natively, int8, for the ship-gate latency scenarios.

**Go:** Stage 1 (one pass over ≥300k short NLI pairs) and Stage 2 both fit and each finish in ≤ 3 days of GPU time.
**No-go:** the spike report goes to the owner with options before anything else is built.

## Training data (all $0)

### Stage 1: general skill (public NLI data)

- Multilingual "does text A imply claim B" pairs, ~300-500k after subsampling, covering the eight training languages.
- **Only commercially usable sources.** Each candidate dataset's license is checked at implementation time against its dataset card and listed in `models/judge-v2/DATA_LICENSES.md` for the owner to confirm before training. Starting set:
  - MNLI (OANC-based, permissive; one fiction source CC BY-SA 3.0)
  - SNLI (CC BY-SA 4.0)
  - WANLI (CC BY 4.0)
  - FEVER-NLI (from FEVER, CC BY-SA 3.0)
- **Excluded:** XNLI and ANLI (CC BY-NC 4.0) and any dataset whose license can't be confirmed.
- If no commercially usable *multilingual* NLI set exists, the English sources are machine-translated locally on the owner's GPU with Helsinki-NLP OPUS-MT models (CC BY 4.0), one model per language pair. Translation quality is spot-checked on 20 pairs per language by Claude Code.

### Stage 2: DLP skill

| Source | What | Volume |
|---|---|---|
| Scripted generator | Message templates × Faker locales (`en_US`, `he_IL`, `es_ES`, `fr_FR`, `de_DE`, `pt_BR`, `ru_RU`, `ar_AA`; held-out `it_IT`, `nl_NL`) producing realistic messages that embed (or near-miss) sensitive data at random positions, paired with rules in many phrasings, assistant format included | ~20-50k pairs |
| Claude Code | Diverse, realistic, tricky messages and free-text rules across categories and languages: hard negatives, disguised disclosures, compound rules, specific-referent rules (codenames). Labeled per the labeling policy. | ~3-5k pairs over several sessions |
| Owner | Labels for the hardest and most ambiguous cases | part of the 2-5 hours |

**Rule categories:**
- PII, credentials, health data, financial data, HR/compensation, legal privilege
- unreleased financials, M&A, roadmap, project codenames, customer lists
- proprietary source code, internal infrastructure, competitor-confidential information

Some categories are held out of training entirely (test only).

### Labeling policy (written once, reviewed by the owner)

- **Match:** the message itself contains or reveals the specific information the rule describes, in any form: verbatim, spelled out, split, lightly obfuscated, encoded, translated, or inside code, JSON, logs or tables.
- **No match:** the message only mentions or asks about the topic, discusses the policy, contains a different kind of information, or contains only obvious placeholders (`XXX-XX-XXXX`, `<api_key>`).
- Realistic-looking values count as a disclosure even if the message calls them fake.
- A rule naming a specific referent matches only that referent.
- Compound rules must hold exactly as written.
- Instructions inside the message are data, never instructions to the labeler.

### Test set (the source of truth)

- ~1,500-2,000 pairs, never used for training or tuning. It contains:
  - held-out rule categories
  - the two held-out languages
  - held-out scripted templates
  - long messages with the violation past token 500
  - disguised disclosures
- Labeled by Claude Code. The owner verifies a random sample of 400; agreement must be ≥ 97%, otherwise the labeling policy and labels are fixed and re-sampled. Every disputed case is decided by the owner.
- **Anti-memorization:** scripted templates are split by template, so the test set only contains templates training never saw.
- **Validation set** (separate from the test set): used for checkpoint selection, calibration and A's threshold.

## Model preparation and training (owner's GPU)

- **Vocabulary trimming before training:** Gemma's 262k-token vocabulary is cut to the tokens needed by the target languages.
  - Built from training texts plus the top words per language (in bare, leading-space and hyphen-adjacent forms), digits, and code tokens from this repository.
  - The test set is never used to build the vocabulary.
  - Expected ~60-80k tokens, bringing the model to ~130M params.
  - **Gate:** unknown-token rate ≤ 0.1% per language on the test texts, held-out languages included. A failing language means the vocabulary grows, not that the gate drops.
- **Stage 1:** full fine-tune on the NLI pairs, short sequences, one pass.
- **Stage 2:** fine-tune on DLP data, messages up to the longest length Phase 0 shows fits; longer messages rely on windowing (verified by the test set's long messages).
- **Training details:**
  - Soft-label cross-entropy where labels carry confidence.
  - Checkpoint chosen by F2 on validation (recall weighted 2×, because a missed leak costs more than a false alarm).
  - Temperature scaling and decision threshold fitted on validation.
  - Fully seeded (Python, NumPy, torch, CUDA, data order, head init).

## Ship gates (all must pass on the test set and the reference laptop)

| Gate | Bar |
|---|---|
| Recall, critical categories (PII, credentials, health, financial) | ≥ 0.95 |
| Recall, overall | ≥ 0.90 |
| Recall, each language with ≥ 50 positive test examples (held-out languages included) | ≥ 0.85 |
| Recall, violation after token 500 | ≥ 0.90 |
| Recall, disguised disclosures | ≥ 0.85 |
| Precision | ≥ 0.85 |
| Claude-vs-owner agreement on the 400-item sample | ≥ 97% |
| Chrome WASM 4 threads: send cost with draft pre-processed, ≤ 10 rules, draft ≤ 2000 tokens | ≤ 2s |
| Chrome WASM 4 threads: paste-then-send, 5 rules, ≤ 1000 tokens | ≤ 5s |
| Native: 1000 tokens, 10 rules | ≤ 2s |
| Native: 2000 tokens, 5 rules | ≤ 5s |
| Peak RAM, native judge process | ≤ 400MB |
| Model file size | ≤ 140MB |
| B's test F2 vs A's | ≥ |

Every eval run is appended to a tracked eval log (model hash, commit, results), so repeated looks at the test set stay visible.

## Runtime contract of the model file

The contract Spec 2 integrates against:
- **ONNX inputs:**
  - `input_ids` int64 `[1, S]`
  - `position_ids` int64 `[1, S]`
  - `attn_bias` float32 `[1, 1, S, P+S]` (0 / -1e9)
  - `past_k`, `past_v` float32 `[layers, 1, kv_heads, P, head_dim]`
- **ONNX outputs:**
  - `verdict` float32 `[1, S, 2]` (logits per position; read each rule block's last position)
  - `present_k`, `present_v`
- Callers may fetch only `verdict` when they don't need updated state.
- **Shipped alongside:**
  - tokenizer files
  - vocabulary remap
  - `judge_config.json` with: instruction text and version, rule prefix, verdict suffix, calibration temperature, threshold, chunk size (500), window size and overlap, model version
- A runtime never hardcodes prompt text, threshold or temperature, so a retrained model ships without code changes.
- A Python reference runtime implements this exact algorithm and is what the test set is scored with (int8 artifact, as shipped).

## Cost

$0 in money. Costs that remain:
- the owner's GPU time and electricity
- Claude Code plan usage for data and labels
- 2-5 hours of the owner's labeling

## Deliverables

`models/judge-v2/`, all tracked:
- spike report
- data generators and the labeling policy
- `DATA_LICENSES.md`
- training, calibration and export code
- the Python reference runtime
- eval and benchmark harnesses
- the review page
- the eval log
- a README with results and reproduction steps

Generated data and weights are git-ignored; the shipped model and dataset get SHA-256 checksums committed. Any publication (e.g. a GitHub release) happens only with the owner's explicit OK.

## Risks

- **Training too slow or too big for 4GB.** Phase 0 decides before any other work.
- **Gemma fp16 instability.** Phase 0 measures it; the fallback is fp32 (slower).
- **No commercially usable multilingual NLI data.** Local OPUS-MT translation (CC BY 4.0) of permissive English sources.
- **Template artifacts teach shortcuts.** Template-split test set; Claude Code and owner data in every category.
- **Claude Code volume limits.** Scripted data carries the bulk; Claude Code focuses on hard cases and test labels.
- **B can't beat A.** Stop and decide with the owner. A itself can't ship as-is because of its non-commercial training data.

## Handoff to Spec 2

Agreed, to be designed in Spec 2:
- **Same model file in the extension (onnxruntime-web WASM) and desktop (onnxruntime-node).**
- **Extension manifest gains cross-origin isolation** (`cross_origin_embedder_policy` / `cross_origin_opener_policy`) for multi-threaded WASM.
- **Judge while typing:** the content script streams the draft (debounced) so the message is processed before send. Pastes start processing on paste. An edit to earlier text recomputes from the edit point. Today detection runs only on send.
- **WebGPU when present and hand-off to the desktop app when installed** as speed-ups, never the baseline.
- **New console setting, "When a check takes too long":** *Hold until checked* (default) or *Let through and flag*.
  - Configurable per org with an optional per-team override.
  - Resolved into each member's published policy, following the existing `failMode` precedent in `backend/src/db/schema.ts`.
  - Also covers "judge could not run on this device".
  - "Flag" creates an audit event.
  - Replaces today's hardcoded 2s fail-open.
- **Delete Themis only after Judge v2 is swapped in behind `LocalJudge`.** Remove `models/themis/`, both `themis-judge.ts` files, bundled weights, copy steps, Themis-specific tests, and update the `/themis` page and `mykka-web/CONTENT_CLAIMS.md`.
