# Extension Sync + ScoreRule Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add law-firm detection (ScoreRule engine), paste-event tracking, cloud policy sync, role-based UI, and subscription badge to the existing Chrome extension.

**Architecture:** Pure additions and targeted modifications to the existing extension codebase. `ScoreRule` is a new rule kind added to `types.ts` and `schema.ts`; the engine handles it when a paste flag is set. Two new modules (`sync.ts`, `role.ts`) manage cloud sync and role detection. The background service worker gains an alarm-based 30-minute sync cycle. UI gains an amber/red subscription badge in the popup and a role gate on the options editor.

**Tech Stack:** Existing stack — Vitest (node env), TypeScript, React, Chrome Extension APIs.

---

## File Map

```
src/
  detection/
    types.ts           MODIFY — add ScoreSignalConfig, ScoreRule interfaces
    engine.ts          MODIFY — add runScoreRule, countWords, avgSentenceLength; update runRule + detectPrompt signature
  policy/
    schema.ts          MODIFY — add ScoreRuleSchema, update RuleSchema discriminated union
    sync.ts            NEW    — syncPolicy(): poll /version then /policy, handle 402
    role.ts            NEW    — getRole(): reads org/admin tokens from managed + local storage
  shared/
    messages.ts        MODIFY — add pasteDetected to DETECT payload; add SYNC_NOW, GET_ROLE message types
  background/
    service-worker.ts  MODIFY — pass pasteDetected to detectPrompt; handle SYNC_NOW + GET_ROLE; start 30-min alarm
  content/
    content-script.ts  MODIFY — track paste events; include pasteDetected in DETECT message
  popup/
    Popup.tsx          MODIFY — read subscriptionWarning + subscriptionExpired flags; show badge
  options/
    App.tsx            MODIFY — read role via GET_ROLE message; gate editor to admin-only
tests/
  unit/
    detection/
      score-rule.test.ts    NEW
    policy/
      sync.test.ts          NEW
      role.test.ts          NEW
```

---

### Task 1: ScoreRule types + schema

**Files:**
- Modify: `src/detection/types.ts`
- Modify: `src/policy/schema.ts`
- Create: `tests/unit/detection/score-rule.test.ts` (skeleton — actual tests in Task 2)

- [ ] **Step 1: Write failing import test**

```typescript
// tests/unit/detection/score-rule.test.ts
import { describe, it, expect } from 'vitest'
import type { ScoreRule, ScoreSignalConfig } from '@/detection/types'
import { ScoreRuleSchema } from '@/policy/schema'

describe('ScoreRule types', () => {
  it('ScoreRuleSchema validates a well-formed score rule', () => {
    const rule: ScoreRule = {
      kind: 'score',
      id: 'test-score',
      name: 'Test Score',
      description: 'Test',
      severity: 'high',
      action: 'block',
      enabled: true,
      tags: [],
      signals: [{ id: 'paste_detected', description: 'Paste', points: 20, enabled: true }],
      warnThreshold: 50,
      confirmThreshold: 80,
    }
    expect(ScoreRuleSchema.safeParse(rule).success).toBe(true)
  })

  it('rejects a rule missing warnThreshold', () => {
    const bad = { kind: 'score', id: 'x', name: 'x', description: '', severity: 'low', action: 'log', enabled: true, tags: [], signals: [], confirmThreshold: 80 }
    expect(ScoreRuleSchema.safeParse(bad).success).toBe(false)
  })
})
```

Run: `npx vitest run tests/unit/detection/score-rule.test.ts`
Expected: FAIL — imports not found.

- [ ] **Step 2: Add ScoreSignalConfig and ScoreRule to `src/detection/types.ts`**

Append to the end of the file (after the existing exports):

```typescript
export interface ScoreSignalConfig {
  id: string
  description: string
  points: number
  enabled: boolean
  /** Optional numeric threshold (e.g. word count for long_text signal). */
  threshold?: number
}

export interface ScoreRule {
  kind: "score"
  id: string
  name: string
  description: string
  severity: Severity
  action: Action
  enabled: boolean
  tags: string[]
  signals: ScoreSignalConfig[]
  warnThreshold: number
  confirmThreshold: number
}
```

- [ ] **Step 3: Add ScoreRuleSchema to `src/policy/schema.ts`**

After the existing `DictionaryRuleSchema` definition, add:

```typescript
export const ScoreSignalConfigSchema = z.object({
  id: z.string(),
  description: z.string(),
  points: z.number(),
  enabled: z.boolean(),
  threshold: z.number().optional(),
})

export const ScoreRuleSchema = RuleBaseSchema.extend({
  kind: z.literal("score"),
  signals: z.array(ScoreSignalConfigSchema),
  warnThreshold: z.number().int().min(10).max(100),
  confirmThreshold: z.number().int().min(10).max(100),
})
```

Then update the `RuleSchema` discriminated union to include `ScoreRuleSchema`:

```typescript
export const RuleSchema = z.discriminatedUnion("kind", [
  PatternRuleSchema,
  EntropyRuleSchema,
  DictionaryRuleSchema,
  ScoreRuleSchema,
]);
```

Also add the derived TS types at the bottom of `schema.ts`:

```typescript
export type ScoreSignalConfig = z.infer<typeof ScoreSignalConfigSchema>;
export type ScoreRule = z.infer<typeof ScoreRuleSchema>;
```

Remove the duplicate `Severity` and `Action` exports if TypeScript complains about them conflicting with `types.ts` — keep only the Zod-derived ones in `schema.ts` and the manual ones in `types.ts` (they match; the extension uses both files independently).

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/unit/detection/score-rule.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/detection/types.ts src/policy/schema.ts tests/unit/detection/score-rule.test.ts
git commit -m "feat(extension): add ScoreRule types and Zod schema"
```

---

### Task 2: ScoreRule engine

**Files:**
- Modify: `src/detection/engine.ts`
- Modify: `tests/unit/detection/score-rule.test.ts`

The engine runs ScoreRule entries only when `pasteDetected` is `true`. Each signal has a built-in test function identified by `signal.id`; unknown IDs are silently skipped.

- [ ] **Step 1: Add engine tests** — replace the contents of `tests/unit/detection/score-rule.test.ts`

```typescript
import { describe, it, expect } from 'vitest'
import type { ScoreRule } from '@/detection/types'
import { ScoreRuleSchema } from '@/policy/schema'
import { runScoreRuleForTest } from '@/detection/engine'

describe('ScoreRule schema', () => {
  it('validates a well-formed score rule', () => {
    const rule: ScoreRule = {
      kind: 'score',
      id: 'test-score',
      name: 'Test',
      description: '',
      severity: 'high',
      action: 'block',
      enabled: true,
      tags: [],
      signals: [{ id: 'paste_detected', description: 'Paste', points: 20, enabled: true }],
      warnThreshold: 50,
      confirmThreshold: 80,
    }
    expect(ScoreRuleSchema.safeParse(rule).success).toBe(true)
  })
})

describe('runScoreRuleForTest', () => {
  const baseRule: ScoreRule = {
    kind: 'score',
    id: 'legal',
    name: 'Legal',
    description: '',
    severity: 'high',
    action: 'block',
    enabled: true,
    tags: [],
    signals: [
      { id: 'paste_detected',      description: 'Paste',            points: 20, enabled: true },
      { id: 'long_text',           description: 'Long text',        points: 20, enabled: true, threshold: 5 },
      { id: 'legal_terms_whereas', description: 'Legal terms',      points: 25, enabled: true },
      { id: 'block_quote',         description: 'Block quote (neg)', points: -15, enabled: true },
    ],
    warnThreshold: 50,
    confirmThreshold: 80,
  }

  it('returns no findings when score is below warnThreshold', () => {
    // Only paste_detected fires (20 pts) — below 50 threshold
    expect(runScoreRuleForTest('short text', baseRule, true)).toHaveLength(0)
  })

  it('returns a warn-level finding when score is between thresholds', () => {
    // paste(20) + long_text(20) + legal_terms(25) = 65 — above warn(50) but below confirm(80)
    const text = 'word '.repeat(10) + 'WHEREAS some long legal clause with many many words spread across'
    const findings = runScoreRuleForTest(text, baseRule, true)
    expect(findings).toHaveLength(1)
    expect(findings[0]!.action).toBe('warn')
  })

  it('returns a block-level finding when score >= confirmThreshold', () => {
    // paste(20) + long_text(20) + legal_terms(25) = 65... need more: add another signal manually
    const rule: ScoreRule = {
      ...baseRule,
      signals: [
        { id: 'paste_detected',      description: 'Paste',    points: 40, enabled: true },
        { id: 'long_text',           description: 'Long',     points: 20, enabled: true, threshold: 5 },
        { id: 'legal_terms_whereas', description: 'Terms',    points: 25, enabled: true },
      ],
    }
    const text = 'word '.repeat(10) + 'WHEREAS this is a legal document with more words here and there'
    const findings = runScoreRuleForTest(text, rule, true)
    expect(findings).toHaveLength(1)
    expect(findings[0]!.action).toBe('block')
  })

  it('returns no findings when pasteDetected is false', () => {
    const text = 'word '.repeat(10) + 'WHEREAS HEREBY IN WITNESS WHEREOF legal document content'
    // Would score high if paste, but pasteDetected=false means ScoreRule is skipped
    expect(runScoreRuleForTest(text, baseRule, false)).toHaveLength(0)
  })

  it('disabled signals do not contribute to score', () => {
    const rule: ScoreRule = {
      ...baseRule,
      signals: [
        { id: 'paste_detected', description: 'Paste', points: 20, enabled: false },
        { id: 'long_text',      description: 'Long',  points: 20, enabled: false, threshold: 5 },
      ],
    }
    expect(runScoreRuleForTest('word '.repeat(10), rule, true)).toHaveLength(0)
  })

  it('block_quote signal subtracts points', () => {
    const rule: ScoreRule = {
      ...baseRule,
      signals: [
        { id: 'paste_detected', description: 'Paste',       points: 40, enabled: true },
        { id: 'long_text',      description: 'Long',        points: 20, enabled: true, threshold: 5 },
        { id: 'block_quote',    description: 'Block quote', points: -15, enabled: true },
      ],
      warnThreshold: 50,
    }
    // paste(40) + long_text(20) - block_quote(15) = 45 < 50 → no finding
    const text = '> quoted line\n' + 'word '.repeat(10)
    expect(runScoreRuleForTest(text, rule, true)).toHaveLength(0)
  })
})
```

Run: `npx vitest run tests/unit/detection/score-rule.test.ts`
Expected: FAIL — `runScoreRuleForTest` not exported.

- [ ] **Step 2: Add ScoreRule engine to `src/detection/engine.ts`**

Add these imports at the top of the file (after existing imports):

```typescript
import type { ScoreRule, ScoreSignalConfig } from "@/detection/types";
```

Add helper functions after `buildSnippet`:

```typescript
function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function avgSentenceLength(text: string): number {
  const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 0);
  if (sentences.length === 0) return 0;
  return sentences.reduce((sum, s) => sum + countWords(s), 0) / sentences.length;
}

const SIGNAL_TESTS: Record<
  string,
  (text: string, pasteDetected: boolean, signal: ScoreSignalConfig) => boolean
> = {
  paste_detected: (_t, p) => p,
  long_text: (t, _p, s) => countWords(t) > (s.threshold ?? 400),
  legal_terms_whereas: (t) => /\b(?:WHEREAS|HEREBY)\b|IN WITNESS WHEREOF/i.test(t),
  numbered_paragraphs: (t) => /^\s*\d+\./m.test(t),
  long_avg_sentence: (t) => avgSentenceLength(t) > 25,
  formal_heading: (t) => /^[A-Z][A-Z\s]{3,}$/m.test(t),
  block_quote: (t) => /^>/m.test(t) || /^ {4}/m.test(t),
};

/** Exported for unit testing only — not part of the public API. */
export function runScoreRuleForTest(
  text: string,
  rule: ScoreRule,
  pasteDetected: boolean
): Finding[] {
  return runScoreRule(text, rule, pasteDetected);
}

function runScoreRule(text: string, rule: ScoreRule, pasteDetected: boolean): Finding[] {
  if (!pasteDetected) return [];
  let score = 0;
  for (const signal of rule.signals) {
    if (!signal.enabled) continue;
    const fn = SIGNAL_TESTS[signal.id];
    if (fn && fn(text, pasteDetected, signal)) score += signal.points;
  }
  if (score < rule.warnThreshold) return [];
  const action: Finding["action"] =
    score >= rule.confirmThreshold ? rule.action : "warn";
  return [
    {
      ruleId: rule.id,
      ruleName: rule.name,
      severity: rule.severity,
      action,
      matchedText: text.slice(0, 200),
      startOffset: 0,
      endOffset: text.length,
    },
  ];
}
```

Update the `runRule` function to handle `ScoreRule`. The function signature must also accept `pasteDetected`:

```typescript
function runRule(
  text: string,
  normalised: string,
  rule: Rule | ScoreRule,
  codeSpans: ReturnType<typeof findCodeSpans>,
  pasteDetected: boolean
): Finding[] {
  if (!rule.enabled) return [];
  switch (rule.kind) {
    case "pattern":
      return runPatternRule(text, normalised, rule, codeSpans);
    case "entropy":
      return runEntropyRule(normalised, rule);
    case "dictionary":
      return runDictionaryRule(normalised, rule);
    case "score":
      return runScoreRule(text, rule, pasteDetected);
  }
}
```

Update `detectPrompt` to accept and pass `pasteDetected`:

```typescript
export async function detectPrompt(
  promptText: string,
  policy: Policy,
  hostname: string,
  pasteDetected = false
): Promise<DetectionResult> {
```

And update the inner call to `runRule`:

```typescript
const ruleFindings = runRule(promptText, normalised, rule as Rule | ScoreRule, codeSpans, pasteDetected);
```

Update the import of `Rule` to include `ScoreRule` in the type union used in `runRule`. Since `ScoreRule` is not in the Zod discriminated union yet (it's in `detection/types.ts`), cast it inline as shown.

- [ ] **Step 3: Run tests**

Run: `npx vitest run tests/unit/detection/score-rule.test.ts`
Expected: all PASS.

- [ ] **Step 4: Commit**

```bash
git add src/detection/engine.ts src/detection/types.ts tests/unit/detection/score-rule.test.ts
git commit -m "feat(extension): ScoreRule engine with paste-triggered scoring"
```

---

### Task 3: Paste tracking in content script

**Files:**
- Modify: `src/shared/messages.ts`
- Modify: `src/content/content-script.ts`

- [ ] **Step 1: Add `pasteDetected` to DETECT message in `src/shared/messages.ts`**

Change:
```typescript
| { type: "DETECT"; payload: { text: string; hostname: string } }
```
To:
```typescript
| { type: "DETECT"; payload: { text: string; hostname: string; pasteDetected?: boolean } }
```

Also add three new message types at the end of the `Message` union (before the closing semicolon):

```typescript
  | { type: "SYNC_NOW"; payload?: never }
  | { type: "GET_ROLE"; payload?: never }
  | { type: "GET_SUBSCRIPTION_STATUS"; payload?: never }
```

- [ ] **Step 2: Add paste tracking and pass flag in `src/content/content-script.ts`**

Inside the `bootstrap` function, add paste tracking right after the `logger.info` line:

```typescript
// Track paste events so ScoreRule knows whether text was pasted or typed
let lastPasteAt = 0;
document.addEventListener("paste", () => { lastPasteAt = Date.now(); }, { capture: true });

function wasPasteRecent(): boolean {
  return Date.now() - lastPasteAt < 500;
}
```

In the `onSendIntent` handler, update the DETECT message send to include `pasteDetected`:

```typescript
const result: DetectionResult = await sendMessage({
  type: "DETECT",
  payload: { text: promptText, hostname, pasteDetected: wasPasteRecent() },
});
```

- [ ] **Step 3: Update background service-worker to pass `pasteDetected` to `detectPrompt`**

In `src/background/service-worker.ts`, update the `DETECT` case:

```typescript
case "DETECT": {
  const { text, hostname, pasteDetected } = message.payload;
  const policy = await loadPolicy();
  return detectPrompt(text, policy, hostname, pasteDetected ?? false);
}
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/shared/messages.ts src/content/content-script.ts src/background/service-worker.ts
git commit -m "feat(extension): track paste events and pass pasteDetected flag to ScoreRule engine"
```

---

### Task 4: Policy sync module

**Files:**
- Create: `src/policy/sync.ts`
- Create: `tests/unit/policy/sync.test.ts`

The sync module calls the backend API using the `org_token` stored in Chrome managed or local storage. On 402 it sets a `subscriptionExpired` flag and preserves the last cached policy.

- [ ] **Step 1: Write failing tests**

```typescript
// tests/unit/policy/sync.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock chrome APIs before importing the module
const mockManagedGet = vi.fn()
const mockLocalGet = vi.fn()
const mockLocalSet = vi.fn()

vi.stubGlobal('chrome', {
  storage: {
    managed: { get: mockManagedGet },
    local: { get: mockLocalGet, set: mockLocalSet },
  },
})

// Mock fetch
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

const { syncPolicy } = await import('@/policy/sync')

const TOKEN = 'ps_live_acmelaw_' + 'a'.repeat(32)
const POLICY_RESPONSE = {
  version: 3,
  policy: { version: 1, baseline: [], custom: [], perSite: {}, allowSendAnywayWithReason: false, auditRetentionDays: 365 },
  tenantName: 'Acme Law',
  plan: 'pro',
  expiresAt: null,
}

beforeEach(() => {
  vi.clearAllMocks()
  mockManagedGet.mockResolvedValue({})       // no managed storage by default
  mockLocalGet.mockImplementation((keys: string | string[]) => {
    if (Array.isArray(keys) ? keys.includes('orgToken') : keys === 'orgToken') {
      return Promise.resolve({ orgToken: TOKEN })
    }
    return Promise.resolve({})
  })
  mockLocalSet.mockResolvedValue(undefined)
})

describe('syncPolicy', () => {
  it('does nothing when no org token is present', async () => {
    mockLocalGet.mockResolvedValue({})
    await syncPolicy()
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('skips full policy fetch when version is unchanged', async () => {
    mockLocalGet.mockImplementation((keys: unknown) => {
      const k = Array.isArray(keys) ? keys : [keys]
      const result: Record<string, unknown> = {}
      if ((k as string[]).includes('orgToken')) result['orgToken'] = TOKEN
      if ((k as string[]).includes('cachedPolicyVersion')) result['cachedPolicyVersion'] = 3
      return Promise.resolve(result)
    })
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ version: 3 }),
    })
    await syncPolicy()
    expect(mockFetch).toHaveBeenCalledTimes(1) // only /version, not /policy
  })

  it('fetches and stores policy when version changes', async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ version: 3 }) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(POLICY_RESPONSE) })
    await syncPolicy()
    expect(mockFetch).toHaveBeenCalledTimes(2)
    expect(mockLocalSet).toHaveBeenCalledWith(expect.objectContaining({
      cachedPolicyVersion: 3,
      tenantName: 'Acme Law',
      subscriptionExpired: false,
    }))
  })

  it('sets subscriptionExpired flag on 402 from /version', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 402 })
    await syncPolicy()
    expect(mockLocalSet).toHaveBeenCalledWith({ subscriptionExpired: true })
  })

  it('sets subscriptionExpired flag on 402 from /policy', async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ version: 5 }) })
      .mockResolvedValueOnce({ ok: false, status: 402 })
    await syncPolicy()
    expect(mockLocalSet).toHaveBeenCalledWith({ subscriptionExpired: true })
  })

  it('does not throw on network error — leaves cached policy intact', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'))
    await expect(syncPolicy()).resolves.not.toThrow()
    expect(mockLocalSet).not.toHaveBeenCalled()
  })
})
```

Run: `npx vitest run tests/unit/policy/sync.test.ts`
Expected: FAIL — `@/policy/sync` not found.

- [ ] **Step 2: Create `src/policy/sync.ts`**

```typescript
const API_BASE = "https://api.promptshield.dev";

async function getOrgToken(): Promise<string | null> {
  const managed = await chrome.storage.managed.get("orgToken").catch(() => ({})) as Record<string, unknown>;
  if (typeof managed["orgToken"] === "string") return managed["orgToken"];
  const local = await chrome.storage.local.get("orgToken") as Record<string, unknown>;
  return typeof local["orgToken"] === "string" ? local["orgToken"] : null;
}

async function getCachedVersion(): Promise<number | null> {
  const result = await chrome.storage.local.get("cachedPolicyVersion") as Record<string, unknown>;
  const v = result["cachedPolicyVersion"];
  return typeof v === "number" ? v : null;
}

export async function syncPolicy(): Promise<void> {
  const token = await getOrgToken();
  if (!token) return;

  try {
    const versionRes = await fetch(`${API_BASE}/v1/policy/version`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!versionRes.ok) {
      if (versionRes.status === 402) await chrome.storage.local.set({ subscriptionExpired: true });
      return;
    }
    const { version } = await versionRes.json() as { version: number };
    const cached = await getCachedVersion();
    if (cached === version) return;

    const policyRes = await fetch(`${API_BASE}/v1/policy`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!policyRes.ok) {
      if (policyRes.status === 402) await chrome.storage.local.set({ subscriptionExpired: true });
      return;
    }
    const body = await policyRes.json() as {
      version: number; policy: unknown; warning?: string; tenantName: string;
    };
    await chrome.storage.local.set({
      policy: body.policy,
      cachedPolicyVersion: body.version,
      tenantName: body.tenantName,
      subscriptionExpired: false,
      subscriptionWarning: body.warning === "subscription_expiring",
    });
  } catch {
    // Network error — leave cached policy in place, do not surface to user
  }
}
```

- [ ] **Step 3: Run tests**

Run: `npx vitest run tests/unit/policy/sync.test.ts`
Expected: all PASS.

- [ ] **Step 4: Commit**

```bash
git add src/policy/sync.ts tests/unit/policy/sync.test.ts
git commit -m "feat(extension): policy sync module — version check + full fetch with 402 handling"
```

---

### Task 5: Role detection module

**Files:**
- Create: `src/policy/role.ts`
- Create: `tests/unit/policy/role.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// tests/unit/policy/role.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockManagedGet = vi.fn()
const mockLocalGet = vi.fn()

vi.stubGlobal('chrome', {
  storage: {
    managed: { get: mockManagedGet },
    local: { get: mockLocalGet },
  },
})

const { getRole } = await import('@/policy/role')

const ORG_TOKEN = 'ps_live_acmelaw_' + 'a'.repeat(32)
const ADMIN_TOKEN = 'ps_adm_acmelaw_' + 'b'.repeat(32)

beforeEach(() => {
  vi.clearAllMocks()
  mockManagedGet.mockResolvedValue({})
  mockLocalGet.mockResolvedValue({})
})

describe('getRole', () => {
  it('returns "unregistered" when no tokens are present', async () => {
    expect(await getRole()).toBe('unregistered')
  })

  it('returns "user" when only org token is present (local storage)', async () => {
    mockLocalGet.mockResolvedValue({ orgToken: ORG_TOKEN })
    expect(await getRole()).toBe('user')
  })

  it('returns "admin" when admin token is present (local storage)', async () => {
    mockLocalGet.mockResolvedValue({ orgToken: ORG_TOKEN, adminToken: ADMIN_TOKEN })
    expect(await getRole()).toBe('admin')
  })

  it('returns "admin" when admin token is in managed storage', async () => {
    mockManagedGet.mockResolvedValue({ orgToken: ORG_TOKEN, adminToken: ADMIN_TOKEN })
    expect(await getRole()).toBe('admin')
  })

  it('managed storage takes precedence over local', async () => {
    mockManagedGet.mockResolvedValue({ orgToken: ORG_TOKEN }) // no admin in managed
    mockLocalGet.mockResolvedValue({ adminToken: ADMIN_TOKEN }) // admin only in local
    // adminToken from local should still result in "admin"
    expect(await getRole()).toBe('admin')
  })

  it('returns "user" when admin token lacks correct prefix', async () => {
    mockLocalGet.mockResolvedValue({ orgToken: ORG_TOKEN, adminToken: 'invalid_token' })
    expect(await getRole()).toBe('user')
  })
})
```

Run: `npx vitest run tests/unit/policy/role.test.ts`
Expected: FAIL — `@/policy/role` not found.

- [ ] **Step 2: Create `src/policy/role.ts`**

```typescript
export type Role = "admin" | "user" | "unregistered";

export async function getRole(): Promise<Role> {
  const managed = await chrome.storage.managed
    .get(["orgToken", "adminToken"])
    .catch(() => ({})) as Record<string, unknown>;

  const local = await chrome.storage.local
    .get(["orgToken", "adminToken"]) as Record<string, unknown>;

  const orgToken = (managed["orgToken"] ?? local["orgToken"]) as string | undefined;
  const adminToken = (managed["adminToken"] ?? local["adminToken"]) as string | undefined;

  if (typeof adminToken === "string" && adminToken.startsWith("ps_adm_")) return "admin";
  if (typeof orgToken === "string" && orgToken.startsWith("ps_live_")) return "user";
  return "unregistered";
}
```

- [ ] **Step 3: Run tests**

Run: `npx vitest run tests/unit/policy/role.test.ts`
Expected: all PASS.

- [ ] **Step 4: Commit**

```bash
git add src/policy/role.ts tests/unit/policy/role.test.ts
git commit -m "feat(extension): role detection module — admin/user/unregistered from token prefix"
```

---

### Task 6: Background service worker — sync alarm + new message handlers

**Files:**
- Modify: `src/background/service-worker.ts`

- [ ] **Step 1: Update `src/background/service-worker.ts`**

Replace the full file contents:

```typescript
import { detectPrompt } from "@/detection/engine";
import { loadPolicy, savePolicy } from "@/policy/loader";
import { appendAuditEvent } from "@/audit/log";
import { syncPolicy } from "@/policy/sync";
import { getRole } from "@/policy/role";
import type { Message } from "@/shared/messages";
import { logger } from "@/shared/logger";

// ─── Lifecycle ────────────────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(({ reason }) => {
  logger.info("PromptShield installed. Reason:", reason);
  void syncPolicy(); // sync on install
  chrome.alarms.create("policy-sync", { periodInMinutes: 30 });
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "policy-sync") {
    void syncPolicy();
  }
});

// ─── Message handler ──────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener(
  (message: Message, _sender, sendResponse) => {
    handleMessage(message)
      .then(sendResponse)
      .catch((err) => {
        logger.error("Message handler error:", err);
        sendResponse(null);
      });
    return true;
  }
);

async function handleMessage(message: Message): Promise<unknown> {
  switch (message.type) {
    case "DETECT": {
      const { text, hostname, pasteDetected } = message.payload;
      const policy = await loadPolicy();
      return detectPrompt(text, policy, hostname, pasteDetected ?? false);
    }

    case "GET_POLICY": {
      return loadPolicy();
    }

    case "TOGGLE_SITE": {
      const { hostname, enabled } = message.payload;
      const policy = await loadPolicy();
      policy.perSite[hostname] = { ...(policy.perSite[hostname] ?? {}), enabled };
      await savePolicy(policy);
      return { ok: true };
    }

    case "GET_SITE_STATUS": {
      const { hostname } = message.payload;
      const policy = await loadPolicy();
      const site = policy.perSite[hostname];
      return { hostname, enabled: site?.enabled ?? true };
    }

    case "SYNC_NOW": {
      await syncPolicy();
      return { ok: true };
    }

    case "GET_ROLE": {
      return { role: await getRole() };
    }

    case "GET_SUBSCRIPTION_STATUS": {
      const result = await chrome.storage.local.get([
        "subscriptionExpired",
        "subscriptionWarning",
        "tenantName",
      ]) as Record<string, unknown>;
      return {
        expired: result["subscriptionExpired"] === true,
        warning: result["subscriptionWarning"] === true,
        tenantName: typeof result["tenantName"] === "string" ? result["tenantName"] : null,
      };
    }

    default:
      logger.warn("Unknown message type:", (message as Message).type);
      return null;
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/background/service-worker.ts
git commit -m "feat(extension): background worker — 30-min sync alarm, SYNC_NOW, GET_ROLE, GET_SUBSCRIPTION_STATUS handlers"
```

---

### Task 7: Popup subscription badge

**Files:**
- Modify: `src/popup/Popup.tsx`

The popup shows an amber banner if `subscriptionWarning` is true, and a red banner if `subscriptionExpired` is true. Both banners are below the site-toggle section.

- [ ] **Step 1: Update `src/popup/Popup.tsx`**

Replace the full file:

```tsx
import React, { useEffect, useState } from "react";
import { sendMessage } from "@/shared/messages";
import { queryAuditEvents } from "@/audit/log";
import type { AuditEvent } from "@/audit/types";
import { EXTENSION_NAME } from "@/shared/constants";

interface SubscriptionStatus {
  expired: boolean;
  warning: boolean;
  tenantName: string | null;
}

export function Popup() {
  const [hostname, setHostname] = useState<string>("");
  const [siteEnabled, setSiteEnabled] = useState(true);
  const [recentEvents, setRecentEvents] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [sub, setSub] = useState<SubscriptionStatus>({ expired: false, warning: false, tenantName: null });

  useEffect(() => {
    chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
      const tab = tabs[0];
      if (!tab?.url) { setLoading(false); return; }

      try {
        const url = new URL(tab.url);
        const host = url.hostname;
        setHostname(host);

        const [statusResult, events, subStatus] = await Promise.all([
          sendMessage<{ enabled: boolean }>({ type: "GET_SITE_STATUS", payload: { hostname: host } }),
          queryAuditEvents({ hostname: host, limit: 5 }),
          sendMessage<SubscriptionStatus>({ type: "GET_SUBSCRIPTION_STATUS" }),
        ]);

        setSiteEnabled(statusResult.enabled);
        setRecentEvents(events);
        setSub(subStatus);
      } catch {
        // ignore errors
      } finally {
        setLoading(false);
      }
    });
  }, []);

  async function toggleSite() {
    const next = !siteEnabled;
    setSiteEnabled(next);
    await sendMessage({ type: "TOGGLE_SITE", payload: { hostname, enabled: next } });
  }

  if (loading) return <div className="p-4 text-sm text-gray-500">Loading…</div>;

  return (
    <div className="bg-white text-gray-900 font-sans">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100">
        <div className="w-6 h-6 bg-red-600 rounded flex items-center justify-center text-white text-xs font-bold">
          PS
        </div>
        <span className="font-semibold text-sm">{EXTENSION_NAME}</span>
        {sub.tenantName && (
          <span className="ml-auto text-xs text-gray-400 truncate max-w-[120px]">{sub.tenantName}</span>
        )}
      </div>

      {/* Subscription banners */}
      {sub.expired && (
        <div className="px-4 py-2 bg-red-50 border-b border-red-100 text-xs text-red-700 font-medium">
          Subscription expired — contact your IT admin
        </div>
      )}
      {!sub.expired && sub.warning && (
        <div className="px-4 py-2 bg-amber-50 border-b border-amber-100 text-xs text-amber-700 font-medium">
          Subscription expiring soon — contact your IT admin
        </div>
      )}

      {/* Site toggle */}
      <div className="px-4 py-3 flex items-center justify-between border-b border-gray-100">
        <div>
          <p className="text-sm font-medium">{siteEnabled ? "Active" : "Paused"} on this site</p>
          {hostname && (
            <p className="text-xs text-gray-500 mt-0.5 truncate max-w-[180px]">{hostname}</p>
          )}
        </div>
        <button
          onClick={toggleSite}
          className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 ${
            siteEnabled ? "bg-blue-600" : "bg-gray-200"
          }`}
          role="switch"
          aria-checked={siteEnabled}
        >
          <span
            className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
              siteEnabled ? "translate-x-5" : "translate-x-0"
            }`}
          />
        </button>
      </div>

      {/* Recent events */}
      <div className="px-4 py-3">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
          Recent events
        </p>
        {recentEvents.length === 0 ? (
          <p className="text-xs text-gray-400">No events yet.</p>
        ) : (
          <ul className="space-y-1.5">
            {recentEvents.map((ev) => (
              <li key={ev.id} className="flex items-center gap-2 text-xs">
                <span
                  className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                    ev.action === "block"
                      ? "bg-red-100 text-red-700"
                      : ev.action === "warn"
                      ? "bg-yellow-100 text-yellow-700"
                      : "bg-gray-100 text-gray-600"
                  }`}
                >
                  {ev.action}
                </span>
                <span className="text-gray-600 truncate">
                  {ev.userDecision} — {new Date(ev.timestamp).toLocaleTimeString()}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Footer */}
      <div className="px-4 py-2 border-t border-gray-100">
        <button
          onClick={() => chrome.runtime.openOptionsPage()}
          className="w-full text-sm text-blue-600 hover:text-blue-800 text-center py-1"
        >
          Open settings →
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/popup/Popup.tsx
git commit -m "feat(extension): popup subscription badge — amber warning + red expired banners"
```

---

### Task 8: Options page role-based UI

**Files:**
- Modify: `src/options/App.tsx`

The options page sends a `GET_ROLE` message on mount. If role is `"admin"`, the full policy editor is shown. For `"user"` or `"unregistered"`, the editor is hidden and a read-only info panel is shown.

- [ ] **Step 1: Replace `src/options/App.tsx` with the role-gated version**

```tsx
import React, { useEffect, useState } from "react";
import { PolicyPage } from "./pages/PolicyPage";
import { AuditPage } from "./pages/AuditPage";
import { AboutPage } from "./pages/AboutPage";
import { sendMessage } from "@/shared/messages";

type Tab = "policy" | "audit" | "about";
type Role = "admin" | "user" | "unregistered";

export function App() {
  const [activeTab, setActiveTab] = useState<Tab>("policy");
  const [role, setRole] = useState<Role | null>(null);

  useEffect(() => {
    sendMessage<{ role: Role }>({ type: "GET_ROLE" })
      .then(({ role: r }) => setRole(r))
      .catch(() => setRole("unregistered"));
  }, []);

  const tabs: { id: Tab; label: string }[] = [
    { id: "policy", label: "Policy" },
    { id: "audit", label: "Audit Log" },
    { id: "about", label: "About" },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center gap-3">
          <div className="w-8 h-8 bg-red-600 rounded-lg flex items-center justify-center text-white font-bold text-sm">
            PS
          </div>
          <h1 className="text-xl font-semibold text-gray-900">PromptShield Settings</h1>
          {role && role !== "unregistered" && (
            <span className={`ml-auto text-xs px-2 py-0.5 rounded-full font-medium ${
              role === "admin" ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-600"
            }`}>
              {role}
            </span>
          )}
        </div>
      </header>

      {/* Tabs */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-4xl mx-auto flex">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <main className="max-w-4xl mx-auto px-6 py-8">
        {activeTab === "policy" && (
          role === "admin" ? (
            <PolicyPage />
          ) : role !== null ? (
            <div className="p-6 bg-white rounded-lg border border-gray-200 space-y-2">
              <p className="font-medium text-gray-700">
                {role === "user" ? "Policy managed by your organisation" : "No policy configured"}
              </p>
              <p className="text-sm text-gray-500">
                {role === "user"
                  ? "Your policy is centrally managed. Contact your IT admin to make changes."
                  : "Install the org token to connect to your organisation's policy."}
              </p>
            </div>
          ) : null
        )}
        {activeTab === "audit" && <AuditPage />}
        {activeTab === "about" && <AboutPage />}
      </main>
    </div>
  );
}
```

The `AuditPage` and `AboutPage` tabs remain visible to all roles — only the `PolicyPage` editor is gated.

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Run all unit tests**

```bash
npx vitest run
```

Expected: all tests PASS (api-keys, pii, score-rule, sync, role, plus any existing tests).

- [ ] **Step 5: Commit**

```bash
git add src/options/App.tsx
git commit -m "feat(extension): options page role gate — full editor for admin, read-only for user/unregistered"
```
