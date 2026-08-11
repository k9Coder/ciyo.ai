import { eq, desc, max, and } from 'drizzle-orm'
import { db } from '../db/client.js'
import { policies, type PolicyRow } from '../db/schema.js'
import { policyBus, policyUpdatedEvent } from '../events/policy-bus.js'
import type { PolicyDoc } from './compiler.js'

export async function getVersionOnly(tenantId: string): Promise<number | null> {
  const [row] = await db
    .select({ version: max(policies.version) })
    .from(policies)
    .where(eq(policies.tenantId, tenantId))
  return row?.version ?? null
}

export async function getLatestPolicy(tenantId: string): Promise<PolicyRow | null> {
  const [row] = await db
    .select()
    .from(policies)
    .where(eq(policies.tenantId, tenantId))
    .orderBy(desc(policies.version))
    .limit(1)
  return row ?? null
}

export async function publishPolicy(tenantId: string, policyJson: unknown): Promise<number> {
  const current     = await getVersionOnly(tenantId)
  const nextVersion = (current ?? 0) + 1
  await db.insert(policies).values({ tenantId, version: nextVersion, policyJson })
  policyBus.emit(policyUpdatedEvent(tenantId))
  return nextVersion
}

/**
 * Publish an initial empty policy (v1) for a freshly created tenant so its
 * clients (extension/desktop) get `200 + empty policy` from GET /policy instead
 * of a 404 "No policy published". A brand-new org provably has zero
 * subjects/rules/site-configs, so we build the doc directly rather than calling
 * compilePolicy — that keeps this off the internal-service/request-context path,
 * which isn't reliably set up on the Clerk-webhook auto-provision flow.
 * No-op if a policy already exists (idempotent; safe to call more than once).
 */
export async function publishInitialPolicy(
  tenantId: string,
  failMode: 'open' | 'closed' = 'open',
): Promise<number | null> {
  const current = await getVersionOnly(tenantId)
  if (current !== null) return null // already has a published policy — leave it
  const emptyPolicy: PolicyDoc = { version: 1, tenantId, subjects: [], siteConfigs: {}, failMode }
  return publishPolicy(tenantId, emptyPolicy)
}

export async function getHistory(tenantId: string): Promise<Array<{ version: number; publishedAt: Date }>> {
  return db
    .select({ version: policies.version, publishedAt: policies.publishedAt })
    .from(policies)
    .where(eq(policies.tenantId, tenantId))
    .orderBy(desc(policies.version))
}

export async function rollback(tenantId: string, toVersion: number): Promise<number> {
  const [row] = await db
    .select({ policyJson: policies.policyJson })
    .from(policies)
    .where(and(eq(policies.tenantId, tenantId), eq(policies.version, toVersion)))
  if (!row) throw new Error(`Version ${toVersion} not found for tenant ${tenantId}`)
  return publishPolicy(tenantId, row.policyJson)
}
