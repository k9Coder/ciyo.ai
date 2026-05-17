import { and, eq } from 'drizzle-orm'
import { db } from '../db/client.js'
import { siteConfigs, type SiteConfig, type NewSiteConfig } from '../db/schema.js'

export async function listSiteConfigs(tenantId: string): Promise<SiteConfig[]> {
  return db.select().from(siteConfigs).where(eq(siteConfigs.tenantId, tenantId))
}

export async function createSiteConfig(
  tenantId: string,
  data: Pick<NewSiteConfig, 'domain' | 'inputSelector' | 'sendButtonSelector'>
): Promise<SiteConfig> {
  const [row] = await db.insert(siteConfigs).values({ tenantId, ...data }).returning()
  return row!
}

export async function updateSiteConfig(
  tenantId: string,
  domain: string,
  data: Partial<Pick<NewSiteConfig, 'inputSelector' | 'sendButtonSelector'>>
): Promise<SiteConfig | null> {
  const [row] = await db.update(siteConfigs)
    .set(data)
    .where(and(eq(siteConfigs.tenantId, tenantId), eq(siteConfigs.domain, domain)))
    .returning()
  return row ?? null
}

export async function deleteSiteConfig(tenantId: string, domain: string): Promise<void> {
  await db.delete(siteConfigs)
    .where(and(eq(siteConfigs.tenantId, tenantId), eq(siteConfigs.domain, domain)))
}
