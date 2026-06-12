# Detection Engineering Review — Omar Hassan
**Date:** 2026-06-08
**Reviewer:** Omar Hassan, Detection Engineer
**Scope:** pretzel/src/detection/ (engine, normalize, code-block, types, layer1-patterns, layer3-dictionary)

---

## File Reviews

#### `pretzel/src/detection/engine.ts` — Core detection pipeline orchestrator
- [x] Reviewed
  **Verdict:** WARN
  **Findings:**

  **1. Pattern rules run against `normalised` text but offsets are used to slice `text` (raw)**
  In `runPatternRule`, `re.exec(normalised)` produces offsets into `normalised`. The engine then does `text.slice(start, end)` to produce the `matchedText` snippet. After normalisation (unicode lookalike substitution, CRLF→LF, tab→4-spaces), byte offsets between `normalised` and `text` can diverge — a tab becomes 4 spaces (1 char → 4 chars), so every offset past a tab is wrong in `text`. The `matchedText` in the `Finding` will point to the wrong substring. The same mismatch exists in `buildSnippet`, which is called externally and always receives raw offsets.

  **2. `runEntropyRule` receives `normalised` text; `runPatternRule` also uses `normalised`. But `runDictionaryRule` and `runScoreRule` receive raw `text` via `runRule`.**
  Looking at `runRule`: pattern/entropy get `normalised`, score/dictionary get raw `text`. This is inconsistent. Dictionary exact matching and fuzzy matching run on raw text, bypassing the lookalike normalisation step. An attacker can use Cyrillic lookalikes inside a dictionary term match to evade detection (e.g. `СОNFIDENTIAL` with Cyrillic С, О, N).

  **3. No per-rule timeout / runaway guard**
  The engine runs all rules synchronously in a `for` loop with no timeout. A user-supplied custom pattern rule with catastrophic backtracking (see credentials/dotenv findings below) will block the content script's main thread indefinitely. There is no `performance.now()` guard per rule. The 50ms SLA cannot be enforced without it.

  **4. `sha256` is awaited after all sync rules run — but this is still async**
  The entire `detectPrompt` is `async` because of the `sha256` call. If the sync detection path blows the 50ms budget (long prompt + many rules), the `await sha256(...)` adds another microtask delay on top. Minor, but worth noting in context of the SLA.

  **5. `runScoreRule` gates on `pasteDetected` but `pasteDetected` defaults to `false`**
  Score rules only fire when `pasteDetected === true`. If a site integration fails to set the paste flag, score-based document detection is silently disabled. No fallback heuristic.

  **Proposed changes:**
  ```typescript
  // Fix 1: Compute offsets against `normalised`, keep a char-level offset map if needed,
  // or run all rules (including dictionary) on `normalised`.
  // Simplest fix: pass `normalised` as both text and normalised into runRule,
  // and document that Finding offsets are into the normalised string.

  // Fix 3: Per-rule timeout guard
  const RULE_BUDGET_MS = 10;
  function runRuleWithTimeout(...): Finding[] {
    const t0 = performance.now();
    const result = runRule(...);
    if (performance.now() - t0 > RULE_BUDGET_MS) {
      console.warn(`[pretzel] Rule ${rule.id} exceeded ${RULE_BUDGET_MS}ms budget`);
    }
    return result;
  }
  // For true protection against ReDoS, run patterns in a Worker with a postMessage timeout.
  ```

---

#### `pretzel/src/detection/normalize.ts` — Unicode lookalike + whitespace normalisation
- [x] Reviewed
  **Verdict:** ISSUE
  **Findings:**

  **1. LOOKALIKE_MAP is severely incomplete — major bypass surface**
  The map covers 7 Cyrillic letters (А, а, е, о, р, с, х) and a handful of accented Latin chars. Real Unicode confusable sets are thousands of entries. A few obvious gaps:

  - Cyrillic `у` (U+0443) → `y` — missing. `уour` passes normalization.
  - Cyrillic `і` (U+0456) → `i` — missing. `АPІ_KEY` bypasses the dotenv pattern.
  - Fullwidth ASCII: `Ａ` (U+FF21) through `Ｚ` (U+FF3A) and `ａ`–`ｚ` — entirely absent. `ｓｋ-XXXXXXXX` bypasses OpenAI key detection.
  - Homoglyph digits: `①②③` — absent; less critical but worth noting.
  - Greek letters: `ο` (U+03BF, Greek omicron) → `o`, `α` → `a`, `ν` → `v` — all absent.
  - Mathematical bold/italic variants: `𝐀`–`𝐙` — absent.

  **2. `LOOKALIKE_RE` character class construction is fragile**
  The regex is built as `[<keys joined>]` where keys are pasted verbatim into a character class. If any key character is a regex metacharacter inside `[]` (e.g. `]`, `^`, `-`, `\`), this silently produces a broken character class or different semantics. The current keys happen to be safe, but this is a maintenance footgun as the map grows.

  **3. Offset drift from tab expansion**
  Tabs (`\t`) are replaced with 4 spaces. This changes string length and invalidates all byte offsets after any tab. Detection offsets in Findings will be wrong whenever the raw text contains tabs (common in pasted code). This cannot be silently fixed post-hoc — either don't expand tabs (just normalise to a single space) or maintain an offset translation table.

  **4. Zero-width character stripping is good, but RTL override (U+202E) is missing**
  U+202E (RIGHT-TO-LEFT OVERRIDE) is a classic obfuscation trick used to reverse the visual display of text. Should be stripped or mapped.

  **5. Base64 and hex encoding are not reversed**
  A user can base64-encode `sk-ant-XXXX` and paste it. The normalizer does not detect or unpack common encoding layers. This is a harder problem but warrants a comment and a future work item.

  **Proposed changes:**
  ```typescript
  // Add fullwidth ASCII block:
  for (let i = 0; i < 26; i++) {
    LOOKALIKE_MAP[String.fromCodePoint(0xFF21 + i)] = String.fromCharCode(65 + i); // A-Z
    LOOKALIKE_MAP[String.fromCodePoint(0xFF41 + i)] = String.fromCharCode(97 + i); // a-z
  }
  // Add critical missing Cyrillics: у→y, і→i, ї→i, ц→c, and Greek omicron ο→o, etc.

  // Fix tab expansion drift — replace with single space instead of 4 spaces:
  .replace(/\t/g, " ")

  // Strip RTL override and other direction marks:
  .replace(/[‪-‮⁦-⁩‏]/g, "")

  // Build the regex safely:
  const LOOKALIKE_RE = new RegExp(
    Object.keys(LOOKALIKE_MAP)
      .map(ch => ch.replace(/[\\\]^-]/g, '\\$&'))
      .join(''),
    'g'
  );
  // Or use a simple character-by-character map lookup instead of a regex character class.
  ```

---

#### `pretzel/src/detection/code-block.ts` — Markdown code fence detection
- [x] Reviewed
  **Verdict:** ISSUE
  **Findings:**

  **1. `fenceRe` is susceptible to catastrophic backtracking on unterminated fences**
  Pattern: `/^```[^\n]*\n([\s\S]*?)^```/gm`
  The `[\s\S]*?` combined with `^` anchor in multiline mode causes the engine to try every possible line boundary as a potential closing fence position. On a 50KB prompt that starts a code fence but never closes it (e.g. pasted raw file content with just ` ``` ` at the top), this becomes O(n²) or worse. In a content script main thread with no timeout, this can cause a several-hundred-millisecond hang.

  **2. Single-backtick inline code regex is too greedy across lines**
  Pattern: `` /`([^`]+)`/g ``
  `[^`]+` matches newlines because `[^`]` in JS includes `\n`. A prompt containing a lone backtick (e.g., `` here's a backtick ` in a sentence ``) will greedily match everything between it and the next backtick, potentially flagging large prose spans as "code". This causes false negatives for rules scoped `outside_code`.

  **3. No maximum fence depth or match limit**
  A prompt with 1000 alternating inline backtick pairs results in 1000 regex `exec` iterations building the `spans` array. Each `isInsideCode` call then does a linear scan of all spans. For N spans and M matches, cost is O(N×M). Should binary-search or use an interval tree for large inputs.

  **4. `isInsideCode` uses `some()` — linear scan per finding**
  With many code spans and many pattern findings, this is O(spans × findings). Should sort spans by start and binary-search.

  **Proposed changes:**
  ```typescript
  // Fix 1: Limit [\s\S]*? with a character budget or use a line-based approach:
  // Instead of a single greedy regex, scan line-by-line for opening/closing ``` markers.
  export function findCodeSpans(text: string): CodeSpan[] {
    const spans: CodeSpan[] = [];
    const lines = text.split('\n');
    let fenceStart: number | null = null;
    let offset = 0;
    for (const line of lines) {
      if (line.startsWith('```')) {
        if (fenceStart === null) {
          fenceStart = offset;
        } else {
          spans.push({ start: fenceStart, end: offset + line.length });
          fenceStart = null;
        }
      }
      offset += line.length + 1; // +1 for \n
    }
    // Unterminated fence: push to end of text (conservative — treat as code)
    if (fenceStart !== null) spans.push({ start: fenceStart, end: text.length });

    // Inline backticks — restrict to same-line only:
    const inlineRe = /`([^`\n]+)`/g;
    let match: RegExpExecArray | null;
    while ((match = inlineRe.exec(text)) !== null) {
      spans.push({ start: match.index, end: match.index + match[0].length });
    }
    return spans;
  }

  // Fix 4: Binary search isInsideCode after sorting spans
  export function isInsideCode(offset: number, codeSpans: CodeSpan[]): boolean {
    let lo = 0, hi = codeSpans.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >>> 1;
      const span = codeSpans[mid]!;
      if (offset < span.start) hi = mid - 1;
      else if (offset >= span.end) lo = mid + 1;
      else return true;
    }
    return false;
  }
  ```

---

#### `pretzel/src/detection/types.ts` — Core type definitions and helpers
- [x] Reviewed
  **Verdict:** PASS
  **Findings:** None — clean. `maxAction`, `compareSeverity`, `compareAction` are correct. The `ACTION_ORDER` and `SEVERITY_ORDER` maps are exhaustive. `ScoreRule` / `ScoreSignalConfig` shape is well-typed. `Finding.matchedText` truncation is documented.

  **Proposed changes:** N/A

---

#### `pretzel/src/detection/layer1-patterns/pii.ts` — Luhn, SSN, IBAN validators
- [x] Reviewed
  **Verdict:** ISSUE
  **Findings:**

  **1. `ibanCheck` is a no-op stub — always returns `true`**
  ```typescript
  export function ibanCheck(_value: string): boolean {
    return true;  // ← this is a pass-through, not validation
  }
  ```
  The TODO comment says "when IBAN rule is added to defaults" — but the `validator` field in `PatternRuleSchema` already accepts `"iban"` and any pattern rule can set `validator: "iban"` today. Any custom rule using `validator: "iban"` will have zero checksum filtering, making it equivalent to raw regex matching. Real IBAN false-positive rates on financial text (account numbers, routing numbers, invoice IDs) will be high without the mod-97 checksum. This is not just a stub — it's a silent validator bypass.

  **2. `ssnCheck` does not validate the middle two digits (group number)**
  SSN group numbers cannot be 00. The current check only validates the area code (first three digits). A value like `123-00-4567` would pass `ssnCheck` despite being invalid. Low impact since the Luhn check is the primary validator for financial data, but SSN false positives are high-stakes.

  **3. `luhnCheck` accepts 13-digit minimum — too short**
  The minimum valid credit card number is 13 digits (old Visa), but modern cards are 15–16 digits. A 13-digit random number has ~10% chance of passing Luhn (1/10 of the last digit possibilities). With the broad credit card regex already anchored by card prefixes, this is acceptable — but worth documenting.

  **4. `ssnCheck` does not validate the serial number (last 4 digits)**
  Serial numbers cannot be 0000. Missing check.

  **Proposed changes:**
  ```typescript
  // Fix 1: Implement real IBAN mod-97 check
  export function ibanCheck(value: string): boolean {
    const cleaned = value.replace(/\s+/g, '').toUpperCase();
    if (cleaned.length < 15 || cleaned.length > 34) return false;
    // Move first 4 chars to end, convert letters to digits
    const rearranged = cleaned.slice(4) + cleaned.slice(0, 4);
    const numeric = rearranged.split('').map(ch => {
      const code = ch.charCodeAt(0);
      return code >= 65 ? (code - 55).toString() : ch;
    }).join('');
    // mod-97 on big integer (process in chunks to avoid overflow)
    let remainder = 0;
    for (const chunk of numeric.match(/.{1,9}/g) ?? []) {
      remainder = parseInt(String(remainder) + chunk, 10) % 97;
    }
    return remainder === 1;
  }

  // Fix 2: Enhanced ssnCheck
  export function ssnCheck(value: string): boolean {
    const parts = value.split("-");
    if (parts.length !== 3) return false;
    const area = parseInt(parts[0]!, 10);
    const group = parseInt(parts[1]!, 10);
    const serial = parseInt(parts[2]!, 10);
    if (area === 0 || area === 666 || area >= 900) return false;
    if (group === 0) return false;    // group cannot be 00
    if (serial === 0) return false;   // serial cannot be 0000
    return true;
  }
  ```

---

#### `pretzel/src/detection/layer1-patterns/api-keys.ts` — API key rule ID registry
- [x] Reviewed
  **Verdict:** WARN
  **Findings:**
  This file is purely a registry of IDs and a tag-based predicate — no detection logic or regexes live here. The actual patterns are in `defaults.ts`. The file is fine as a stub, but reviewing the patterns from `defaults.ts` in this context:

  **`openai-api-key`: `sk-[A-Za-z0-9_\\-]{20,}`**
  No upper bound on length (`{20,}` is unbounded). Combined with no word-boundary anchor on the right side, this will greedily consume adjacent characters. E.g. `sk-XXXXXXXXXXXXXXXXXXXXXX_some_suffix` matches `sk-XXXXXXXXXXXXXXXXXXXXXX_some_suffix` entirely. More importantly: `sk-proj-` is a valid OpenAI project key prefix that also matches `sk-[A-Za-z0-9_-]{20,}` because `proj-` is `[A-Za-z0-9_-]+`. The `openai-api-key` rule fires on project keys too, producing duplicate findings with `openai-project-key`.

  **`github-token`: `gh[pousr]_[A-Za-z0-9]{36,}`**
  GitHub's actual token formats are exactly 36 or 40 chars (ghp_ = 36, gho_ = 36, ghs_ = 36, ghu_ = 36, ghr_ = 40). Using `{36,}` is fine for recall but `[A-Za-z0-9]` misses the underscore that appears in some newer token formats. Also `r` is not a valid second character — GitHub tokens are `ghp_`, `gho_`, `ghs_`, `ghu_`, `ghr_`. This is correct but `ghr_` is refresh tokens, rarely sensitive in a DLP context — though conservative blocking is fine.

  **`google-api-key`: `AIza[0-9A-Za-z_\\-]{35}`**
  Google API keys are exactly 39 chars (`AIza` + 35). The fixed length `{35}` (not `{35,}`) is correct and precise — good. However, no right word boundary means `AIzaXXX...XXX_more` will match only the first 35 chars after `AIza`, potentially leaving a false boundary match. Adding `\b` or a negative lookahead `(?![A-Za-z0-9_-])` would help.

  **`aws-access-key`: `(AKIA|ASIA)[0-9A-Z]{16}`**
  AWS access key IDs are exactly 20 chars (`AKIA`/`ASIA` + 16). No word boundary. If an AWS key appears mid-word in a token (`SOMETHINGAKIA...`), it will still match. A left word boundary `\b` would eliminate this.

  **Proposed changes:**
  ```typescript
  // OpenAI: add right boundary + deduplicate with project key
  pattern: "sk-(?!proj-)[A-Za-z0-9_\\-]{20,}(?![A-Za-z0-9_\\-])"

  // AWS: add word boundaries
  pattern: "\\b(AKIA|ASIA)[0-9A-Z]{16}\\b"

  // Google: add right boundary
  pattern: "AIza[0-9A-Za-z_\\-]{35}(?![A-Za-z0-9_\\-])"
  ```

---

#### `pretzel/src/detection/layer1-patterns/credentials.ts` — Credential rule ID registry
- [x] Reviewed
  **Verdict:** ISSUE
  **Findings:**
  Again, the actual patterns live in `defaults.ts`. Reviewing those:

  **`dotenv-line`: `\\b[A-Z][A-Z0-9_]*=\\S{8,}` with flag `m`**
  This is the single most dangerous pattern in the entire ruleset from a ReDoS perspective. The `\S{8,}` quantifier is unbounded. Combined with `m` (multiline) mode and the fact that this is run via `re.exec()` in a loop, consider this input:

  ```
  SOME_VAR=aaaaaaaaaaaaaaaaaaaaaaaaaaaa!
  ```

  Here `\S{8,}` will match correctly. But what about:

  ```
  SOME_VAR=        (line with 8 spaces and no non-whitespace after)
  ```

  Actually the bigger FP problem: `\b[A-Z][A-Z0-9_]*=\S{8,}` will match legitimate non-secret env vars. Examples that will trigger:
  - `PATH=/usr/local/bin:/usr/bin` — matches, but this is shown to the AI to explain PATH issues all the time
  - `NODE_ENV=production` — 10 chars, matches
  - `LOG_LEVEL=INFO` — only 4 chars, misses. But `LOG_FORMAT=json_pretty` — matches
  - `REACT_APP_TITLE=MyAppDashboard` — matches

  The pattern has no entropy check on the value side — it treats any 8+ char non-whitespace value as a credential. The rule description says "high-entropy values" but the pattern enforces no entropy gate. This will produce very high FP rates for normal `.env` file pasting, causing admin alert fatigue and likely rule-disabling.

  The `\b` at the start also has an edge case: `\b` before `[A-Z]` will not match if the key is at the very start of the line (position 0). In multiline mode with `^`, `\b` is equivalent to asserting the previous char is a word-character boundary — at position 0 it works, but if there's leading whitespace (indented `.env` file), the `\b` anchors inside the indentation, not at the key start.

  **`jwt-token`: `eyJ[A-Za-z0-9_\\-]+\\.eyJ[A-Za-z0-9_\\-]+\\.[A-Za-z0-9_\\-]+`**
  The third segment `[A-Za-z0-9_\\-]+` requires at least one character. Unsigned JWTs (algorithm `none`) have an empty signature — they look like `eyJXXX.eyJXXX.` with a trailing dot and empty third part. This pattern will miss unsigned JWTs (which are actually the most security-relevant case). Should be `[A-Za-z0-9_\\-]*` for the third segment.

  The pattern also has no right boundary. `eyJXXX.eyJXXX.XXXX_more_text` will match only up to where the char class breaks. This is fine for extraction but consider that a very long JWT body causes `[A-Za-z0-9_-]+` to scan the whole base64 blob — not ReDoS-prone since it's a simple character class, but the match can be up to thousands of characters.

  **`pem-private-key`: `-----BEGIN [A-Z ]*PRIVATE KEY-----`**
  `[A-Z ]*` — the space is included in the character class, creating a potential match like `-----BEGIN    PRIVATE KEY-----` (multiple spaces). Benign but sloppy. More importantly, RSA keys (`BEGIN RSA PRIVATE KEY`) and EC keys (`BEGIN EC PRIVATE KEY`) both match, which is correct. But `[A-Z ]*` would also match `-----BEGIN PRIVATE KEY-----` (zero chars before PRIVATE), which is also correct (PKCS#8 format). Fine.

  **Proposed changes:**
  ```typescript
  // dotenv-line: add entropy gate via a combined approach.
  // Option A: Require value to look like a secret (hex/base64/long alphanum run):
  pattern: "\\b[A-Z][A-Z0-9_]*=(?=[A-Za-z0-9+/=_\\-]{16,})[A-Za-z0-9+/=_\\-]{8,}"
  // This restricts the value charset to secret-like characters and implicitly requires
  // higher information density.

  // Option B: Pair the pattern rule with the entropy rule — when a dotenv line matches,
  // run shannonEntropy on the value part and skip if < 3.5 bits/char.
  // This requires the engine to support per-rule post-match entropy hooks.

  // jwt-token: fix unsigned JWT miss
  pattern: "eyJ[A-Za-z0-9_\\-]+\\.eyJ[A-Za-z0-9_\\-]+\\.[A-Za-z0-9_\\-]*"
  //                                                                       ^ was +
  ```

---

#### `pretzel/src/detection/layer1-patterns/network.ts` — Network rule ID registry
- [x] Reviewed
  **Verdict:** WARN
  **Findings:**
  The actual pattern from `defaults.ts`:
  `\\b(10\\.|172\\.(1[6-9]|2\\d|3[01])\\.|192\\.168\\.)\\d{1,3}\\.\\d{1,3}\\b`

  **1. Octet validation is absent**
  `\d{1,3}` matches `0`–`999`. An IP like `10.999.999.999` will match and trigger a finding, but is not a valid IP. False-positive risk is low (three-digit octets > 255 are rare in prose) but technically incorrect.

  **2. Missing IPv6 private ranges**
  `fc00::/7` (ULA) and `::1` (loopback) are RFC 4193 private IPv6 ranges. As IPv6 deployment grows, internal stack traces and config files increasingly contain these. Not detecting them is a false-negative gap.

  **3. The pattern fires on version numbers and dates**
  Strings like `10.2.3.4` (a semver version in a package manager output) or `172.16.0.0` (a legitimate network documentation example) will produce findings. The `medium` severity + `warn` action is appropriate mitigation, but admins may still disable this rule due to noise in DevOps-heavy teams.

  **4. `\b` word boundary on numeric strings**
  `\b` works correctly here because digits are word characters and the boundary is between a digit and a non-word char (e.g., space, comma). This is correct.

  **Proposed changes:**
  ```typescript
  // Add octet range validation (0-255) to the regex:
  const OCTET = "(?:25[0-5]|2[0-4]\\d|1\\d{2}|[1-9]\\d|\\d)";
  pattern: `\\b(10\\.${OCTET}|172\\.(1[6-9]|2\\d|3[01])\\.${OCTET}|192\\.168\\.${OCTET})\\.${OCTET}\\b`

  // Consider adding an exclusion for common version number patterns:
  // e.g., require the match to not be preceded by a digit (to avoid 1.10.x.x semver)
  ```

---

#### `pretzel/src/detection/layer1-patterns/entropy.ts` — Shannon entropy tokenizer
- [x] Reviewed
  **Verdict:** ISSUE
  **Findings:**

  **1. `minBitsPerChar: 4.0` threshold is too low for enterprise use**
  The default threshold in `defaults.ts` is `minBitsPerChar: 4.0` with `minTokenLength: 24`.

  Shannon entropy of 4.0 bits/char is typical of normal English words longer than 24 chars. Examples that will false-positive at 4.0:
  - `internationalization` — 19 chars, under minLength, so misses. But:
  - `supercalifragilisticexpialidocious` — 34 chars, entropy ≈ 4.05 bits/char — **fires**
  - Long CamelCase identifiers: `getUserAuthenticationToken` — 26 chars, entropy ≈ 4.1 — **fires**
  - URLs: `https://api.example.com/v1/auth` — tokenized on `/`, each segment is short, fine
  - Base64-encoded English: `dGhlIHF1aWNrIGJyb3duIGZveA==` — entropy ≈ 4.3 — **fires** (and should, it's base64)
  - UUIDs: `550e8400-e29b-41d4-a716-446655440000` — the tokenizer splits on `-`, each chunk is 8–12 chars. `550e8400` = 8 chars (under 24 min length). Fine, UUIDs won't trigger false positives.
  - Long function names in code: `calculateCompoundInterestRateForAnnuityPayments` — 46 chars, entropy ≈ 4.3 — **fires**

  For a DLP product deployed to engineering teams, pasting code is the #1 use case. Long function/variable names firing the entropy rule will generate constant noise.

  Recommended threshold: **4.5 bits/char** at **minLength: 20**. Or raise to **3.8 + length ≥ 32** with a character-set diversity check (must contain both alpha and numeric chars).

  **2. Tokenizer character class includes `=` — captures base64 padding but skews entropy**
  The tokenizer regex is `/[A-Za-z0-9+/=_\-]{8,}/g`. Including `=` means base64 padded values get their trailing `==` included in entropy calculation. `=` chars lower the entropy of a base64 string. A 64-char base64 token with `==` padding has slightly lower entropy than the same token without. This is fine numerically but worth noting.

  **3. The tokenizer does NOT split on `.` or `:` or `/`**
  `http://user:password@host.com` is tokenized as one big run if it contains no whitespace. But since `.`, `:`, `/` are not in `[A-Za-z0-9+/=_-]`, actually the tokenizer *does* split on `.`, `:`, `@`. Let me re-examine: `/[A-Za-z0-9+/=_\-]{8,}/g` — the class contains `/` (forward slash), so URL paths like `/v1/auth/callback` would be tokenized as one long token including slashes. A URL path `/v1/auth/callback/reset` = 23 chars, entropy ≈ 3.8 — probably under threshold. But `/api/v1/users/export/all` = 24 chars including slashes, entropy ≈ 3.7. Fine.

  Actually the `/` inclusion is the correct behavior for base64 (`/` is a valid base64 char), but it means URL paths are treated as one token rather than split on `/`. This could cause false positives on long URL paths.

  **4. No allowlist for common high-entropy non-secrets**
  UUIDs, version strings, lorem ipsum, long English compound words — no mechanism to exclude known-benign patterns. A post-entropy allowlist check (e.g., if the token matches a UUID pattern, skip) would reduce FP rate significantly.

  **Proposed changes:**
  ```typescript
  // Raise entropy threshold in defaults.ts:
  minBitsPerChar: 4.5,  // was 4.0
  minTokenLength: 20,   // was 24 — counterintuitively, lower length + higher entropy is better

  // Add post-entropy UUID exclusion in findHighEntropyTokens:
  const UUID_RE = /^[0-9a-f]{8}[0-9a-f]{4}[0-9a-f]{4}[0-9a-f]{4}[0-9a-f]{12}$/i;
  const VERSION_RE = /^\d+\.\d+\.\d+/;
  // After computing entropy, before pushing to results:
  if (UUID_RE.test(token) || VERSION_RE.test(token)) continue;

  // Add charset diversity check — a secret should contain both alpha and numeric:
  const hasAlpha = /[A-Za-z]/.test(token);
  const hasDigit = /[0-9]/.test(token);
  if (!hasAlpha || !hasDigit) continue; // all-alpha long words are not secrets
  ```

---

#### `pretzel/src/detection/layer3-dictionary/exact.ts` — Exact and word-boundary dictionary matching
- [x] Reviewed
  **Verdict:** ISSUE
  **Findings:**

  **1. New `RegExp` is constructed per term per `exec` call — O(terms) regex compilations per scan**
  For a DictionaryRule with 100 terms, `runExactDictionaryRule` compiles 100 regexes on every invocation. Regex compilation is expensive in V8. For the content script running on every keypress or paste event, this adds measurable latency. Should compile and cache regexes at rule-load time, not at match time.

  **2. `\b` word boundaries break for terms containing non-word characters**
  Any dictionary term containing `-`, `.`, `@`, or other non-word chars (e.g., `project-alpha`, `user@domain`, `v2.0`) will produce a regex like `\bproject-alpha\b`. The `\b` before `p` asserts a word boundary at the start (correct), but the `\b` after `a` in `alpha` is at a word character at the end — this is fine. However for `user@domain`, `\buser@domain\b` — the `\b` after `n` in `domain` correctly anchors at word end. But `\b` before `u` works. The problem is the `@` in the middle: `\buser@domain\b` will match `user@domain` only if preceded/followed by non-word chars. This actually works. But for terms starting with a non-word char (e.g., `@handle`), `\b@handle\b` — the `\b` before `@` is a zero-width assertion between a non-word char and... wait, `@` is not a word char, so `\b` before `@` asserts a boundary between a word char and `@`. If the text is ` @handle `, there's a space before `@`, so both are non-word chars — `\b` does NOT match. The term `@handle` would never match.

  **3. No deduplication of findings**
  If a term appears N times in the text and also partially overlaps with another term match, N findings are emitted, each independently. There is no overlap suppression. In a 500-word document with the word "confidential" 20 times, 20 findings are pushed. This is correct behavior for the Finding list, but the UI needs to handle this (unknown if it does).

  **4. ReDoS from user-supplied dictionary terms**
  A custom dictionary rule with a term like `(a+)+` (which escaping converts to `\b\(a\+\)\+\b`) is safe because the metacharacters are escaped. However, the escape function `term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")` escapes all metacharacters, which is correct. ReDoS is not possible through dictionary terms. Good.

  **Proposed changes:**
  ```typescript
  // Fix 1: Cache compiled regexes
  const compiledDictCache = new WeakMap<DictionaryRule, Map<string, RegExp>>();

  export function runExactDictionaryRule(text: string, rule: DictionaryRule): Finding[] {
    let cache = compiledDictCache.get(rule);
    if (!cache) {
      cache = new Map();
      compiledDictCache.set(rule, cache);
    }
    const findings: Finding[] = [];
    for (const term of rule.terms) {
      let re = cache.get(term);
      if (!re) {
        const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        re = new RegExp(`\\b${escaped}\\b`, rule.caseSensitive ? "g" : "gi");
        cache.set(term, re);
      }
      re.lastIndex = 0; // reset for reuse
      // ... rest of matching
    }
    return findings;
  }
  ```

---

#### `pretzel/src/detection/layer3-dictionary/fuzzy.ts` — Levenshtein fuzzy term matching
- [x] Reviewed
  **Verdict:** ISSUE
  **Findings:**

  **1. O(words × terms × maxLen²) complexity — no budget guard**
  The full Levenshtein DP matrix is computed for every (word, term) pair. For a 1000-word document with 50 fuzzy terms each 20 chars long, and average word length ~6 chars:
  - 1000 × 50 = 50,000 Levenshtein calls
  - Each call: 6 × 20 = 120 cell DP = ~120 operations
  - Total: ~6,000,000 operations

  For a 5000-word document (a pasted contract): 30,000,000 operations. This will blow the 50ms budget. At ~100M simple JS ops/sec, this is ~300ms.

  **2. No early termination in Levenshtein when distance exceeds `maxDistance`**
  The DP computes the full matrix even when the minimum value in the current row already exceeds `maxDistance`. A standard optimization is to bail out early when the minimum value in any row exceeds the threshold. This alone gives a 3–5× speedup for typical maxDistance=1 or 2.

  **3. `maxDistance: 0` in fuzzyTerms is equivalent to exact matching but goes through the expensive DP path**
  The guard `if (dist <= maxDistance && dist > 0)` means `maxDistance=0` fuzzy terms never fire (because `dist > 0` excludes exact matches). This is a logic bug — if someone configures a fuzzy term with `maxDistance: 0`, they get no matches at all. They probably meant exact matching. Should use `dist <= maxDistance` without the `dist > 0` exclusion (or document clearly that exact matches belong in `terms`, not `fuzzyTerms`).

  **4. The 20-char term length cap is a good idea but the wrong axis to guard on**
  Capping term length at 20 chars limits the DP matrix size. But a 20-char term against a 20-char word is still a 20×20 = 400-cell matrix. The real budget threat is the number of words × terms, not term length alone. A 10,000-word document with 5 short fuzzy terms still costs 50,000 Levenshtein calls.

  **5. Fuzzy matching runs on every word including stop words and very short words**
  Words like "a", "the", "is", "of" (1–3 chars) are compared against every fuzzy term. For terms ≥ 4 chars, the Levenshtein distance will always exceed maxDistance=1 for these short words. Adding a minimum word length guard (e.g. skip words shorter than `min(term.length - maxDistance, 3)`) eliminates a large fraction of comparisons.

  **Proposed changes:**
  ```typescript
  // Fix 2: Early termination Levenshtein
  export function levenshtein(a: string, b: string, maxDist: number = Infinity): number {
    const m = a.length, n = b.length;
    if (Math.abs(m - n) > maxDist) return maxDist + 1; // length diff alone exceeds budget
    // Use two-row rolling approach instead of full matrix:
    let prev = Array.from({ length: n + 1 }, (_, j) => j);
    let curr = new Array(n + 1);
    for (let i = 1; i <= m; i++) {
      curr[0] = i;
      let rowMin = i;
      for (let j = 1; j <= n; j++) {
        curr[j] = a[i-1] === b[j-1]
          ? prev[j-1]!
          : 1 + Math.min(prev[j]!, curr[j-1]!, prev[j-1]!);
        rowMin = Math.min(rowMin, curr[j]!);
      }
      if (rowMin > maxDist) return maxDist + 1; // early exit
      [prev, curr] = [curr, prev];
    }
    return prev[n]!;
  }

  // Fix 3: Remove the dist > 0 guard (let maxDistance=0 work as exact match)
  if (dist <= maxDistance) { ... }

  // Fix 5: Skip words too short to possibly match within maxDistance
  while ((match = wordRe.exec(text)) !== null) {
    const word = ...;
    for (const { term, maxDistance } of rule.fuzzyTerms) {
      const compareTerm = ...;
      if (compareTerm.length > 20) continue;
      // Skip words that can't possibly match
      if (Math.abs(word.length - compareTerm.length) > maxDistance) continue;
      const dist = levenshtein(word, compareTerm, maxDistance);
      ...
    }
  }

  // Fix overall performance: consider using BK-tree for fuzzy lookup when terms.length > 10
  ```

---

## Summary Table

| File | Verdict | Critical Findings |
|---|---|---|
| `engine.ts` | WARN | Offset drift (raw vs normalised), inconsistent text passed to rules, no per-rule timeout |
| `normalize.ts` | ISSUE | Severely incomplete lookalike map (fullwidth ASCII, most Cyrillics, Greek missing), tab→4-spaces causes offset drift, missing RTL override strip |
| `code-block.ts` | ISSUE | Catastrophic backtracking on unterminated fences, inline backtick matches across newlines (false negatives), O(N×M) `isInsideCode` |
| `types.ts` | PASS | Clean |
| `pii.ts` | ISSUE | `ibanCheck` is a silent pass-through stub, `ssnCheck` missing group/serial validation |
| `api-keys.ts` (+ defaults) | WARN | OpenAI key regex matches project keys (duplicate findings), missing right-side boundaries on AWS/Google patterns |
| `credentials.ts` (+ defaults) | ISSUE | `dotenv-line` has no entropy gate on value — high FP on any env var with 8+ chars; JWT pattern misses unsigned JWTs |
| `network.ts` (+ defaults) | WARN | No octet range validation (0–255), missing IPv6 private ranges, fires on semver versions |
| `entropy.ts` | ISSUE | Default threshold 4.0 bits/char too low — long English words/identifiers will false-positive; no allowlist for UUIDs; `/` in token class over-captures URL paths |
| `exact.ts` | ISSUE | Regex compiled per term per call (no caching), `\b` fails for terms starting with non-word chars |
| `fuzzy.ts` | ISSUE | O(words × terms × len²) no early termination; `maxDistance=0` fuzzy terms never fire (logic bug); no minimum word-length pre-filter |

**Totals: 1 PASS / 2 WARN / 8 ISSUE**

---

## Top 5 Most Critical Detection Engineering Issues

### 1. ISSUE — Normalisation coverage is too shallow to stop encoding bypasses (`normalize.ts`)
The entire normalization layer — which is the first line of defense against obfuscation — only maps 7 Cyrillic letters. Fullwidth ASCII (`ｓｋ-...`), Greek homoglyphs (`οpеnai`), and a hundred other Unicode confusable categories are completely untouched. An adversary who knows about this extension can trivially bypass every single regex rule by using fullwidth or homoglyph characters. This is the highest-priority fix because it undermines the entire detection stack. Fix: adopt the Unicode Consortium's confusables.txt dataset (or a subset targeting the Latin+Cyrillic+Greek+Fullwidth blocks) and generate the LOOKALIKE_MAP from it. Also replace tab→4-spaces with tab→1-space to prevent offset drift.

### 2. ISSUE — `ibanCheck` is a no-op and `dotenv-line` has no entropy gate (`pii.ts`, `credentials.ts`)
Two separate validators either do nothing (`ibanCheck` always returns `true`) or accept any 8-char non-whitespace value as a credential (`dotenv-line` pattern `\S{8,}`). The IBAN stub means any future IBAN rule has zero false-positive filtering. The dotenv-line rule will fire on `NODE_ENV=production`, `PATH=/usr/bin`, `DEBUG=false` — essentially every environment variable ever pasted into an AI chat. In an enterprise context, IT admins will disable this rule within a week of rollout. Fix: implement mod-97 IBAN validation; restrict dotenv value pattern to a secret-like charset (`[A-Za-z0-9+/=_-]{16,}`) or add Shannon entropy gating on the matched value.

### 3. ISSUE — `code-block.ts` fenceRe has catastrophic backtracking on unterminated fences
A user pasting a large file that starts with ` ``` ` but has no closing fence triggers worst-case backtracking in `[\s\S]*?` combined with the `^` multiline anchor. On a 10KB text block this can take hundreds of milliseconds in the content script's main thread, directly violating the 50ms SLA and causing visible UI lag. Fix: replace the regex-based fence detector with a linear line-by-line scan (implementation provided above).

### 4. ISSUE — Entropy threshold of 4.0 bits/char produces unacceptable FP rates for engineering teams (`entropy.ts`)
Long function names, CamelCase identifiers, and compound English words exceed 4.0 bits/char at 24+ characters. The entropy rule will fire continuously in code-heavy prompts. In a B2B DLP product, false positives are more damaging than false negatives — they cause users and admins to turn off detection entirely. Fix: raise threshold to 4.5 bits/char, add charset diversity requirement (must contain both alpha + numeric to be considered secret-like), and add UUID allowlisting.

### 5. ISSUE — Fuzzy dictionary matching has no budget guard and a `maxDistance=0` logic bug (`fuzzy.ts`)
The Levenshtein DP runs on every word in the document for every fuzzy term, with no early termination and no timeout. A 5000-word pasted document with 20 fuzzy terms at maxDistance=2 costs ~30M operations — far beyond the 50ms budget. Additionally, fuzzy terms configured with `maxDistance=0` never fire at all (the `dist > 0` guard excludes exact matches), silently failing. Fix: implement early-termination Levenshtein with two-row rolling DP, add minimum word-length pre-filter, remove the `dist > 0` guard.
