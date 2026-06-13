---
status: current
owner: extension
verified_at: 2026-06-13
sources:
  - pretzel/src/detection/engine.ts
  - pretzel/src/detection/types.ts
  - pretzel/src/detection/normalize.ts
  - pretzel/src/detection/code-block.ts
  - pretzel/src/detection/layer1-patterns/entropy.ts
  - pretzel/src/detection/layer1-patterns/pii.ts
  - pretzel/src/detection/layer3-dictionary/exact.ts
  - pretzel/src/detection/layer3-dictionary/fuzzy.ts
  - pretzel/src/policy/defaults.ts
  - pretzel/tests/unit/detection/corpus.test.ts
---

# Detection engine

Detection runs locally in the service worker against the active engine policy.

## Pipeline

1. Return an empty result when the current hostname is disabled.
2. Normalize lookalike characters, line endings, tabs, and selected invisible characters.
3. Find fenced and inline-code spans.
4. Run every enabled baseline and custom rule.
5. Select the highest action using `log < warn < require_confirmation < block`.
6. Compute a SHA-256 hash of the normalized prompt.

Normalization attempts to preserve offsets, but deleting invisible characters is lossy and can shift later finding offsets relative to the original prompt.

## Rule kinds

| Kind | Behavior |
|---|---|
| Pattern | Global regex matching with optional `luhn`, `ssn`, or `iban` post-validation and code-scope filtering |
| Entropy | Finds long, high-Shannon-entropy tokens |
| Dictionary | Exact word-boundary terms plus optional Levenshtein fuzzy terms |
| Score | Runs only for a recently pasted prompt and combines configured structural signals |

Malformed pattern regexes are skipped. Fuzzy matching is limited to terms of at most 20 characters. Score rules return no finding unless `pasteDetected` is true; the content script considers a paste recent for 500 ms.

## Findings and actions

Each finding contains rule ID/name, severity, action, matched text truncated to 200 characters, and offsets. The result contains all findings, the highest action, prompt hash, detection timestamp, and duration.

- `log`: prompt proceeds without a modal.
- `warn`: modal allows edit or send-anyway.
- `require_confirmation`: the modal path treats it like warn and allows send-anyway.
- `block`: modal allows only editing; the send is not re-fired.

The backend policy schema currently emits only `warn` and `block`. `log` and `require_confirmation` remain engine-policy actions.

## Built-in default policy

`DEFAULT_POLICY` is used only when authenticated detection has no valid cached backend `policyDoc`. It includes conservative patterns for API keys, private keys, JWTs, secret-like environment assignments, database connection strings, payment/identity data, internal network identifiers, high-entropy tokens, classification labels, and legal privilege markers.

No ML/NER or cloud detection stage is implemented. The engine source marks those as future insertion points.
