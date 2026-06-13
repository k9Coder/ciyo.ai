# PayPal Webhook Signature Verification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement proper PayPal webhook signature verification so that unauthenticated POST requests cannot activate tenants or cancel subscriptions.

**Architecture:** PayPal provides a REST API (`POST /v1/notifications/verify-webhook-signature`) that verifies the four headers PayPal sends with every webhook. We call that endpoint before processing any event. We also add Zod validation on the `custom_id` field to prevent injection via that vector. The `PAYPAL_SKIP_SIG_VERIFY` env guard is removed from staging config.

**Tech Stack:** Fastify, PayPal REST API, Zod, existing `getAccessToken()` helper in `backend/src/billing/paypal.ts`.

---

### Task 1: Add Zod Schema for custom_id Parsing

**Files:**
- Modify: `backend/src/billing/paypal.ts`

- [ ] Step 1: Install Zod if not present (it is already a dependency in backend).
```bash
cd backend && node -e "require('zod'); console.log('zod ok')"
# Expected: zod ok
```

- [ ] Step 2: Add a Zod schema at the top of `backend/src/billing/paypal.ts` that strictly validates the `custom_id` pipe-delimited format. Replace the existing `parseCustomId` function with a typed Zod-parsed version.

Add this import and schema after the existing imports:
```typescript
import { z } from 'zod'

const customIdSchema = z.object({
  slug:      z.string().regex(/^[a-z0-9-]{3,60}$/, 'invalid slug'),
  name:      z.string().min(1).max(200),
  email:     z.string().email(),
  plan:      z.enum(['starter', 'business']),
  seatCount: z.number().int().min(1).max(10000),
})

function parseCustomId(raw: string): z.infer<typeof customIdSchema> | null {
  const parts = raw.split('|')
  if (parts.length < 5) return null
  const [slug, name, email, plan, seats] = parts
  const result = customIdSchema.safeParse({
    slug,
    name,
    email,
    plan,
    seatCount: parseInt(seats ?? '1', 10),
  })
  return result.success ? result.data : null
}
```

- [ ] Step 3: Run unit test to confirm parsing rejects bad inputs.
```bash
cd backend && node -e "
const z = require('zod');
const raw = 'bad-slug-with-UPPER|Test Org|test@example.com|starter|5';
const parts = raw.split('|');
const [slug, name, email, plan, seats] = parts;
const schema = z.object({ slug: z.string().regex(/^[a-z0-9-]{3,60}\$/), name: z.string().min(1), email: z.string().email(), plan: z.enum(['starter','business']), seatCount: z.number().int().min(1) });
const r = schema.safeParse({ slug, name, email, plan, seatCount: parseInt(seats, 10) });
console.log('should fail:', r.success);
// Expected: should fail: false
"
```

---

### Task 2: Implement PayPal Signature Verification

**Files:**
- Modify: `backend/src/billing/paypal.ts`

- [ ] Step 1: Add a `verifyPayPalSignature` function that calls the PayPal verification endpoint. The function takes the raw request body string and the four PayPal headers.

Add this function after `getAccessToken`:
```typescript
interface PayPalHeaders {
  'paypal-transmission-id':   string
  'paypal-transmission-time': string
  'paypal-cert-url':          string
  'paypal-auth-algo':         string
  'paypal-transmission-sig':  string
}

async function verifyPayPalSignature(
  rawBody:   string,
  headers:   PayPalHeaders,
  webhookId: string
): Promise<boolean> {
  if (process.env['PAYPAL_SKIP_SIG_VERIFY'] === 'true') {
    // Only allow in test environment — never staging or production
    if (process.env['NODE_ENV'] === 'production' || process.env['APP_ENV'] === 'staging') {
      throw new Error('PAYPAL_SKIP_SIG_VERIFY must not be set in staging or production')
    }
    return true
  }

  const token = await getAccessToken()
  const res = await fetch(`${PAYPAL_API}/v1/notifications/verify-webhook-signature`, {
    method:  'POST',
    headers: {
      Authorization:  `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      transmission_id:   headers['paypal-transmission-id'],
      transmission_time: headers['paypal-transmission-time'],
      cert_url:          headers['paypal-cert-url'],
      auth_algo:         headers['paypal-auth-algo'],
      transmission_sig:  headers['paypal-transmission-sig'],
      webhook_id:        webhookId,
      webhook_event:     JSON.parse(rawBody),
    }),
  })

  if (!res.ok) return false
  const data = await res.json() as { verification_status: string }
  return data.verification_status === 'SUCCESS'
}
```

- [ ] Step 2: Add `PAYPAL_WEBHOOK_ID` to the backend environment variable documentation. Update `backend/.env.staging` (untracked) with:
```
PAYPAL_WEBHOOK_ID=<webhook_id_from_paypal_dashboard>
```

---

### Task 3: Wire Verification into the Webhook Route

**Files:**
- Modify: `backend/src/app.ts`
- Modify: `backend/src/billing/paypal.ts`

- [ ] Step 1: The `/webhooks/paypal` route in `backend/src/app.ts` currently parses the body as JSON via the custom content-type parser before handing it to `handlePayPalEvent`. Change it to pass the **raw string** body plus the PayPal headers so verification can be performed.

In `backend/src/app.ts`, change the PayPal content-type parser to also preserve the raw body for PayPal webhook routes. Update the `addContentTypeParser` condition:
```typescript
app.addContentTypeParser('application/json', { parseAs: 'string' }, (req, body, done) => {
  if (
    req.url?.startsWith('/webhooks/stripe') ||
    req.url?.startsWith('/webhooks/clerk') ||
    req.url?.startsWith('/webhooks/paypal')
  ) {
    done(null, body)
  } else {
    try { done(null, JSON.parse(body as string)) }
    catch (e) { done(e as Error) }
  }
})
```

Update the `/webhooks/paypal` route handler:
```typescript
app.post('/webhooks/paypal', async (request, reply) => {
  const rawBody = request.body as string
  const headers = {
    'paypal-transmission-id':   (request.headers['paypal-transmission-id']   as string) ?? '',
    'paypal-transmission-time': (request.headers['paypal-transmission-time'] as string) ?? '',
    'paypal-cert-url':          (request.headers['paypal-cert-url']           as string) ?? '',
    'paypal-auth-algo':         (request.headers['paypal-auth-algo']          as string) ?? '',
    'paypal-transmission-sig':  (request.headers['paypal-transmission-sig']   as string) ?? '',
  }

  const webhookId = process.env['PAYPAL_WEBHOOK_ID'] ?? ''
  if (!webhookId) {
    logger.error('PAYPAL_WEBHOOK_ID not configured')
    return reply.status(500).send({ error: 'Webhook not configured' })
  }

  const valid = await verifyPayPalWebhook(rawBody, headers, webhookId)
  if (!valid) {
    logger.warn('PayPal webhook signature verification failed', { headers })
    return reply.status(401).send({ error: 'Invalid signature' })
  }

  await handlePayPalEvent(JSON.parse(rawBody) as Record<string, unknown>)
  return reply.status(200).send({ received: true })
})
```

- [ ] Step 2: Export `verifyPayPalSignature` from `paypal.ts` as `verifyPayPalWebhook` and update the import in `app.ts`.

In `backend/src/billing/paypal.ts`, add at the bottom:
```typescript
export { verifyPayPalSignature as verifyPayPalWebhook }
```

In `backend/src/app.ts`, update the import:
```typescript
import { handlePayPalEvent, verifyPayPalWebhook } from './billing/paypal.js'
```

- [ ] Step 3: Build and confirm no TypeScript errors.
```bash
cd backend && pnpm run build 2>&1 | tail -10
# Expected: no errors, "dist/" updated
```

---

### Task 4: Write Unit Tests

**Files:**
- Create: `backend/tests/billing/paypal-webhook.test.ts`

- [ ] Step 1: Create the test file.
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock global fetch
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

// We test the verification logic in isolation
describe('PayPal webhook signature verification', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env['PAYPAL_CLIENT_ID']     = 'test-client'
    process.env['PAYPAL_CLIENT_SECRET'] = 'test-secret'
    process.env['PAYPAL_WEBHOOK_ID']    = 'WH-test-id-123'
    process.env['PAYPAL_SKIP_SIG_VERIFY'] = undefined
    process.env['NODE_ENV'] = 'test'
  })

  it('returns false when verification_status is FAILURE', async () => {
    // Mock OAuth token call
    mockFetch
      .mockResolvedValueOnce({ json: async () => ({ access_token: 'tok' }) })
      // Mock verification call
      .mockResolvedValueOnce({ ok: true, json: async () => ({ verification_status: 'FAILURE' }) })

    const { verifyPayPalWebhook } = await import('../../src/billing/paypal.js')
    const result = await verifyPayPalWebhook(
      JSON.stringify({ event_type: 'BILLING.SUBSCRIPTION.ACTIVATED' }),
      {
        'paypal-transmission-id':   'id',
        'paypal-transmission-time': 'time',
        'paypal-cert-url':          'https://cert.paypal.com/cert.pem',
        'paypal-auth-algo':         'SHA256withRSA',
        'paypal-transmission-sig':  'badsig',
      },
      'WH-test-id-123'
    )
    expect(result).toBe(false)
  })

  it('returns true when verification_status is SUCCESS', async () => {
    mockFetch
      .mockResolvedValueOnce({ json: async () => ({ access_token: 'tok' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ verification_status: 'SUCCESS' }) })

    const { verifyPayPalWebhook } = await import('../../src/billing/paypal.js')
    const result = await verifyPayPalWebhook(
      JSON.stringify({ event_type: 'BILLING.SUBSCRIPTION.ACTIVATED' }),
      {
        'paypal-transmission-id':   'id',
        'paypal-transmission-time': 'time',
        'paypal-cert-url':          'https://cert.paypal.com/cert.pem',
        'paypal-auth-algo':         'SHA256withRSA',
        'paypal-transmission-sig':  'goodsig',
      },
      'WH-test-id-123'
    )
    expect(result).toBe(true)
  })

  it('rejects SKIP_SIG_VERIFY=true in staging', async () => {
    process.env['PAYPAL_SKIP_SIG_VERIFY'] = 'true'
    process.env['APP_ENV'] = 'staging'

    const { verifyPayPalWebhook } = await import('../../src/billing/paypal.js')
    await expect(
      verifyPayPalWebhook(JSON.stringify({}), {} as never, 'WH-test')
    ).rejects.toThrow('must not be set in staging or production')

    delete process.env['APP_ENV']
  })
})
```

- [ ] Step 2: Run the tests.
```bash
cd backend && pnpm test -- --reporter=verbose paypal-webhook
# Expected:
# ✓ returns false when verification_status is FAILURE
# ✓ returns true when verification_status is SUCCESS
# ✓ rejects SKIP_SIG_VERIFY=true in staging
# Test Files: 1 passed
```

- [ ] Step 3: Commit.
```bash
git add backend/src/billing/paypal.ts backend/src/app.ts backend/tests/billing/paypal-webhook.test.ts
git commit -m "security(paypal): implement webhook signature verification via PayPal verify API

- Added verifyPayPalSignature() that calls /v1/notifications/verify-webhook-signature
- Added Zod validation on custom_id to prevent slug injection
- Route now returns 401 on invalid signature
- PAYPAL_SKIP_SIG_VERIFY throws in staging/production"
```

---

### Task 5: Remove PAYPAL_SKIP_SIG_VERIFY from Staging Config

**Files:**
- Modify: `backend/.env.staging` (file is now untracked)

- [ ] Step 1: Open `backend/.env.staging` and remove or comment out the line:
```
# REMOVED — never skip PayPal sig verification
# PAYPAL_SKIP_SIG_VERIFY=true
```
Add the new required variable:
```
PAYPAL_WEBHOOK_ID=<your_paypal_webhook_id_from_dashboard>
```

- [ ] Step 2: Update Railway staging environment variables to remove `PAYPAL_SKIP_SIG_VERIFY` and add `PAYPAL_WEBHOOK_ID`.

- [ ] Step 3: Trigger a test webhook from the PayPal sandbox dashboard and confirm the backend logs `received: true` for a valid event.
```bash
# In Railway logs or local dev server logs, look for:
# {"level":"info","msg":"PayPal event processed","event_type":"BILLING.SUBSCRIPTION.ACTIVATED"}
# NOT:
# {"level":"warn","msg":"PayPal webhook signature verification failed"}
```
