# Threat Intelligence Review — Detection Coverage Audit
**Reviewer:** Isabella Torres, Threat Intelligence Analyst  
**Date:** 2026-06-08  
**Scope:** Layer 1 pattern rules, Layer 3 dictionary engine, detection types, and the full defaults policy  

---

## Methodology

I read every file in scope, cross-referenced actual detection logic in `engine.ts`, `normalize.ts`, `code-block.ts`, `defaults.ts`, and the schema. Verdicts are based on what a real enterprise employee would actually paste into ChatGPT/Claude/Gemini, informed by incident patterns I track across fintech, healthcare, legal, and government sectors. Where the code references a concept (e.g. "API keys") I verified what patterns are *actually* implemented, not just named.

---

## File Reviews

#### `pretzel/src/detection/layer1-patterns/pii.ts` — PII validator functions (Luhn, SSN, IBAN stubs)
- [x] Reviewed  
  **Verdict:** WARN  
  **Findings:**  
  The Luhn validator is solid and correctly implemented. The SSN validator correctly rejects area codes 000, 666, and 900–999. However this file only contains *validators* — the actual PII patterns in `defaults.ts` are extremely limited. The entire PII category ships with exactly **two rules**: credit card numbers and US SSNs. This is a significant under-coverage for any enterprise context.  

  Real-world PII that employees regularly paste into AI tools that would go completely undetected:
  - **EU GDPR-regulated identifiers**: German Personalausweis (`[LTNBG][0-9]{7}[LTNBG0-9]`), French INSEE numbers (`[12][0-9]{2}[0-1][0-9][0-9]{5}[0-9]{3}[0-9]{2}`), UK National Insurance numbers (`[A-CEGHJ-PR-TW-Z]{2}[0-9]{6}[A-D]`)
  - **US Driver's License numbers**: State-specific formats widely used in identity verification flows at fintech/insurance firms — employees paste these when asking AI to "validate" or "parse" customer data
  - **US Passport numbers** (`[A-Z][0-9]{8}`) — extremely common in travel/legal industries
  - **Date of Birth** in combination with names — the classic quasi-identifier combination. No signal at all
  - **IBAN numbers**: The `ibanCheck` function exists and is referenced in `PatternRuleSchema` as a valid validator, but the TODO comment in the file explicitly admits no IBAN pattern rule exists in defaults. IBANs appear constantly in European fintech prompts (e.g. "validate this IBAN: DE89370400440532013000")
  - **US Employer Identification Numbers (EIN)**: `\b[0-9]{2}-[0-9]{7}\b` — visually identical to SSN format but different structure; financial teams paste EINs routinely
  - **Medicare/Medicaid Beneficiary Identifiers (MBI)**: 11-character alphanumeric, used since 2018. Healthcare employees paste these constantly. Pattern: `[1-9][AC-HJ-NP-RT-Y][AC-HJ-NP-RT-Y0-9][AC-HJ-NP-RT-Y0-9][AC-HJ-NP-RT-Y0-9][AC-HJ-NP-RT-Y0-9][0-9][AC-HJ-NP-RT-Y][AC-HJ-NP-RT-Y0-9][0-9][AC-HJ-NP-RT-Y0-9]` 
  - **Health Plan Member IDs**: No pattern coverage whatsoever — these vary by payer but are widely leaked in healthcare prompt engineering sessions
  - **Phone numbers**: No detection. Employees routinely paste customer contact lists into AI tools for "formatting" or "deduplication" tasks

  The `ibanCheck` function is fully implemented (returns `true` as a passthrough stub) with a comment saying "TODO: add IBAN checksum validation when IBAN rule is added." This creates a misleading false sense of readiness — the hook is there but the pattern rule was never shipped.

  **Proposed changes:**  
  1. Add an IBAN pattern rule to `defaults.ts`: `pattern: "[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}"`, `validator: "iban"`, then implement real IBAN mod-97 checksum in `ibanCheck()` to cut false positives
  2. Add US phone number rule: `\b(\+1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b` — severity medium, action warn (high FP risk without context, but detectable)
  3. Add UK NI number, EU national ID patterns as optional rules (disabled by default, enabled by admin per vertical)
  4. Add MBI pattern for healthcare tenants as a custom rule template
  5. Implement real IBAN mod-97 checksum in `ibanCheck` to remove the `return true` stub

---

#### `pretzel/src/detection/layer1-patterns/api-keys.ts` — API key rule registry
- [x] Reviewed  
  **Verdict:** ISSUE  
  **Findings:**  
  This file is a **registry only** — it defines 7 rule IDs and an `isApiKeyRule` helper. The actual detection patterns live in `defaults.ts`. Reviewing both together:

  The 7 covered services: OpenAI (two variants), Anthropic, AWS access key ID, GitHub tokens, Slack tokens, Google API keys.

  **Critically missing** — services that appear in every enterprise environment I monitor:

  - **Stripe API keys**: `sk_live_[0-9a-zA-Z]{24,}` and `rk_live_[0-9a-zA-Z]{24,}` — fintech employees paste these constantly when debugging payment flows. Live key exposure means immediate financial risk
  - **Twilio credentials**: Account SID (`AC[a-z0-9]{32}`) and Auth Token (32-char hex) — comms-heavy companies leak these when asking AI to debug SMS workflows
  - **SendGrid / Mailgun API keys**: `SG\.[a-zA-Z0-9_-]{22}\.[a-zA-Z0-9_-]{43}` — email platform keys are widely leaked
  - **Azure credentials**: `DefaultAzureCredential` context aside, Azure storage SAS tokens (`sv=\d{4}-\d{2}-\d{2}&ss=`) and connection strings (`DefaultEndpointsProtocol=https;AccountName=`) are extremely common in Microsoft-shop environments. No coverage at all
  - **Databricks personal access tokens**: `dapi[a-f0-9]{32}` — data engineering teams paste these
  - **HuggingFace tokens**: `hf_[A-Za-z0-9]{34,}` — ML teams use these heavily and often treat them as "not real credentials"
  - **npm tokens**: `npm_[A-Za-z0-9]{36}` — supply chain risk vector, DevOps teams paste these
  - **PyPI API tokens**: `pypi-[A-Za-z0-9_-]{50,}` — same supply chain concern
  - **Cloudflare API tokens**: 40-char alphanumeric — infra teams routinely paste these
  - **HashiCorp Vault tokens**: `hvs\.[A-Za-z0-9_-]{90,}` — increasingly common in enterprise
  - **Okta API tokens**: 42-char hex string — IAM teams share these when asking AI for automation scripts
  - **AWS Secret Access Key**: The existing rule catches the Access Key ID (`AKIA/ASIA` prefix) but the corresponding **Secret Access Key** (40-char base64-like string, no prefix) is not detectable by pattern alone. The entropy rule *may* catch it, but there's no targeted rule. These almost always travel together — catching the key ID but missing the secret is a half-measure

  The `openai-project-key` pattern (`sk-proj-[A-Za-z0-9_\-]{20,}`) overlaps significantly with `openai-api-key` (`sk-[A-Za-z0-9_\-]{20,}`) since `sk-proj-` starts with `sk-`. Both rules will fire on a project key. This is a duplicate finding issue, not a security gap, but worth noting.

  **Proposed changes:**  
  1. Add Stripe live key rules (secret + restricted key variants) — severity critical, action block  
  2. Add Azure connection string pattern — severity critical, action block  
  3. Add HuggingFace, npm, PyPI token rules — severity high, action block  
  4. Add Databricks `dapi` token rule  
  5. Add AWS Secret Access Key as a complementary entropy-anchored rule (pair it with context: near "AWS_SECRET" in a dotenv context)  
  6. Make `openai-project-key` pattern anchored to `sk-proj-` only, exclude from `openai-api-key` match via negative lookahead to prevent duplicate findings: `sk-(?!proj)[A-Za-z0-9_\-]{20,}`

---

#### `pretzel/src/detection/layer1-patterns/credentials.ts` — Credentials rule registry
- [x] Reviewed  
  **Verdict:** WARN  
  **Findings:**  
  Four rules: PEM private key, SSH OpenSSH private key, JWT tokens, and `.env` assignment lines.

  The PEM and SSH patterns are good. JWT pattern is correct (detects the `eyJ...eyJ...sig` structure).

  The `dotenv-line` pattern (`\b[A-Z][A-Z0-9_]*=\S{8,}`) is scoped to `outside_code` which is sensible to reduce false positives in code snippets. However, the `\b` at the start doesn't anchor well to line boundaries — it will match inline tokens within prose like "the VALUE=something we saw." The `m` flag enables line-by-line matching but `\b` before `[A-Z]` in a multiline context doesn't enforce "start of line." In practice this means it may miss actual env lines that start after whitespace (indented env blocks) and fire on non-env prose.

  Missing credentials categories:

  - **OAuth 2.0 client secrets**: These don't have consistent prefixes but often appear in config blocks as `client_secret: <value>`. The dotenv rule partially catches `CLIENT_SECRET=...` but not YAML/JSON variants like `"client_secret": "abc123..."`
  - **Database connection strings**: `mongodb://user:password@host`, `postgresql://user:pass@host/db`, `mysql://...` — developers paste full connection strings constantly when asking AI to debug connection issues. These contain embedded credentials and hostnames. No pattern coverage
  - **Docker registry credentials / dockerconfig.json**: The base64-encoded auth blob in `.docker/config.json` format — no coverage
  - **Kubernetes secrets base64 blobs**: Teams paste `kubectl get secret -o yaml` output into ChatGPT for parsing help. The base64 values would hit entropy, but the structural pattern (`data:\n  key: <base64>`) isn't recognized
  - **Certificate thumbprints / fingerprints**: Not credentials per se, but expose infrastructure identity — often appear in error messages that employees paste
  - **Git credentials / HTTPS auth URLs**: `https://username:token@github.com/org/repo.git` — no coverage for embedded credentials in URLs
  - **PKCS#12 / PFX file indicators**: `-----BEGIN PKCS12-----` and similar — less common than PEM but still a real vector in enterprise certificate management contexts

  **Proposed changes:**  
  1. Add database connection string patterns for postgresql, mysql, mongodb, redis with embedded credentials  
  2. Add OAuth/OIDC credential block pattern for JSON/YAML context: `"client_secret"\s*:\s*"[A-Za-z0-9_\-\.]{16,}"`  
  3. Fix `dotenv-line` to use `^[A-Z][A-Z0-9_]+=\S{8,}` (caret, not `\b`) with the `m` flag to properly anchor to line starts  
  4. Add git HTTPS URL with embedded credentials: `https?://[^:]+:[^@]{6,}@`

---

#### `pretzel/src/detection/layer1-patterns/network.ts` — Network identifier rules
- [x] Reviewed  
  **Verdict:** ISSUE  
  **Findings:**  
  This is the most under-built category. Exactly **one rule**: RFC 1918 private IPs. That's it.

  Real-world network identifiers that enterprises consider sensitive and that appear regularly in AI prompts:

  - **Internal hostnames and FQDNs**: `app01.internal.corp.com`, `db-prod.us-east-1.aws.internal` — no detection. Employees paste server names when asking AI to debug infrastructure issues. These reveal internal naming conventions, environment topology, and cloud account structure
  - **MAC addresses**: `([0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}` — appear in network troubleshooting pastes, device logs
  - **IPv6 addresses**: No coverage whatsoever. As IPv6 adoption grows (especially in cloud-native environments), internal IPv6 addresses (`fc00::/7` ULA range, `fe80::/10` link-local) are increasingly present in logs and configs that employees paste
  - **CIDR notation blocks**: `10.0.0.0/8`, `172.16.0.0/12` — employees paste network architecture diagrams and firewall rules
  - **ASNs (Autonomous System Numbers)**: `AS[0-9]{1,6}` — less sensitive but can reveal ISP/peering relationships for regulated industries
  - **Internal port+service combinations**: Exposed internal services in paste context (`redis://10.0.1.5:6379`, `elasticsearch://10.0.1.10:9200`) — the IP would be caught but the service+port context adds exfiltration value
  - **Cloud-internal metadata service URLs**: `169.254.169.254` (AWS/GCP/Azure IMDS), `fd00:ec2::254` (IPv6 AWS IMDS) — if someone pastes code that calls the metadata service, these addresses should trigger. The RFC 1918 rule would miss `169.254.x.x` (link-local, not RFC 1918)
  - **VPN endpoint addresses / public IPs**: Employees paste VPN configuration files. Public IPs of company infrastructure aren't RFC 1918 but are still sensitive. No coverage for public IP ranges

  The single existing rule also has a subtle bug: the pattern `\b(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.)\d{1,3}\.\d{1,3}\b` doesn't validate that the trailing octets are 0–255. It would match `192.168.999.999`. For a `warn` severity rule this is acceptable but worth noting.

  **Proposed changes:**  
  1. Add IPv6 ULA and link-local pattern: `\b(fc[0-9a-f]{2}:|fd[0-9a-f]{2}:|fe80:)[0-9a-f:]+\b` (case-insensitive)  
  2. Add cloud IMDS IP: `169\.254\.169\.254`  
  3. Add MAC address pattern — severity low, action log (high FP potential in technical contexts)  
  4. Add internal FQDN heuristic: multi-label hostnames with `.internal`, `.corp`, `.local`, `.intra`, `.lan` TLDs  
  5. Fix octet validation in existing rule: `\d{1,3}` → `(?:25[0-5]|2[0-4]\d|1?\d\d?)` for correctness

---

#### `pretzel/src/detection/layer1-patterns/entropy.ts` — Shannon entropy scanner
- [x] Reviewed  
  **Verdict:** WARN  
  **Findings:**  
  The Shannon entropy implementation is mathematically correct. The `findHighEntropyTokens` function tokenizes on `[A-Za-z0-9+/=_\-]{8,}` which is a reasonable character set for secrets (covers base64, hex, alphanumeric with URL-safe chars).

  Issues and gaps:

  1. **Threshold calibration is not visible here** — the actual thresholds are in `defaults.ts` (`minTokenLength: 24, minBitsPerChar: 4.0`). A 4.0 bits/char threshold is reasonable but I've seen real secrets in the field that compress to 3.7–3.9 bits/char, particularly hex-encoded values (`deadbeef...`) and some UUID-derived tokens. At 24 chars minimum, a 32-char UUID (`550e8400-e29b-41d4-a716-446655440000`) would be tokenized as individual segments between the hyphens (8, 4, 4, 4, 12 chars) — the 8-char segment is below `minLength: 24`, so the UUID would **not be detected as a whole**. UUIDs used as API tokens (common in internal services) would thus be missed

  2. **Tokenizer character set excludes `:`** — Redis URLs (`redis://:password@host`) and other connection strings with colon-separated components are broken at the colon. The password component (`password`) may be too short or too low-entropy alone

  3. **Base64-encoded secrets with padding are correctly included** (`+/=` in charset), but the minimum length of 24 means a base64-encoded 16-byte secret (22 base64 chars before padding) might be borderline. `minTokenLength: 24` was likely chosen to avoid common English words but could miss some short secrets

  4. **No context awareness** — a high-entropy token in `"the password is XXXX"` and a high-entropy token in a UUID field are treated identically. This is likely unavoidable without an ML layer, but worth noting as a FP/FN tradeoff

  5. **Performance risk not addressed**: The `tokenRe` regex has no length cap on matches — a 10,000-character base64-encoded blob (e.g. a pasted certificate or encoded binary) would be tokenized as a single token and checked. This is fine for correctness but the comment says "keep it fast" for fuzzy matching without addressing the entropy scanner's own O(n) cost on long tokens

  **Proposed changes:**  
  1. Lower `minBitsPerChar` slightly to `3.8` or make it configurable per-tenant; consider a separate rule for hex-only tokens (lower entropy threshold for pure hex strings)  
  2. Add pre-processing to join UUID segments before entropy check: if a token matches UUID-like structure, concatenate the hex segments and score the full value  
  3. Document the known FP rate at the 4.0 threshold with test data so admins can tune confidently

---

#### `pretzel/src/detection/layer3-dictionary\exact.ts` — Exact and word-boundary dictionary matching
- [x] Reviewed  
  **Verdict:** WARN  
  **Findings:**  
  The implementation is clean. Word-boundary matching (`\b`) with case-insensitive option is correct for dictionary-style terms.

  Two technical concerns:

  1. **`\b` boundary on terms that start/end with non-word characters fails silently.** If an admin adds a term like `.env` or `#secret`, the `\b` before the escaped term will never match because `.` and `#` are not word characters — the boundary requires a word character at the start. The escaping is correct (`replace(/[.*+?^${}()|[\]\\]/g, "\\$&")`) but this means period-prefixed terms simply produce zero matches rather than erroring. There's no validation warning

  2. **No dictionary terms are shipped in `defaults.ts`.** The dictionary rule infrastructure (both exact and fuzzy) is fully implemented but `DEFAULT_POLICY.baseline` contains zero `DictionaryRule` entries and zero `ScoreRule` entries. The `custom: []` array is also empty. This means Layer 3 is **completely non-functional** out of the box — there's nothing in the baseline to power it. The engine code for dictionary matching is solid, but from a threat coverage standpoint the layer doesn't exist at runtime for a fresh install

  What dictionary rules *should* ship by default for enterprise DLP:
  - Internal project codenames / product names (tenant-configured, not baseline)
  - Classification labels: `"CONFIDENTIAL"`, `"SECRET"`, `"TOP SECRET"`, `"RESTRICTED"`, `"FOR INTERNAL USE ONLY"`, `"PROPRIETARY"`, `"NDA"`, `"DO NOT DISTRIBUTE"` — these appear as headers in documents employees paste. Any document with these labels should trigger at minimum a warn
  - HIPAA PHI field labels: `"patient_id"`, `"MRN"`, `"diagnosis"`, `"medication"`, `"insurance_id"` as exact terms
  - Legal privileged markers: `"Attorney-Client Privilege"`, `"Attorney Work Product"`, `"PRIVILEGED AND CONFIDENTIAL"`
  - PCI-DSS related terms: `"cardholder data"`, `"PAN"` (in financial context), `"CVV"`, `"CVC"`, `"security code"`

  **Proposed changes:**  
  1. Add a baseline `DictionaryRule` for document classification labels (`CONFIDENTIAL`, `SECRET`, etc.) — severity high, action warn, case-sensitive: true  
  2. Add a baseline `DictionaryRule` for legal privilege markers — severity high, action warn  
  3. Add validation in `runExactDictionaryRule` (or at policy load time) to warn when a term begins with a non-word character and `\b` anchoring is used  
  4. Create a library of tenant-template dictionary rules for healthcare (HIPAA), legal (privilege), and finance (PCI) verticals that admins can enable

---

#### `pretzel/src/detection/layer3-dictionary\fuzzy.ts` — Levenshtein-based fuzzy dictionary matching
- [x] Reviewed  
  **Verdict:** WARN  
  **Findings:**  
  The Levenshtein implementation is correct. The 20-character term length cap is a reasonable performance safeguard. The per-word scan approach is correct for word-level fuzzy matching.

  Issues:

  1. **Same problem as exact.ts: no fuzzy terms are shipped in defaults.** The `DEFAULT_POLICY` has no dictionary rules at all, so `fuzzyTerms` is never populated in practice. This layer is infrastructure without cargo

  2. **Word-level tokenization misses multi-word variants.** The regex `\b\w+\b` splits on all whitespace and punctuation, so "Social Security Number" cannot be detected as a fuzzy phrase — only individual words are scored. A typo like "Socal Security Nubmer" would score each word independently, and "Socal" might not match "Social" within distance 1 (it's distance 2: delete 'i', insert nothing... actually Levenshtein("socal", "social") = 1 — this would work). But "Nubmer" vs "Number" is distance 2, which would need `maxDistance: 2`. The point is phrase-level fuzzy matching is architecturally absent

  3. **`dist > 0` condition excludes exact matches from fuzzy results.** This is by design (exact matches are handled by `runExactDictionaryRule`) but it means if both exact and fuzzy rules are defined for the same term, there's no double-counting. This is good but should be documented

  4. **No context window around fuzzy matches.** A fuzzy hit on the word "pasword" (typo for "password") in a context like "the password strength is good" produces a finding with `matchedText: "pasword"` but no surrounding context is captured for the reviewer to assess false positive risk. The `buildSnippet` function in `engine.ts` exists but is not called here — it's only used for specific contexts elsewhere

  5. **False positive risk for short terms.** If a tenant adds the term `"key"` with `maxDistance: 1`, the word `"hey"` would match (distance 1). The 20-char cap prevents fuzzy matching of long terms, but there's no minimum term length guard — a 3-character term with maxDistance 1 would match almost any 3-letter word

  **Proposed changes:**  
  1. Add a minimum term length guard in `runFuzzyDictionaryRule`: skip fuzzy matching if `compareTerm.length < 5` to prevent spurious short-term matches  
  2. Add phrase-level fuzzy matching as a future capability: tokenize text into overlapping n-grams matching the term's word count, then compute aggregate edit distance  
  3. Ship at least one fuzzy rule in defaults (e.g., fuzzy match on `"password"`, `"secret"`, `"private key"` as word-level terms) to validate the infrastructure works in real deployments  
  4. Add `maxDistance` validation at policy load time: reject `maxDistance > term.length / 2` to prevent degenerate rules

---

#### `pretzel/src/detection/types.ts` — Core detection types and severity/action ordering
- [x] Reviewed  
  **Verdict:** PASS  
  **Findings:**  
  The type system is clean and well-structured. The severity ordering (`low < medium < high < critical`) and action ordering (`log < warn < require_confirmation < block`) are correctly implemented. `maxAction` correctly uses `>=` to prefer the higher action when equal, preventing rollback. The `Finding` interface correctly truncates `matchedText` at 200 chars in the description.

  One design observation: `DetectionResult.promptHash` is described as "SHA-256 hex of the normalised prompt" for caching. This means two prompts that normalize identically (e.g., one with em-dashes, one with hyphens) would share a cache entry. This is by design but means a user could theoretically modify a prompt after a cached scan returns a clean result — the cache would still return clean. This is acceptable if the cache TTL is very short (session-scoped) but worth auditing in the cache invalidation logic.

  The `signInNudge?: true` field is interesting from a threat model perspective: detection runs even for unauthenticated users (to show the nudge), but unauthenticated findings presumably aren't audited. If so, this is a blind spot — a user who hasn't signed in can probe the detection engine's behavior without leaving audit traces.

  **Proposed changes:** N/A for the type definitions themselves. Flag the unauthenticated-user audit gap for the security team.

---

## Summary Table

| File | Verdict | Key Issue |
|---|---|---|
| `layer1-patterns/pii.ts` | WARN | Only 2 PII types (CC + SSN); IBAN stub but no rule; no phone, passport, DOB, MBI |
| `layer1-patterns/api-keys.ts` | ISSUE | 7 services covered; Stripe, Azure, HuggingFace, npm, Twilio, Databricks all missing |
| `layer1-patterns/credentials.ts` | WARN | No DB connection strings, no OAuth client secrets, dotenv `\b` anchor bug |
| `layer1-patterns/network.ts` | ISSUE | 1 rule (RFC1918 IPv4); no IPv6, no IMDS, no internal FQDNs, no MAC addresses |
| `layer1-patterns/entropy.ts` | WARN | UUID tokenization gap; threshold may miss hex secrets; no context awareness |
| `layer3-dictionary/exact.ts` | WARN | Solid engine; zero baseline terms shipped; `\b` fails on non-word-char terms |
| `layer3-dictionary/fuzzy.ts` | WARN | Solid engine; zero baseline fuzzy terms; no min-length guard; no phrase matching |
| `detection/types.ts` | PASS | Clean types; flag unauthenticated audit blind spot |

**Counts: 2 ISSUE / 5 WARN / 1 PASS**

---

## Top 5 Critical Coverage Gaps

### 1. API Key Coverage is Dangerously Incomplete (ISSUE)
The 7 covered services represent a tiny fraction of the SaaS credential surface in any enterprise. **Stripe live secret keys** (`sk_live_*`) are the highest-priority gap: a leaked Stripe key means immediate financial fraud capability. This is the most common high-severity credential I see in incident reports involving AI tool misuse. HuggingFace tokens (`hf_*`) are the second-highest because ML teams treat them as "not real secrets" — they are, and models/datasets can be exfiltrated. Add Stripe, Azure, Twilio, HuggingFace, npm, PyPI, Databricks as immediate additions.

### 2. Layer 3 Dictionary Engine is a Ghost — No Terms Shipped (WARN × 2)
Both `exact.ts` and `fuzzy.ts` implement working detection engines, but `DEFAULT_POLICY` ships with `custom: []` and no `DictionaryRule` entries in `baseline`. This means the entire Layer 3 is inert for any fresh installation. The most impactful single fix would be to ship a baseline dictionary rule matching document classification labels (`CONFIDENTIAL`, `SECRET`, `RESTRICTED`, `PROPRIETARY`, `PRIVILEGED AND CONFIDENTIAL`, `ATTORNEY-CLIENT PRIVILEGE`). These labels appear on nearly every enterprise document that employees shouldn't be pasting into AI tools, and they require zero false-positive risk tuning — they're explicit markers.

### 3. Network Identifier Coverage is a Single Regex (ISSUE)
The entire network category is one RFC 1918 IPv4 pattern. Internal hostnames (`*.internal`, `*.corp`) are arguably *more* sensitive than IP addresses — they reveal infrastructure naming, environment structure, and cloud topology. Employees paste Terraform outputs, kubectl describe output, and error logs containing internal FQDNs constantly. The cloud metadata endpoint `169.254.169.254` is an active SSRF and token-exfiltration target — if an employee pastes code that calls this endpoint, detection should fire. This gap is particularly acute for DevOps and SRE teams.

### 4. Non-US PII is Entirely Absent (WARN)
The PII category covers US SSN and generic credit cards. Any enterprise with EU customers or employees is subject to GDPR — there is no detection for any EU PII format (German, French, Italian, Spanish national IDs; UK National Insurance numbers). For healthcare tenants, Medicare Beneficiary Identifiers (MBIs) replaced SSNs as the primary patient identifier in 2018 — the SSN rule won't catch them. For a product targeting enterprise DLP across verticals and geographies, single-country PII coverage is a significant market and compliance risk.

### 5. Database Connection Strings with Embedded Credentials Are Undetected (WARN)
Developers routinely paste full database connection strings into AI tools when debugging: `postgresql://admin:SuperSecret123@prod-db.internal:5432/customers`. This single paste contains a username, password, internal hostname, port, and database name — five categories of sensitive data — and would only partially trigger detection (the RFC 1918 IP pattern if the host is a private IP; the entropy rule might catch the password if it's long enough). A targeted pattern for connection string URLs with embedded credentials (`[a-z]+://[^:]+:[^@]{6,}@`) would catch this entire class of leaks in one rule and is trivially implementable.
