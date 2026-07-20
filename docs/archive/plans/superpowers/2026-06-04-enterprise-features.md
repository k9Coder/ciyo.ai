# Enterprise Features Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement two high-value enterprise features: (1) a SIEM webhook that POSTs policy events to a configurable URL, and (2) Chrome Enterprise / JAMF/Intune MDM force-install support.

**Architecture:** SIEM webhook is a per-tenant configurable HTTP POST target. When a block or warn event fires, the event is forwarded to the configured URL with a signed HMAC payload. Chrome Enterprise support means publishing a managed storage policy JSON that IT admins can deploy via ADMX/JAMF/Intune to pre-configure the extension without user interaction.

**Tech Stack:** Fastify, Node.js `crypto` (HMAC), Drizzle ORM (new `siem_webhooks` table), Chrome Managed Storage API.

---

### Task 1: SIEM Webhook — Database Schema and Config API (S-6)

**Files:**
- Modify: `backend/src/db/schema.ts`
- Create: `backend/src/db/migrations/0020_add_siem_webhooks.sql`
- Create: `backend/src/siem/router.ts`
- Create: `backend/src/siem/service.ts`

- [ ] Step 1: Add the `siem_webhooks` table to `backend/src/db/schema.ts`. Add after the `siteConfigs` table:
```typescript
// ── SIEM Webhooks ─────────────────────────────────────────────────────────────
export const siemWebhooks = pgTable('siem_webhooks', {
  id:          uuid('id').primaryKey().defaultRandom(),
  tenantId:    uuid('tenant_id').notNull().references(() => tenants.id),
  url:         text('url').notNull(),
  secret:      text('secret').notNull(),   // HMAC secret for signing payloads
  active:      boolean('active').notNull().default(true),
  description: text('description'),
  createdAt:   timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  tenantIdx: index().on(t.tenantId),
}))
```

- [ ] Step 2: Generate and run the migration.
```bash
cd backend && pnpm run db:generate
pnpm run db:migrate
# Expected: migration applied, siem_webhooks table created
```

- [ ] Step 3: Create `backend/src/siem/service.ts`:
```typescript
import { createHmac } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { db } from '../db/client.js'
import { siemWebhooks } from '../db/schema.js'
import { logger } from '../logger/index.js'

export interface SiemEventPayload {
  event_type:   string   // 'rule.block' | 'rule.warn'
  rule_id:      string
  member_email: string | null
  site_url:     string
  timestamp:    string
  tenant_slug:  string
}

function signPayload(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('hex')
}

export async function dispatchSiemEvent(
  tenantId: string,
  payload:  SiemEventPayload
): Promise<void> {
  const webhooks = await db
    .select()
    .from(siemWebhooks)
    .where(eq(siemWebhooks.tenantId, tenantId))

  const body = JSON.stringify(payload)

  for (const wh of webhooks) {
    if (!wh.active) continue
    const sig = signPayload(body, wh.secret)

    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 10_000)
      const res = await fetch(wh.url, {
        method:  'POST',
        headers: {
          'Content-Type':        'application/json',
          'X-Mykka-Signature':    `sha256=${sig}`,
          'X-Mykka-Event':        payload.event_type,
        },
        body,
        signal: controller.signal,
      })
      clearTimeout(timer)

      if (!res.ok) {
        logger.warn('SIEM webhook delivery failed', {
          webhookId: wh.id, status: res.status, url: wh.url,
        })
      }
    } catch (err) {
      logger.error('SIEM webhook error', {
        webhookId: wh.id, url: wh.url,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }
}

export async function createSiemWebhook(
  tenantId:    string,
  data: { url: string; description?: string }
): Promise<{ id: string; secret: string }> {
  const { randomBytes } = await import('node:crypto')
  const secret = randomBytes(32).toString('hex')

  const [row] = await db.insert(siemWebhooks).values({
    tenantId,
    url:         data.url,
    secret,
    description: data.description ?? null,
  }).returning({ id: siemWebhooks.id })

  return { id: row!.id, secret }
}

export async function listSiemWebhooks(tenantId: string) {
  return db.select({
    id:          siemWebhooks.id,
    url:         siemWebhooks.url,
    description: siemWebhooks.description,
    active:      siemWebhooks.active,
    createdAt:   siemWebhooks.createdAt,
    // Note: secret is NOT returned in list — only shown once at creation
  }).from(siemWebhooks).where(eq(siemWebhooks.tenantId, tenantId))
}

export async function deleteSiemWebhook(tenantId: string, id: string): Promise<void> {
  await db.delete(siemWebhooks)
    .where(eq(siemWebhooks.id, id))
}
```

- [ ] Step 4: Create `backend/src/siem/router.ts`:
```typescript
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { requireAdminTokenOrClerkAdmin } from '../auth/middleware.js'
import { createSiemWebhook, listSiemWebhooks, deleteSiemWebhook } from './service.js'

const createSchema = z.object({
  url:         z.string().url(),
  description: z.string().max(500).optional(),
})

export async function siemRouter(fastify: FastifyInstance): Promise<void> {
  fastify.get('/siem/webhooks', { preHandler: requireAdminTokenOrClerkAdmin }, async (req) => {
    return { webhooks: await listSiemWebhooks(req.tenant.id) }
  })

  fastify.post('/siem/webhooks', { preHandler: requireAdminTokenOrClerkAdmin }, async (req, reply) => {
    const result = createSchema.safeParse(req.body)
    if (!result.success) return reply.status(400).send({ error: result.error.message })

    const webhook = await createSiemWebhook(req.tenant.id, result.data)
    // Return the secret once — it will not be retrievable again
    return reply.status(201).send({
      id:     webhook.id,
      secret: webhook.secret,
      note:   'Store this secret securely — it will not be shown again.',
    })
  })

  fastify.delete('/siem/webhooks/:id', { preHandler: requireAdminTokenOrClerkAdmin }, async (req, reply) => {
    const { id } = req.params as { id: string }
    await deleteSiemWebhook(req.tenant.id, id)
    return reply.status(204).send()
  })
}
```

- [ ] Step 5: Register the router in `backend/src/app.ts`:
```typescript
import { siemRouter } from './siem/router.js'
// In buildApp():
void app.register(siemRouter, { prefix: '/v1' })
```

- [ ] Step 6: Build.
```bash
cd backend && pnpm run build 2>&1 | grep -i error
# Expected: (empty)
```

- [ ] Step 7: Commit.
```bash
git add backend/src/db/schema.ts backend/src/siem/ backend/src/app.ts
git commit -m "feat(enterprise): SIEM webhook — configurable event forwarding endpoint

Adds /v1/siem/webhooks CRUD API. Events dispatched with HMAC-SHA256
signature in X-Mykka-Signature header. Secret shown once at creation.
Most-requested enterprise feature (SOC/SIEM integration)."
```

---

### Task 2: SIEM Webhook — Dispatch on Event Creation

**Files:**
- Modify: `backend/src/events/service.ts` (or wherever events are inserted)

- [ ] Step 1: Find where events are created in the backend.
```bash
ls "c:/Users/yarin/Documents/code/prompt-saviour/backend/src/events/"
```

- [ ] Step 2: Open the events service/router. After an event row is inserted, call `dispatchSiemEvent`. The dispatch is fire-and-forget (don't fail the main request if SIEM delivery fails):

```typescript
import { dispatchSiemEvent } from '../siem/service.js'

// After the event insert:
if (result.tenantId && result.ruleId) {
  const memberEmail = member?.email ?? null
  dispatchSiemEvent(result.tenantId, {
    event_type:   result.action === 'block' ? 'rule.block' : 'rule.warn',
    rule_id:      result.ruleId,
    member_email: memberEmail,
    site_url:     result.siteUrl,
    timestamp:    new Date().toISOString(),
    tenant_slug:  req.tenant.slug,
  }).catch((err) => logger.error('SIEM dispatch error', { error: err.message }))
}
```

- [ ] Step 3: Build and run tests.
```bash
cd backend && pnpm run build 2>&1 | grep -i error
cd backend && pnpm test -- --reporter=verbose events
# Expected: all pass
```

- [ ] Step 4: Commit.
```bash
git add backend/src/events/
git commit -m "feat(enterprise): dispatch SIEM webhook on every block/warn event

Events are forwarded to configured SIEM webhook URLs asynchronously.
Delivery failures are logged but do not fail the event creation request."
```

---

### Task 3: Chrome Enterprise / MDM Managed Storage (S-7)

**Files:**
- Create: `pretzel/src/managed-storage/managed-storage.ts`
- Modify: `pretzel/public/manifest.json`
- Create: `pretzel/managed-storage-schema.json`

- [ ] Step 1: Add `storage` permission and `managed` storage area to `pretzel/public/manifest.json`. Check current manifest:
```bash
cat "c:/Users/yarin/Documents/code/prompt-saviour/pretzel/public/manifest.json"
```

Add to `permissions` array: `"storage"` (if not present).

Add a `storage` key for managed storage:
```json
{
  "storage": {
    "managed_schema": "managed-storage-schema.json"
  }
}
```

- [ ] Step 2: Create `pretzel/managed-storage-schema.json` — the schema that ADMX/JAMF/Intune will use to configure the extension:
```json
{
  "type": "object",
  "properties": {
    "apiBase": {
      "type": "string",
      "title": "Pretzel API Base URL",
      "description": "Base URL of the mykka.ai API. Default: https://api.mykka.ai"
    },
    "orgToken": {
      "type": "string",
      "title": "Organization Token",
      "description": "The ps_live_... org token from your Pretzel Console Settings page."
    },
    "forceEnabled": {
      "type": "boolean",
      "title": "Force Enable",
      "description": "If true, users cannot disable the extension. Default: false"
    },
    "silentMode": {
      "type": "boolean",
      "title": "Silent Mode",
      "description": "If true, the extension blocks without showing UI alerts to users."
    }
  }
}
```

- [ ] Step 3: Create `pretzel/src/managed-storage/managed-storage.ts` to read managed storage on startup:
```typescript
export interface ManagedConfig {
  apiBase?:      string
  orgToken?:     string
  forceEnabled?: boolean
  silentMode?:   boolean
}

export async function getManagedConfig(): Promise<ManagedConfig> {
  return new Promise((resolve) => {
    if (!chrome.storage.managed) {
      resolve({})
      return
    }
    chrome.storage.managed.get(null, (items) => {
      if (chrome.runtime.lastError) {
        resolve({})
        return
      }
      resolve(items as ManagedConfig)
    })
  })
}

export async function applyManagedConfig(): Promise<void> {
  const managed = await getManagedConfig()

  if (managed.orgToken) {
    // Pre-configure the org token from MDM — user does not need to paste it
    await chrome.storage.local.set({ orgToken: managed.orgToken })
  }

  if (managed.apiBase) {
    await chrome.storage.local.set({ apiBase: managed.apiBase })
  }
}
```

- [ ] Step 4: Call `applyManagedConfig()` in the extension background script on install/startup.

Find the background script entry:
```bash
grep -rn "chrome.runtime.onInstalled\|onStartup" pretzel/src/ --include="*.ts" | head -5
```

In the background script, add:
```typescript
import { applyManagedConfig } from './managed-storage/managed-storage.js'

chrome.runtime.onInstalled.addListener(async () => {
  await applyManagedConfig()
})

chrome.runtime.onStartup.addListener(async () => {
  await applyManagedConfig()
})
```

- [ ] Step 5: Create a JAMF/Intune-ready configuration plist template. Create `pretzel/docs/mdm/jamf-config.plist`:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <!-- Chrome Extension Forced Install -->
  <key>ExtensionInstallForcelist</key>
  <array>
    <!-- Replace EXTENSION_ID with your Chrome Web Store extension ID -->
    <string>EXTENSION_ID;https://clients2.google.com/service/update2/crx</string>
  </array>

  <!-- Managed Storage Policy for the extension -->
  <key>3rdparty</key>
  <dict>
    <key>extensions</key>
    <dict>
      <key>EXTENSION_ID</key>
      <dict>
        <key>orgToken</key>
        <string>ps_live_YOURSLUG_YOURSECRET</string>
        <key>forceEnabled</key>
        <true/>
        <key>apiBase</key>
        <string>https://api.mykka.ai</string>
      </dict>
    </dict>
  </dict>
</dict>
</plist>
```

- [ ] Step 6: Build the extension to verify manifest changes are valid.
```bash
cd pretzel && pnpm run build 2>&1 | tail -10
# Expected: build succeeds, no manifest errors
```

- [ ] Step 7: Commit.
```bash
git add pretzel/src/managed-storage/ pretzel/public/manifest.json pretzel/managed-storage-schema.json pretzel/docs/mdm/
git commit -m "feat(enterprise): Chrome Enterprise managed storage for MDM force-install

Adds chrome.storage.managed support for JAMF/Intune/Intune deployment.
IT admins can pre-configure orgToken and apiBase via managed policy.
Includes JAMF plist template in pretzel/docs/mdm/."
```
