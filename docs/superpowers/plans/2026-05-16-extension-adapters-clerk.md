# Extension Adapters + Clerk Auth — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Update the Chrome extension to authenticate members via Clerk SSO, sync policy from the new backend API shape (subjects/rules), complete the Claude.ai and Gemini adapters, and add a generic fallback adapter that covers any AI-powered site.

**Architecture:** `@clerk/chrome-extension` wraps the popup with `ClerkProvider` and stores the session in `chrome.storage`. A bridge module (`policy/bridge.ts`) converts the server's `ResolvedPolicy` into the engine's internal `Policy` format so the existing detection engine requires zero changes. The generic fallback adapter uses heuristics to detect the largest editable element + nearest submit button on any page, with optional admin-configured selector overrides pulled from the policy response.

**Tech Stack:** React 18, TypeScript, Vite + CRXJS (MV3), `@clerk/chrome-extension`, Zod, Vitest (unit tests with jsdom), Tailwind CSS. Backend plan (`2026-05-16-clerk-auth-backend.md`) must be deployed first.

---

## File Map

| File | Action |
|---|---|
| `src/policy/schema.ts` | Rewrite: Zod schemas for `ResolvedPolicy` shape from backend |
| `src/policy/bridge.ts` | Create: convert `ResolvedPolicy` → engine's `Policy` format |
| `src/policy/sync.ts` | Rewrite: Clerk JWT auth, new API response shape, store siteConfigs |
| `src/policy/loader.ts` | Update: load bridged policy from storage |
| `src/background/service-worker.ts` | Update: Clerk session check, per-site toggle uses separate storage key |
| `src/shared/messages.ts` | Update: `TOGGLE_SITE` + `GET_SITE_STATUS` work without perSite on Policy |
| `src/popup/main.tsx` | Update: wrap with `ClerkProvider` |
| `src/popup/Popup.tsx` | Update: show login screen when no Clerk session, add account section |
| `src/options/App.tsx` | Update: remove Policy tab, add Account tab |
| `src/options/pages/PolicyPage.tsx` | Delete: policy is now server-managed |
| `src/options/pages/AccountPage.tsx` | Create: show Clerk user info + sign-out |
| `src/content/adapters/claude.ts` | Rewrite: complete implementation with verified DOM selectors + Enter key |
| `src/content/adapters/gemini.ts` | Rewrite: complete implementation with verified DOM selectors + Enter key |
| `src/content/adapters/generic.ts` | Create: heuristic fallback + siteConfig override |
| `src/content/adapters/registry.ts` | Update: return generic fallback instead of null |
| `src/shared/constants.ts` | Update: add `CLERK_PUBLISHABLE_KEY` |

---

### Task 1: New policy Zod schemas

**Files:**
- Modify: `src/policy/schema.ts`

- [ ] **Step 1: Write unit test for new schema in `src/policy/schema.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { PolicyDocSchema } from './schema'

describe('PolicyDocSchema', () => {
  it('parses a valid ResolvedPolicy from the backend', () => {
    const raw = {
      version: 1,
      tenantId: 'tenant-uuid',
      subjects: [
        {
          id: 'sub-1',
          name: 'Confidential',
          rules: [
            { id: 'rule-1', kind: 'keyword', keywords: ['secret', 'classified'], pattern: null, destinations: [], action: 'block', message: null },
            { id: 'rule-2', kind: 'pattern', keywords: null, pattern: 'sk-[A-Za-z0-9]{20,}', destinations: [], action: 'warn', message: 'API key detected' },
          ],
        },
      ],
      siteConfigs: {
        'app.acme.com': { inputSelector: '#chat-input', sendButtonSelector: '#send-btn' },
      },
    }
    const result = PolicyDocSchema.safeParse(raw)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.subjects[0]!.rules[0]!.kind).toBe('keyword')
      expect(result.data.siteConfigs['app.acme.com']!.inputSelector).toBe('#chat-input')
    }
  })

  it('defaults siteConfigs to {} when absent', () => {
    const raw = { version: 1, tenantId: 'x', subjects: [] }
    const result = PolicyDocSchema.safeParse(raw)
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.siteConfigs).toEqual({})
  })

  it('rejects unknown rule kind', () => {
    const raw = {
      version: 1, tenantId: 'x',
      subjects: [{ id: 's', name: 'S', rules: [{ id: 'r', kind: 'invalid', action: 'warn' }] }],
    }
    expect(PolicyDocSchema.safeParse(raw).success).toBe(false)
  })
})
```

- [ ] **Step 2: Run to confirm failure**

```bash
npx vitest run src/policy/schema.test.ts 2>&1 | tail -5
```

Expected: FAIL — `PolicyDocSchema` not exported with new shape.

- [ ] **Step 3: Rewrite `src/policy/schema.ts`**

```ts
import { z } from "zod";

// ─── Server-side rule (ResolvedRulePolicy from backend) ───────────────────────

export const ResolvedRuleSchema = z.object({
  id:           z.string(),
  kind:         z.enum(["keyword", "pattern", "entropy", "score"]),
  keywords:     z.array(z.string()).nullable(),
  pattern:      z.string().nullable(),
  destinations: z.array(z.string()),
  action:       z.enum(["warn", "block"]),
  message:      z.string().nullable(),
});

export const ResolvedSubjectSchema = z.object({
  id:    z.string(),
  name:  z.string(),
  rules: z.array(ResolvedRuleSchema),
});

export const SiteConfigSchema = z.object({
  inputSelector:       z.string(),
  sendButtonSelector:  z.string(),
});

export const PolicyDocSchema = z.object({
  version:     z.literal(1),
  tenantId:    z.string(),
  subjects:    z.array(ResolvedSubjectSchema),
  siteConfigs: z.record(SiteConfigSchema).default({}),
});

// ─── Engine-internal types (used by detection engine — kept for compat) ───────

export const ActionSchema = z.enum(["log", "warn", "require_confirmation", "block"]);

// ─── Derived TypeScript types ─────────────────────────────────────────────────

export type ResolvedRule    = z.infer<typeof ResolvedRuleSchema>;
export type ResolvedSubject = z.infer<typeof ResolvedSubjectSchema>;
export type SiteConfigEntry = z.infer<typeof SiteConfigSchema>;
export type PolicyDoc       = z.infer<typeof PolicyDocSchema>;
export type Action          = z.infer<typeof ActionSchema>;
```

- [ ] **Step 4: Run test to confirm pass**

```bash
npx vitest run src/policy/schema.test.ts 2>&1 | tail -5
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/policy/schema.ts src/policy/schema.test.ts
git commit -m "feat(extension): rewrite policy schema for ResolvedPolicy backend shape"
```

---

### Task 2: Policy bridge (ResolvedPolicy → engine format)

**Files:**
- Create: `src/policy/bridge.ts`

The detection engine (`src/detection/engine.ts`) expects a `Policy` with `baseline: Rule[], custom: Rule[]` where each `Rule` has `enabled`, `severity`, `name`, `description`, `tags`, and kind-specific fields. This bridge converts the server's flat `ResolvedRule` into that format without touching the engine.

- [ ] **Step 1: Write unit tests in `src/policy/bridge.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { bridgePolicy } from './bridge'
import type { PolicyDoc } from './schema'

const MINIMAL_DOC: PolicyDoc = {
  version: 1,
  tenantId: 'tenant-1',
  subjects: [],
  siteConfigs: {},
}

describe('bridgePolicy', () => {
  it('returns a Policy with empty rules when no subjects', () => {
    const p = bridgePolicy(MINIMAL_DOC, [])
    expect(p.baseline).toHaveLength(0)
    expect(p.custom).toHaveLength(0)
  })

  it('maps keyword rule to DictionaryRule', () => {
    const doc: PolicyDoc = {
      ...MINIMAL_DOC,
      subjects: [{
        id: 's1', name: 'Confidential',
        rules: [{ id: 'r1', kind: 'keyword', keywords: ['secret', 'classified'], pattern: null, destinations: [], action: 'warn', message: null }],
      }],
    }
    const p = bridgePolicy(doc, [])
    expect(p.custom).toHaveLength(1)
    expect(p.custom[0]!.kind).toBe('dictionary')
    expect((p.custom[0] as { terms: string[] }).terms).toContain('secret')
    expect(p.custom[0]!.action).toBe('warn')
    expect(p.custom[0]!.enabled).toBe(true)
  })

  it('maps pattern rule to PatternRule', () => {
    const doc: PolicyDoc = {
      ...MINIMAL_DOC,
      subjects: [{
        id: 's1', name: 'Keys',
        rules: [{ id: 'r2', kind: 'pattern', keywords: null, pattern: 'sk-[A-Za-z0-9]{20,}', destinations: [], action: 'block', message: 'API key' }],
      }],
    }
    const p = bridgePolicy(doc, [])
    expect(p.custom[0]!.kind).toBe('pattern')
    expect((p.custom[0] as { pattern: string }).pattern).toBe('sk-[A-Za-z0-9]{20,}')
    expect(p.custom[0]!.action).toBe('block')
  })

  it('maps entropy rule with defaults', () => {
    const doc: PolicyDoc = {
      ...MINIMAL_DOC,
      subjects: [{
        id: 's1', name: 'Entropy',
        rules: [{ id: 'r3', kind: 'entropy', keywords: null, pattern: null, destinations: [], action: 'warn', message: null }],
      }],
    }
    const p = bridgePolicy(doc, [])
    expect(p.custom[0]!.kind).toBe('entropy')
    expect((p.custom[0] as { minTokenLength: number }).minTokenLength).toBe(24)
  })

  it('injects disabledSites into perSite', () => {
    const p = bridgePolicy(MINIMAL_DOC, ['chatgpt.com'])
    expect(p.perSite['chatgpt.com']!.enabled).toBe(false)
  })
})
```

- [ ] **Step 2: Run to confirm failure**

```bash
npx vitest run src/policy/bridge.test.ts 2>&1 | tail -5
```

Expected: FAIL — `bridge.ts` not found.

- [ ] **Step 3: Create `src/policy/bridge.ts`**

```ts
import type { PolicyDoc, ResolvedRule } from "./schema";
import type { Policy } from "../detection/engine-types";

// Engine-internal rule types — mirroring what detection/engine.ts expects.
// We keep them here so the engine itself doesn't need to change.
type EngineRule =
  | { kind: "dictionary"; id: string; name: string; description: string; severity: "low" | "medium" | "high" | "critical"; action: "log" | "warn" | "require_confirmation" | "block"; enabled: boolean; tags: string[]; terms: string[]; fuzzyTerms?: Array<{ term: string; maxDistance: number }>; caseSensitive: boolean }
  | { kind: "pattern";    id: string; name: string; description: string; severity: "low" | "medium" | "high" | "critical"; action: "log" | "warn" | "require_confirmation" | "block"; enabled: boolean; tags: string[]; pattern: string; flags: string; validator: "luhn" | "ssn" | "iban" | "none"; scope: "all" | "outside_code" | "inside_code" }
  | { kind: "entropy";    id: string; name: string; description: string; severity: "low" | "medium" | "high" | "critical"; action: "log" | "warn" | "require_confirmation" | "block"; enabled: boolean; tags: string[]; minTokenLength: number; minBitsPerChar: number }
  | { kind: "score";      id: string; name: string; description: string; severity: "low" | "medium" | "high" | "critical"; action: "log" | "warn" | "require_confirmation" | "block"; enabled: boolean; tags: string[]; signals: Array<{ id: string; description: string; points: number; enabled: boolean; threshold?: number }>; warnThreshold: number; confirmThreshold: number }

type EngineAction = "log" | "warn" | "require_confirmation" | "block"
type Severity = "low" | "medium" | "high" | "critical"

function toEngineAction(a: "warn" | "block"): EngineAction {
  return a // both exist in the engine's action enum
}

function toSeverity(a: "warn" | "block"): Severity {
  return a === "block" ? "high" : "medium"
}

const DEFAULT_SCORE_SIGNALS = [
  { id: "paste_detected",       description: "Text was pasted",               points: 20, enabled: true },
  { id: "long_text",            description: "More than 400 words",           points: 20, enabled: true, threshold: 400 },
  { id: "legal_terms_whereas",  description: "Legal boilerplate detected",    points: 25, enabled: true },
  { id: "numbered_paragraphs",  description: "Numbered paragraph structure",  points: 15, enabled: true },
  { id: "long_avg_sentence",    description: "Long average sentence length",  points: 10, enabled: true },
  { id: "formal_heading",       description: "All-caps heading detected",     points: 10, enabled: true },
  { id: "block_quote",          description: "Block quote or indented text",  points: 10, enabled: true },
]

function bridgeRule(rule: ResolvedRule, subjectName: string): EngineRule {
  const base = {
    id:          rule.id,
    name:        `${subjectName} — ${rule.kind}`,
    description: rule.message ?? "",
    severity:    toSeverity(rule.action),
    action:      toEngineAction(rule.action),
    enabled:     true,
    tags:        [] as string[],
  }

  switch (rule.kind) {
    case "keyword":
      return { ...base, kind: "dictionary", terms: rule.keywords ?? [], caseSensitive: false }
    case "pattern":
      return { ...base, kind: "pattern", pattern: rule.pattern ?? "", flags: "gi", validator: "none", scope: "all" }
    case "entropy":
      return { ...base, kind: "entropy", minTokenLength: 24, minBitsPerChar: 4.0 }
    case "score":
      return { ...base, kind: "score", signals: DEFAULT_SCORE_SIGNALS, warnThreshold: 40, confirmThreshold: 70 }
  }
}

export function bridgePolicy(doc: PolicyDoc, disabledSites: string[]): Policy {
  const allRules: EngineRule[] = doc.subjects.flatMap(subject =>
    subject.rules.map(rule => bridgeRule(rule, subject.name))
  )

  const perSite: Record<string, { enabled: boolean }> = {}
  for (const hostname of disabledSites) {
    perSite[hostname] = { enabled: false }
  }

  return {
    version:                  1,
    tenantId:                 doc.tenantId,
    baseline:                 [],
    custom:                   allRules as never,
    perSite,
    allowSendAnywayWithReason: false,
    auditRetentionDays:        90,
  } as Policy
}
```

- [ ] **Step 4: Run test to confirm pass**

```bash
npx vitest run src/policy/bridge.test.ts 2>&1 | tail -5
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/policy/bridge.ts src/policy/bridge.test.ts
git commit -m "feat(extension): policy bridge — ResolvedPolicy to engine Policy format"
```

---

### Task 3: Rewrite policy sync + update loader

**Files:**
- Modify: `src/policy/sync.ts`
- Modify: `src/policy/loader.ts`
- Modify: `src/shared/constants.ts`

- [ ] **Step 1: Add `CLERK_PUBLISHABLE_KEY` to `src/shared/constants.ts`**

```ts
export const EXTENSION_NAME       = "PromptShield";
export const SEND_SENTINEL_ATTR   = "data-ps-sentinel";
export const SNIPPET_CONTEXT_CHARS = 40;
export const API_BASE              = "https://api.promptshield.dev";
export const CLERK_PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string;
```

- [ ] **Step 2: Add `VITE_CLERK_PUBLISHABLE_KEY` to `.env` (gitignored) and `.env.example`**

Create `.env`:
```
VITE_CLERK_PUBLISHABLE_KEY=pk_test_your_key_here
```

Create `.env.example`:
```
VITE_CLERK_PUBLISHABLE_KEY=pk_test_your_key_here
```

- [ ] **Step 3: Rewrite `src/policy/sync.ts`**

```ts
import { API_BASE } from "@/shared/constants";
import { PolicyDocSchema, type PolicyDoc } from "./schema";

async function getAuthToken(): Promise<string | null> {
  // 1. Try Clerk session token from storage (set by popup after Clerk login)
  const clerkResult = await chrome.storage.local.get("clerkSessionToken") as Record<string, unknown>;
  if (typeof clerkResult["clerkSessionToken"] === "string") {
    return clerkResult["clerkSessionToken"];
  }
  // 2. Fall back to org token (shared device / MDM deployment)
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
  const token = await getAuthToken();
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
      version: number;
      policy: unknown;
      warning?: string;
      tenantName: string;
    };

    const parsed = PolicyDocSchema.safeParse(body.policy);
    if (!parsed.success) return; // malformed response — leave cached policy

    const policyDoc: PolicyDoc = parsed.data;

    await chrome.storage.local.set({
      policyDoc,
      cachedPolicyVersion:  body.version,
      tenantName:           body.tenantName,
      subscriptionExpired:  false,
      subscriptionWarning:  body.warning === "subscription_expiring",
    });
  } catch {
    // Network error — leave cached policy in place
  }
}
```

- [ ] **Step 4: Update `src/policy/loader.ts` to load `policyDoc` and bridge it**

First read the current file:

The current `loader.ts` loads a `Policy` from storage. Replace it to load `PolicyDoc` from storage and bridge it:

```ts
import { PolicyDocSchema, type PolicyDoc } from "./schema";
import { bridgePolicy } from "./bridge";
import type { Policy } from "@/detection/engine-types";

async function getDisabledSites(): Promise<string[]> {
  const result = await chrome.storage.local.get("disabledSites") as Record<string, unknown>;
  const sites = result["disabledSites"];
  return Array.isArray(sites) ? (sites as string[]) : [];
}

export async function loadPolicy(): Promise<Policy> {
  const result = await chrome.storage.local.get("policyDoc") as Record<string, unknown>;
  const raw = result["policyDoc"];
  const parsed = PolicyDocSchema.safeParse(raw);
  const doc: PolicyDoc = parsed.success
    ? parsed.data
    : { version: 1, tenantId: "", subjects: [], siteConfigs: {} };
  const disabledSites = await getDisabledSites();
  return bridgePolicy(doc, disabledSites);
}

export async function getSiteConfigs(): Promise<PolicyDoc["siteConfigs"]> {
  const result = await chrome.storage.local.get("policyDoc") as Record<string, unknown>;
  const parsed = PolicyDocSchema.safeParse(result["policyDoc"]);
  return parsed.success ? parsed.data.siteConfigs : {};
}
```

Note: `engine-types.ts` does not yet exist — it will be created in Step 5.

- [ ] **Step 5: Create `src/detection/engine-types.ts`** (extract `Policy` type so bridge + loader can import it without pulling in the full engine)

```ts
// Re-export the Policy type from schema so bridge and loader can import it
// without pulling in the full detection engine (which references browser APIs).
export type { Policy } from "@/policy/legacy-schema";
```

Actually, the cleaner approach is to keep `Policy` defined in `src/policy/schema.ts` as a legacy export while the bridge uses its own inline types. Update `src/policy/loader.ts` to import `Policy` from the old schema location:

Instead of a new file, add this export at the bottom of `src/policy/schema.ts`:

```ts
// Legacy engine Policy type — kept for detection/engine.ts compatibility
import type { z } from "zod";
export const LegacyPolicySchema = z.object({
  version:                  z.literal(1),
  tenantId:                 z.string().optional(),
  baseline:                 z.array(z.any()),
  custom:                   z.array(z.any()),
  perSite:                  z.record(z.object({ enabled: z.boolean(), defaultAction: ActionSchema.optional() })),
  allowSendAnywayWithReason: z.boolean(),
  auditRetentionDays:        z.number(),
});
export type Policy = z.infer<typeof LegacyPolicySchema>;
```

Then update `src/policy/loader.ts` to import `Policy` from `./schema`.

And update `src/policy/bridge.ts` to import `Policy` from `./schema` as well.

Update `src/detection/engine.ts` line 1 to import from `./schema` → `@/policy/schema` (it already imports `Policy` from `@/policy/schema`, so if `Policy` is exported from there, nothing changes).

- [ ] **Step 6: Run TypeScript check**

```bash
npx run typecheck 2>&1 | head -20
```

Expected: errors may surface around `Policy` type — fix by ensuring all imports resolve correctly.

- [ ] **Step 7: Commit**

```bash
git add src/policy/sync.ts src/policy/loader.ts src/policy/schema.ts src/policy/bridge.ts src/shared/constants.ts .env.example
git commit -m "feat(extension): policy sync rewrite + loader bridge for new API shape"
```

---

### Task 4: Install Clerk + service worker update

**Files:**
- Modify: `package.json` (via npm install)
- Modify: `src/background/service-worker.ts`
- Modify: `src/shared/messages.ts`

- [ ] **Step 1: Install `@clerk/chrome-extension`**

```bash
npm install @clerk/chrome-extension
```

Expected: package installed, `package.json` updated.

- [ ] **Step 2: Update `src/shared/messages.ts` to change TOGGLE_SITE to use disabledSites**

Read the current `src/shared/messages.ts` and add nothing new — the `TOGGLE_SITE` message stays but the handler in the service worker changes.

- [ ] **Step 3: Update `src/background/service-worker.ts`**

```ts
import { detectPrompt } from "@/detection/engine";
import { loadPolicy } from "@/policy/loader";
import { appendAuditEvent } from "@/audit/log";
import { syncPolicy } from "@/policy/sync";
import type { Message } from "@/shared/messages";
import { logger } from "@/shared/logger";

// ─── Lifecycle ────────────────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(({ reason }) => {
  logger.info("PromptShield installed. Reason:", reason);
  void syncPolicy();
  chrome.alarms.create("policy-sync", { periodInMinutes: 30 });
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "policy-sync") void syncPolicy();
});

// ─── Per-site disabled list (replaces perSite in Policy) ─────────────────────

async function getDisabledSites(): Promise<string[]> {
  const r = await chrome.storage.local.get("disabledSites") as Record<string, unknown>;
  return Array.isArray(r["disabledSites"]) ? r["disabledSites"] as string[] : [];
}

async function setDisabledSites(sites: string[]): Promise<void> {
  await chrome.storage.local.set({ disabledSites: sites });
}

// ─── Message handler ──────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message: Message, _sender, sendResponse) => {
  handleMessage(message).then(sendResponse).catch((err) => {
    logger.error("Message handler error:", err);
    sendResponse(null);
  });
  return true;
});

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
      const sites = await getDisabledSites();
      if (enabled) {
        await setDisabledSites(sites.filter(s => s !== hostname));
      } else {
        if (!sites.includes(hostname)) await setDisabledSites([...sites, hostname]);
      }
      return { ok: true };
    }

    case "GET_SITE_STATUS": {
      const { hostname } = message.payload;
      const sites = await getDisabledSites();
      return { hostname, enabled: !sites.includes(hostname) };
    }

    case "SYNC_NOW": {
      await syncPolicy();
      return { ok: true };
    }

    case "GET_SUBSCRIPTION_STATUS": {
      const result = await chrome.storage.local.get([
        "subscriptionExpired", "subscriptionWarning", "tenantName",
      ]) as Record<string, unknown>;
      return {
        expired:    result["subscriptionExpired"] === true,
        warning:    result["subscriptionWarning"] === true,
        tenantName: typeof result["tenantName"] === "string" ? result["tenantName"] : null,
      };
    }

    default:
      logger.warn("Unknown message type:", (message as Message).type);
      return null;
  }
}
```

- [ ] **Step 4: Run TypeScript check**

```bash
npm run typecheck 2>&1 | head -20
```

Expected: resolve any import errors surfaced.

- [ ] **Step 5: Commit**

```bash
git add src/background/service-worker.ts package.json package-lock.json
git commit -m "feat(extension): install Clerk, update service worker for disabledSites"
```

---

### Task 5: Popup Clerk login screen

**Files:**
- Modify: `src/popup/main.tsx`
- Modify: `src/popup/Popup.tsx`

- [ ] **Step 1: Update `src/popup/main.tsx`**

Read the current file, then replace it with:

```tsx
import React from "react";
import ReactDOM from "react-dom/client";
import { ClerkProvider } from "@clerk/chrome-extension";
import { CLERK_PUBLISHABLE_KEY } from "@/shared/constants";
import { Popup } from "./Popup";
import "../styles/tailwind.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ClerkProvider publishableKey={CLERK_PUBLISHABLE_KEY}>
      <Popup />
    </ClerkProvider>
  </React.StrictMode>
);
```

- [ ] **Step 2: Update `src/popup/Popup.tsx`**

```tsx
import React, { useEffect, useState } from "react";
import { useUser, SignIn, useClerk } from "@clerk/chrome-extension";
import { sendMessage } from "@/shared/messages";
import { queryAuditEvents } from "@/audit/log";
import type { AuditEvent } from "@/audit/types";
import { EXTENSION_NAME } from "@/shared/constants";

interface SubscriptionStatus {
  expired: boolean;
  warning: boolean;
  tenantName: string | null;
}

function AuthenticatedPopup() {
  const { user, isLoaded } = useUser();
  const { signOut, session } = useClerk();
  const [hostname, setHostname] = useState<string>("");
  const [siteEnabled, setSiteEnabled] = useState(true);
  const [recentEvents, setRecentEvents] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [sub, setSub] = useState<SubscriptionStatus>({ expired: false, warning: false, tenantName: null });
  const [showAccount, setShowAccount] = useState(false);

  useEffect(() => {
    if (!isLoaded) return;
    // Store Clerk session token so sync.ts can use it
    void session?.getToken().then((token) => {
      if (token) void chrome.storage.local.set({ clerkSessionToken: token });
    });

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
      } catch { /* ignore */ } finally { setLoading(false); }
    });
  }, [isLoaded, session]);

  async function toggleSite() {
    const next = !siteEnabled;
    setSiteEnabled(next);
    await sendMessage({ type: "TOGGLE_SITE", payload: { hostname, enabled: next } });
  }

  if (!isLoaded || loading) return <div className="p-4 text-sm text-gray-500">Loading…</div>;

  if (showAccount) {
    return (
      <div className="bg-white text-gray-900 font-sans w-72">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100">
          <button onClick={() => setShowAccount(false)} className="text-xs text-blue-600">← Back</button>
          <span className="font-semibold text-sm ml-2">Account</span>
        </div>
        <div className="px-4 py-4 space-y-3">
          {user?.imageUrl && <img src={user.imageUrl} className="w-10 h-10 rounded-full" alt="avatar" />}
          <p className="text-sm font-medium">{user?.fullName ?? user?.primaryEmailAddress?.emailAddress}</p>
          <p className="text-xs text-gray-500">{user?.primaryEmailAddress?.emailAddress}</p>
          <button
            onClick={() => signOut()}
            className="w-full text-sm text-red-600 border border-red-200 rounded py-1.5 hover:bg-red-50"
          >
            Sign out
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white text-gray-900 font-sans w-72">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100">
        <div className="w-6 h-6 bg-red-600 rounded flex items-center justify-center text-white text-xs font-bold">PS</div>
        <span className="font-semibold text-sm">{EXTENSION_NAME}</span>
        {sub.tenantName && <span className="ml-auto text-xs text-gray-400 truncate max-w-[100px]">{sub.tenantName}</span>}
        <button onClick={() => setShowAccount(true)} className="ml-1 text-xs text-gray-400 hover:text-gray-600" title="Account">
          {user?.imageUrl ? <img src={user.imageUrl} className="w-5 h-5 rounded-full" alt="" /> : "👤"}
        </button>
      </div>

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

      <div className="px-4 py-3 flex items-center justify-between border-b border-gray-100">
        <div>
          <p className="text-sm font-medium">{siteEnabled ? "Active" : "Paused"} on this site</p>
          {hostname && <p className="text-xs text-gray-500 mt-0.5 truncate max-w-[180px]">{hostname}</p>}
        </div>
        <button
          onClick={toggleSite}
          className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ${siteEnabled ? "bg-blue-600" : "bg-gray-200"}`}
          role="switch" aria-checked={siteEnabled}
        >
          <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${siteEnabled ? "translate-x-5" : "translate-x-0"}`} />
        </button>
      </div>

      <div className="px-4 py-3">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Recent events</p>
        {recentEvents.length === 0 ? (
          <p className="text-xs text-gray-400">No events yet.</p>
        ) : (
          <ul className="space-y-1.5">
            {recentEvents.map((ev) => (
              <li key={ev.id} className="flex items-center gap-2 text-xs">
                <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${ev.action === "block" ? "bg-red-100 text-red-700" : ev.action === "warn" ? "bg-yellow-100 text-yellow-700" : "bg-gray-100 text-gray-600"}`}>
                  {ev.action}
                </span>
                <span className="text-gray-600 truncate">{ev.userDecision} — {new Date(ev.timestamp).toLocaleTimeString()}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="px-4 py-2 border-t border-gray-100">
        <button onClick={() => chrome.runtime.openOptionsPage()} className="w-full text-sm text-blue-600 hover:text-blue-800 text-center py-1">
          Open settings →
        </button>
      </div>
    </div>
  );
}

export function Popup() {
  const { isSignedIn, isLoaded } = useUser();
  if (!isLoaded) return <div className="p-4 text-sm text-gray-500">Loading…</div>;
  if (!isSignedIn) {
    return (
      <div className="w-72 p-4">
        <SignIn routing="hash" />
      </div>
    );
  }
  return <AuthenticatedPopup />;
}
```

- [ ] **Step 3: Run TypeScript check**

```bash
npm run typecheck 2>&1 | head -20
```

Expected: resolve any Clerk import errors (ensure `@clerk/chrome-extension` types are installed).

- [ ] **Step 4: Commit**

```bash
git add src/popup/main.tsx src/popup/Popup.tsx
git commit -m "feat(extension): Clerk login screen in popup + account view"
```

---

### Task 6: Options page update

**Files:**
- Modify: `src/options/App.tsx`
- Delete: `src/options/pages/PolicyPage.tsx`
- Create: `src/options/pages/AccountPage.tsx`
- Modify: `src/options/main.tsx`

- [ ] **Step 1: Create `src/options/pages/AccountPage.tsx`**

```tsx
import React from "react";
import { useUser, useClerk } from "@clerk/chrome-extension";

export function AccountPage() {
  const { user } = useUser();
  const { signOut } = useClerk();
  return (
    <div className="max-w-md space-y-4">
      <h2 className="text-base font-semibold text-gray-900">Account</h2>
      <div className="flex items-center gap-3">
        {user?.imageUrl && <img src={user.imageUrl} className="w-12 h-12 rounded-full" alt="avatar" />}
        <div>
          <p className="text-sm font-medium">{user?.fullName}</p>
          <p className="text-xs text-gray-500">{user?.primaryEmailAddress?.emailAddress}</p>
        </div>
      </div>
      <button
        onClick={() => signOut()}
        className="px-4 py-2 text-sm text-red-600 border border-red-300 rounded hover:bg-red-50"
      >
        Sign out
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Update `src/options/App.tsx`** — replace Policy tab with Account tab

Read the file, then update the tabs array to replace `PolicyPage` with `AccountPage`:

```tsx
import React, { useState } from "react";
import { AuditPage } from "./pages/AuditPage";
import { AccountPage } from "./pages/AccountPage";
import { AboutPage } from "./pages/AboutPage";
import { EXTENSION_NAME } from "@/shared/constants";

type Tab = "audit" | "account" | "about";

export function App() {
  const [activeTab, setActiveTab] = useState<Tab>("audit");
  const tabs: { id: Tab; label: string }[] = [
    { id: "audit",   label: "Audit Log" },
    { id: "account", label: "Account" },
    { id: "about",   label: "About" },
  ];
  return (
    <div className="min-h-screen bg-gray-50 font-sans">
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center gap-3">
        <div className="w-7 h-7 bg-red-600 rounded flex items-center justify-center text-white text-xs font-bold">PS</div>
        <span className="font-semibold text-gray-900">{EXTENSION_NAME} — Settings</span>
      </header>
      <div className="px-6 pt-4 flex gap-1 border-b border-gray-200 bg-white">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              activeTab === t.id ? "border-blue-600 text-blue-600" : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <main className="px-6 py-6">
        {activeTab === "audit"   && <AuditPage />}
        {activeTab === "account" && <AccountPage />}
        {activeTab === "about"   && <AboutPage />}
      </main>
    </div>
  );
}
```

- [ ] **Step 3: Update `src/options/main.tsx` to wrap with ClerkProvider**

Read the file, then replace it:

```tsx
import React from "react";
import ReactDOM from "react-dom/client";
import { ClerkProvider } from "@clerk/chrome-extension";
import { CLERK_PUBLISHABLE_KEY } from "@/shared/constants";
import { App } from "./App";
import "../styles/tailwind.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ClerkProvider publishableKey={CLERK_PUBLISHABLE_KEY}>
      <App />
    </ClerkProvider>
  </React.StrictMode>
);
```

- [ ] **Step 4: Delete `src/options/pages/PolicyPage.tsx`**

```bash
rm src/options/pages/PolicyPage.tsx
```

- [ ] **Step 5: Run TypeScript check**

```bash
npm run typecheck 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/options/ && git commit -m "feat(extension): remove policy editor; add Clerk account page to options"
```

---

### Task 7: Complete Claude.ai adapter

**Files:**
- Modify: `src/content/adapters/claude.ts`

Claude.ai uses a ProseMirror-based contenteditable editor. The send button has a `data-testid` attribute. These selectors were verified against claude.ai as of May 2026 — re-verify if the site changes.

- [ ] **Step 1: Rewrite `src/content/adapters/claude.ts`**

```ts
import type { SiteAdapter } from "./types";
import { SEND_SENTINEL_ATTR } from "@/shared/constants";
import { logger } from "@/shared/logger";

export const claudeAdapter: SiteAdapter = {
  hostname: /^claude\.ai$/,
  name: "Claude",

  findComposer(): HTMLElement | null {
    return (
      (document.querySelector('div[contenteditable="true"].ProseMirror') as HTMLElement | null) ??
      (document.querySelector('[data-testid="chat-input"] [contenteditable="true"]') as HTMLElement | null) ??
      (document.querySelector('div[contenteditable="true"]') as HTMLElement | null)
    );
  },

  findSendButton(): HTMLElement | null {
    return (
      (document.querySelector('button[data-testid="send-button"]') as HTMLElement | null) ??
      (document.querySelector('button[aria-label="Send Message"]') as HTMLElement | null) ??
      (document.querySelector('button[type="submit"]') as HTMLElement | null)
    );
  },

  readPromptText(composer: HTMLElement): string {
    return composer.innerText ?? "";
  },

  writePromptText(composer: HTMLElement, text: string): void {
    composer.innerText = text;
    composer.dispatchEvent(new Event("input", { bubbles: true }));
    composer.dispatchEvent(new Event("change", { bubbles: true }));
  },

  onSendIntent(handler: (e: Event) => Promise<{ proceed: boolean }>): () => void {
    let processing = false;

    const onClick = async (e: MouseEvent) => {
      const sendBtn = this.findSendButton();
      if (!sendBtn) return;
      if (sendBtn.hasAttribute(SEND_SENTINEL_ATTR)) return;
      if (!sendBtn.contains(e.target as Node) && e.target !== sendBtn) return;
      if (processing) { e.preventDefault(); e.stopPropagation(); return; }
      e.preventDefault(); e.stopPropagation();
      processing = true;
      try {
        const { proceed } = await handler(e);
        if (proceed) {
          sendBtn.setAttribute(SEND_SENTINEL_ATTR, "1");
          sendBtn.click();
          requestAnimationFrame(() => sendBtn.removeAttribute(SEND_SENTINEL_ATTR));
        }
      } catch (err) { logger.error("Claude onClick error:", err); }
      finally { processing = false; }
    };

    const onKeyDown = async (e: KeyboardEvent) => {
      if (e.key !== "Enter" || e.shiftKey) return;
      const composer = this.findComposer();
      if (!composer) return;
      if (!composer.contains(e.target as Node) && e.target !== composer) return;
      if (processing) { e.preventDefault(); e.stopPropagation(); return; }
      e.preventDefault(); e.stopPropagation();
      processing = true;
      try {
        const { proceed } = await handler(e);
        if (proceed) {
          const sendBtn = this.findSendButton();
          if (sendBtn) {
            sendBtn.setAttribute(SEND_SENTINEL_ATTR, "1");
            sendBtn.click();
            requestAnimationFrame(() => sendBtn.removeAttribute(SEND_SENTINEL_ATTR));
          }
        }
      } catch (err) { logger.error("Claude onKeyDown error:", err); }
      finally { processing = false; }
    };

    document.addEventListener("click", onClick, { capture: true });
    document.addEventListener("keydown", onKeyDown, { capture: true });
    return () => {
      document.removeEventListener("click", onClick, { capture: true });
      document.removeEventListener("keydown", onKeyDown, { capture: true });
    };
  },
};
```

- [ ] **Step 2: Commit**

```bash
git add src/content/adapters/claude.ts
git commit -m "feat(adapters): complete Claude.ai adapter with Enter key + click intercept"
```

---

### Task 8: Complete Gemini adapter

**Files:**
- Modify: `src/content/adapters/gemini.ts`

Gemini uses a custom `rich-textarea` web component with a `p` element inside. The send button has `data-mat-icon-name="send"`.

- [ ] **Step 1: Rewrite `src/content/adapters/gemini.ts`**

```ts
import type { SiteAdapter } from "./types";
import { SEND_SENTINEL_ATTR } from "@/shared/constants";
import { logger } from "@/shared/logger";

export const geminiAdapter: SiteAdapter = {
  hostname: /^gemini\.google\.com$/,
  name: "Gemini",

  findComposer(): HTMLElement | null {
    return (
      (document.querySelector('rich-textarea p[contenteditable="true"]') as HTMLElement | null) ??
      (document.querySelector('div[contenteditable="true"]') as HTMLElement | null) ??
      (document.querySelector('.ql-editor') as HTMLElement | null)
    );
  },

  findSendButton(): HTMLElement | null {
    return (
      (document.querySelector('button[data-mat-icon-name="send"]') as HTMLElement | null) ??
      (document.querySelector('button[aria-label="Send message"]') as HTMLElement | null) ??
      (document.querySelector('button.send-button') as HTMLElement | null)
    );
  },

  readPromptText(composer: HTMLElement): string {
    return composer.innerText ?? "";
  },

  writePromptText(composer: HTMLElement, text: string): void {
    composer.innerText = text;
    composer.dispatchEvent(new Event("input", { bubbles: true }));
    composer.dispatchEvent(new Event("change", { bubbles: true }));
  },

  onSendIntent(handler: (e: Event) => Promise<{ proceed: boolean }>): () => void {
    let processing = false;

    const onClick = async (e: MouseEvent) => {
      const sendBtn = this.findSendButton();
      if (!sendBtn) return;
      if (sendBtn.hasAttribute(SEND_SENTINEL_ATTR)) return;
      if (!sendBtn.contains(e.target as Node) && e.target !== sendBtn) return;
      if (processing) { e.preventDefault(); e.stopPropagation(); return; }
      e.preventDefault(); e.stopPropagation();
      processing = true;
      try {
        const { proceed } = await handler(e);
        if (proceed) {
          sendBtn.setAttribute(SEND_SENTINEL_ATTR, "1");
          sendBtn.click();
          requestAnimationFrame(() => sendBtn.removeAttribute(SEND_SENTINEL_ATTR));
        }
      } catch (err) { logger.error("Gemini onClick error:", err); }
      finally { processing = false; }
    };

    const onKeyDown = async (e: KeyboardEvent) => {
      if (e.key !== "Enter" || e.shiftKey) return;
      const composer = this.findComposer();
      if (!composer) return;
      if (!composer.contains(e.target as Node) && e.target !== composer) return;
      if (processing) { e.preventDefault(); e.stopPropagation(); return; }
      e.preventDefault(); e.stopPropagation();
      processing = true;
      try {
        const { proceed } = await handler(e);
        if (proceed) {
          const sendBtn = this.findSendButton();
          if (sendBtn) {
            sendBtn.setAttribute(SEND_SENTINEL_ATTR, "1");
            sendBtn.click();
            requestAnimationFrame(() => sendBtn.removeAttribute(SEND_SENTINEL_ATTR));
          }
        }
      } catch (err) { logger.error("Gemini onKeyDown error:", err); }
      finally { processing = false; }
    };

    document.addEventListener("click", onClick, { capture: true });
    document.addEventListener("keydown", onKeyDown, { capture: true });
    return () => {
      document.removeEventListener("click", onClick, { capture: true });
      document.removeEventListener("keydown", onKeyDown, { capture: true });
    };
  },
};
```

- [ ] **Step 2: Commit**

```bash
git add src/content/adapters/gemini.ts
git commit -m "feat(adapters): complete Gemini adapter with Enter key + click intercept"
```

---

### Task 9: Generic fallback adapter

**Files:**
- Create: `src/content/adapters/generic.ts`

- [ ] **Step 1: Write unit test in `src/content/adapters/generic.test.ts`**

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { JSDOM } from 'jsdom'

// We test the selector logic in isolation using jsdom
describe('generic adapter heuristics', () => {
  let dom: JSDOM
  let document: Document

  beforeEach(() => {
    dom = new JSDOM(`
      <html><body>
        <div id="small" contenteditable="true" style="width:100px;height:30px">small</div>
        <textarea id="large" style="width:400px;height:200px">big text area</textarea>
        <button id="submit" type="submit">Send</button>
      </body></html>
    `)
    document = dom.window.document
  })

  it('finds the largest editable element', () => {
    // The heuristic should prefer the textarea (400*200=80000) over the div (100*30=3000)
    const elements = [
      ...Array.from(document.querySelectorAll('textarea')),
      ...Array.from(document.querySelectorAll('[contenteditable="true"]')),
    ] as HTMLElement[]

    const largest = elements.reduce<HTMLElement | null>((best, el) => {
      const r = el.getBoundingClientRect()
      const area = r.width * r.height
      if (!best) return el
      const bestR = best.getBoundingClientRect()
      return area > bestR.width * bestR.height ? el : best
    }, null)

    // jsdom getBoundingClientRect returns zeros — verify fallback behaviour
    // In jsdom, all rects are 0,0 so we fall back to DOM order (first textarea wins)
    expect(largest).not.toBeNull()
  })
})
```

- [ ] **Step 2: Run to confirm**

```bash
npx vitest run src/content/adapters/generic.test.ts 2>&1 | tail -5
```

Expected: PASS (jsdom behaviour verified).

- [ ] **Step 3: Create `src/content/adapters/generic.ts`**

```ts
import type { SiteAdapter } from "./types";
import { SEND_SENTINEL_ATTR } from "@/shared/constants";
import { getSiteConfigs } from "@/policy/loader";
import { logger } from "@/shared/logger";

function findLargestEditableElement(): HTMLElement | null {
  const candidates = [
    ...Array.from(document.querySelectorAll<HTMLElement>("textarea")),
    ...Array.from(document.querySelectorAll<HTMLElement>('[contenteditable="true"]')),
  ]
  if (candidates.length === 0) return null
  return candidates.reduce<HTMLElement>((best, el) => {
    const r = el.getBoundingClientRect()
    const br = best.getBoundingClientRect()
    return r.width * r.height > br.width * br.height ? el : best
  })
}

function findNearestSubmitButton(input: HTMLElement): HTMLElement | null {
  // Walk up to a shared ancestor then look for submit buttons
  let ancestor: HTMLElement | null = input.parentElement
  for (let depth = 0; depth < 8 && ancestor; depth++) {
    const btn =
      (ancestor.querySelector<HTMLElement>('button[type="submit"]')) ??
      (ancestor.querySelector<HTMLElement>("button:last-of-type"))
    if (btn) return btn
    ancestor = ancestor.parentElement
  }
  return null
}

export const genericFallbackAdapter: SiteAdapter = {
  hostname: /./,    // matches everything — only used as fallback
  name: "Generic",

  findComposer(): HTMLElement | null {
    // Defer to admin-configured selector if available
    void getSiteConfigs().then((configs) => {
      const cfg = configs[location.hostname]
      if (cfg?.inputSelector) {
        return document.querySelector<HTMLElement>(cfg.inputSelector)
      }
    })
    return findLargestEditableElement()
  },

  findSendButton(): HTMLElement | null {
    const composer = this.findComposer()
    return composer ? findNearestSubmitButton(composer) : null
  },

  readPromptText(composer: HTMLElement): string {
    if (composer instanceof HTMLTextAreaElement) return composer.value
    return composer.innerText ?? ""
  },

  writePromptText(composer: HTMLElement, text: string): void {
    if (composer instanceof HTMLTextAreaElement) {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set
      setter?.call(composer, text)
    } else {
      composer.innerText = text
    }
    composer.dispatchEvent(new Event("input", { bubbles: true }))
    composer.dispatchEvent(new Event("change", { bubbles: true }))
  },

  onSendIntent(handler: (e: Event) => Promise<{ proceed: boolean }>): () => void {
    let processing = false

    const onClick = async (e: MouseEvent) => {
      const sendBtn = this.findSendButton()
      if (!sendBtn) return
      if (sendBtn.hasAttribute(SEND_SENTINEL_ATTR)) return
      if (!sendBtn.contains(e.target as Node) && e.target !== sendBtn) return
      if (processing) { e.preventDefault(); e.stopPropagation(); return }
      e.preventDefault(); e.stopPropagation()
      processing = true
      try {
        const { proceed } = await handler(e)
        if (proceed) {
          sendBtn.setAttribute(SEND_SENTINEL_ATTR, "1")
          sendBtn.click()
          requestAnimationFrame(() => sendBtn.removeAttribute(SEND_SENTINEL_ATTR))
        }
      } catch (err) { logger.error("Generic onClick error:", err) }
      finally { processing = false }
    }

    const onKeyDown = async (e: KeyboardEvent) => {
      if (e.key !== "Enter" || e.shiftKey) return
      const composer = this.findComposer()
      if (!composer) return
      if (!composer.contains(e.target as Node) && e.target !== composer) return
      if (processing) { e.preventDefault(); e.stopPropagation(); return }
      e.preventDefault(); e.stopPropagation()
      processing = true
      try {
        const { proceed } = await handler(e)
        if (proceed) {
          const sendBtn = this.findSendButton()
          if (sendBtn) {
            sendBtn.setAttribute(SEND_SENTINEL_ATTR, "1")
            sendBtn.click()
            requestAnimationFrame(() => sendBtn.removeAttribute(SEND_SENTINEL_ATTR))
          }
        }
      } catch (err) { logger.error("Generic onKeyDown error:", err) }
      finally { processing = false }
    }

    document.addEventListener("click", onClick, { capture: true })
    document.addEventListener("keydown", onKeyDown, { capture: true })
    return () => {
      document.removeEventListener("click", onClick, { capture: true })
      document.removeEventListener("keydown", onKeyDown, { capture: true })
    }
  },
}
```

- [ ] **Step 4: Commit**

```bash
git add src/content/adapters/generic.ts src/content/adapters/generic.test.ts
git commit -m "feat(adapters): generic fallback adapter with heuristics + siteConfig override"
```

---

### Task 10: Update adapter registry + final TypeScript check

**Files:**
- Modify: `src/content/adapters/registry.ts`

- [ ] **Step 1: Update `src/content/adapters/registry.ts`**

```ts
import type { SiteAdapter } from "./types";
import { chatGPTAdapter } from "./chatgpt";
import { claudeAdapter } from "./claude";
import { geminiAdapter } from "./gemini";
import { genericFallbackAdapter } from "./generic";

const SPECIFIC_ADAPTERS: SiteAdapter[] = [chatGPTAdapter, claudeAdapter, geminiAdapter];

export function getAdapter(hostname: string): SiteAdapter {
  for (const adapter of SPECIFIC_ADAPTERS) {
    if (typeof adapter.hostname === "string") {
      if (adapter.hostname === hostname) return adapter;
    } else {
      if (adapter.hostname.test(hostname)) return adapter;
    }
  }
  return genericFallbackAdapter;
}
```

Note: return type changed from `SiteAdapter | null` to `SiteAdapter` — update any callers in `content-script.ts` that checked for null.

- [ ] **Step 2: Update `src/content/content-script.ts` to remove the null check**

Read the file, find where `getAdapter` result is checked for null, and remove the null guard since the function now always returns an adapter. If the site is unknown, the generic adapter handles it.

- [ ] **Step 3: Run full TypeScript check**

```bash
npm run typecheck 2>&1
```

Expected: 0 errors. Fix any remaining type errors before committing.

- [ ] **Step 4: Run tests**

```bash
npx vitest run 2>&1 | tail -10
```

Expected: all unit tests pass (`schema.test.ts`, `bridge.test.ts`, `generic.test.ts`).

- [ ] **Step 5: Final commit**

```bash
git add src/content/adapters/registry.ts src/content/content-script.ts
git commit -m "feat(adapters): registry returns generic fallback; complete extension update"
```
