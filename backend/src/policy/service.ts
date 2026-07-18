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
  validatePolicyForPublish(policyJson)
  const current     = await getVersionOnly(tenantId)
  const nextVersion = (current ?? 0) + 1
  await db.insert(policies).values({ tenantId, version: nextVersion, policyJson })
  policyBus.emit(policyUpdatedEvent(tenantId))
  return nextVersion
}

export function validatePolicyForPublish(policyJson: unknown): void {
  const doc = policyJson as Partial<PolicyDoc>
  for (const subject of doc.subjects ?? []) {
    for (const rule of subject.rules ?? []) {
      if (rule.action === 'warn' && !rule.message?.trim()) {
        throw new Error(`Warning rule ${rule.id} requires a user-facing message before publish`)
      }
    }
  }
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
