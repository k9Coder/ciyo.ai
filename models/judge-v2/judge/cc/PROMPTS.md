# Claude Code teacher prompts

Every subagent gets exactly one of the prompts below with the placeholders filled in. It writes **only** the output file it is told to write, as JSON Lines (one JSON object per line, UTF-8, no markdown fences). It also reads `models/judge-v2/LABELING_POLICY.md` before starting.

## TEMPLATES (Task 20)

You are writing Faker message and rule templates in language `{language}` for training an on-device DLP judge.
Read `models/judge-v2/LABELING_POLICY.md` and `models/judge-v2/judge/data/scripted.py` (the `FILLERS`, `SENSITIVE_SLOTS` and `validate` rules) first.
Write `models/judge-v2/templates/{language}.json` with:
- `"language": "{language}"`
- `"messages"`: for every category id in `judge/data/catalog.py` `CATEGORIES`, 4 positive and 2 hard_negative templates spread across the `MESSAGE_STYLES`, plus 20 benign templates. Ids `{language}-m-NNN`.
  - Positives wrap the disclosing span in `[[...]]`.
  - Use only the sensitive slots of the template's own category, plus neutral slots (`name`, `company`, `date`, `amount`, `product`).
  - Semantic categories (salary, M&A, roadmap, diagnosis…) disclose through realistic wording inside `[[...]]`, using neutral slots for specifics.
  - Hard negatives mention or ask about the topic, use obvious placeholders, or discuss the policy, but disclose nothing.
  - About one in four positives is `"adversarial": true` (spelled-out digits, split across lines, inside code/JSON, transliterated).
  - Write natural, varied, realistic text in `{language}` (technical terms may stay in English where natives would use them).
- `"rules"`: for every category, 3 rules written in `{language}` as admins in that language would write them. At least one per category follows the assistant format translated into `{language}` ("This message discloses <specific claim>, even if disguised."). Codename rules must contain `{codename}`. Ids `{language}-r-NNN`.

When done, run `cd models/judge-v2 && python -c "from pathlib import Path; from judge.data.scripted import load_templates, validate; e=validate(load_templates(Path('templates/{language}.json'))); print('\n'.join(e) or 'VALID')"` and fix every error until it prints `VALID`.

## PAIRS (Task 21)

You are generating labeled training pairs for an on-device DLP judge. Order file: `{order_path}`. Read it, read `models/judge-v2/LABELING_POLICY.md`, then write `{output_path}` with exactly `n` JSON lines (from the order).
- Language of every message: the order's `language` (write natively; mixed technical English is fine).
- Category: the order's `category_id`. If it is `null`, every message is `"polarity": "benign"`; otherwise use a mix of about 60% `positive` and 40% `hard_negative`.
- Styles: rotate through the order's `styles`.
- Each line follows this schema exactly:
  `{"message": str, "polarity": "positive"|"hard_negative"|"benign", "style": str, "adversarial": bool, "violating_excerpt": str, "rules": [{"text": str, "category": str, "language": str, "verdict": "match"|"no_match", "confidence": number}]}`
- Messages: realistic, varied, often long and messy (pasted email, code, logs, documents). Place the violation anywhere, sometimes deep inside long text. Make about one third of positives disguised (`"adversarial": true`). A disguised message never explains or comments on its own disguise (no "so search won't find it"); it just contains the disguised data the way a careless or sneaky employee would.
- Rules are written the way an admin writes a policy: a prohibition or a "this message contains/discloses/discusses X" claim. Never write a rule that describes the message itself, and never add negated clauses like "but does not reveal …". Vary the wording; do not end most rules with "even if disguised" (use it rarely, in the order's language).
- `proprietary_source_code` means code, queries, configs or scripts written inside the company that are not public (internal business logic, internal SQL against company tables, deployment scripts). Public library usage, tutorials and generic snippets are not proprietary.
- `violating_excerpt`: the exact substring of `message` that discloses the information for positives; `""` otherwise.
- `rules`: 2-4 rules per message, in the order's language or English. Include the hardest cases you can:
  - a rule this message satisfies or deliberately fails to satisfy
  - a near-miss rule (different referent, narrower scope)
  - a compound rule ("... unless ...", "... and ...")
  - an unrelated rule
  - Give each its catalog `category` id, and a verdict and confidence per the labeling policy.

## LABEL (Task 22, second pass and test labels)

You are labeling pairs for an on-device DLP judge, blind to any earlier label. Order file: `{order_path}`. Read `models/judge-v2/LABELING_POLICY.md`. For every item in the order's `payload`, decide whether `message` satisfies `rule`. Before deciding, list (privately) every excerpt of the message that could satisfy the rule. Write `{output_path}` with one line per item:
`{"pair_id": str, "verdict": "match"|"no_match", "confidence": number between 0.5 and 1.0}`
