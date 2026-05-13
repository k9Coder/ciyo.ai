import { activateTenant, updateSubscriptionStatus } from './service.js'
import { sendWelcomeEmail } from './email.js'
import { db } from '../db/client.js'
import { tenants } from '../db/schema.js'
import { eq } from 'drizzle-orm'

function parseCustomId(raw: string): { slug: string; name: string; email: string } | null {
  const [slug, name, email] = raw.split('|')
  if (!slug || !name || !email) return null
  return { slug, name, email }
}

async function tenantIdBySubId(subId: string): Promise<string | null> {
  const [row] = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.externalSubId, subId))
  return row?.id ?? null
}

export async function handlePayPalEvent(body: Record<string, unknown>): Promise<void> {
  const eventType = body['event_type'] as string
  const resource = body['resource'] as Record<string, unknown>

  switch (eventType) {
    case 'BILLING.SUBSCRIPTION.ACTIVATED': {
      const parsed = parseCustomId((resource['custom_id'] as string) ?? '')
      if (!parsed) return
      const result = await activateTenant({
        name: parsed.name,
        slug: parsed.slug,
        paymentProvider: 'paypal',
        externalSubId: (resource['id'] as string) ?? '',
      })
      sendWelcomeEmail({ to: parsed.email, tenantName: parsed.name, orgToken: result.orgToken, adminToken: result.adminToken }).catch(() => {})
      break
    }
    case 'PAYMENT.SALE.COMPLETED': {
      const id = await tenantIdBySubId((resource['billing_agreement_id'] as string) ?? '')
      if (id) await updateSubscriptionStatus(id, 'active')
      break
    }
    case 'BILLING.SUBSCRIPTION.CANCELLED': {
      const id = await tenantIdBySubId((resource['id'] as string) ?? '')
      if (id) await updateSubscriptionStatus(id, 'cancelled')
      break
    }
    case 'BILLING.SUBSCRIPTION.PAYMENT.FAILED': {
      const id = await tenantIdBySubId((resource['id'] as string) ?? '')
      if (id) await updateSubscriptionStatus(id, 'past_due')
      break
    }
  }
}
