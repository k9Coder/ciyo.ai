import { eq, sql } from 'drizzle-orm'
import { db } from '../db/client.js'
import { tenants, members } from '../db/schema.js'

export interface TenantSummary {
  id:          string
  name:        string
  plan:        string
  memberCount: number
  createdAt:   Date
}

export async function listAllTenants(): Promise<TenantSummary[]> {
  const rows = await db
    .select({
      id:          tenants.id,
      name:        tenants.name,
      plan:        tenants.plan,
      createdAt:   tenants.createdAt,
      memberCount: sql<number>`count(${members.id})::int`,
    })
    .from(tenants)
    .leftJoin(members, eq(members.tenantId, tenants.id))
    .groupBy(tenants.id)
  return rows
}
