import { and, eq, inArray } from 'drizzle-orm'
import { db } from '../db/client.js'
import { destinationGroups } from '../db/schema.js'

const HOSTNAME_RE = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])$/i

export function normalizeDestination(value: string): string {
  const trimmed = value.trim().toLowerCase()
  if (!trimmed) throw new Error('Destination hostname cannot be blank')
  if (value !== value.trim() || /\s/.test(value)) throw new Error(`Invalid destination "${value}": remove whitespace and use hostname only`)
  if (trimmed.includes('://') || trimmed.includes('/') || trimmed.includes(':') || trimmed.includes('*')) {
    throw new Error(`Invalid destination "${value}": use hostname only, without scheme, port, path, or wildcard`)
  }
  if (!HOSTNAME_RE.test(trimmed) || trimmed.includes('..')) {
    throw new Error(`Invalid destination "${value}": hostname is not valid`)
  }
  return trimmed
}

export function normalizeDestinations(values: string[] | null | undefined): string[] {
  return [...new Set((values ?? []).map(normalizeDestination))]
}

export function defaultIsOverridable(action: 'warn' | 'block'): boolean {
  return action === 'warn'
}

export function requireRuleMessage(action: 'warn' | 'block', message: string | null | undefined, strict = false): string | null {
  const normalized = message?.trim() || null
  if (strict && action === 'warn' && !normalized) {
    throw new Error('Warning rules require a user-facing message')
  }
  return normalized
}

export async function assertDestinationGroupsBelongToTenant(tenantId: string, ids: string[] | null | undefined): Promise<string[]> {
  const uniqueIds = [...new Set(ids ?? [])]
  if (uniqueIds.length === 0) return []

  const rows = await db
    .select({ id: destinationGroups.id })
    .from(destinationGroups)
    .where(and(eq(destinationGroups.tenantId, tenantId), inArray(destinationGroups.id, uniqueIds)))
  const ownedIds = new Set(rows.map(row => row.id))
  const missing = uniqueIds.filter(id => !ownedIds.has(id))
  if (missing.length > 0) {
    throw new Error('Destination group not found for this tenant')
  }
  return uniqueIds
}
