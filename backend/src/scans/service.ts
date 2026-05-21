import { db } from '../db/client.js'
import { scans } from '../db/schema.js'

export async function recordScan(tenantId: string, memberId: string | null): Promise<void> {
  await db.insert(scans).values({ tenantId, memberId })
}
