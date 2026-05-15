export interface PolicyDoc {
  version: 1
  tenantId: string
  baseline: unknown[]
  custom: unknown[]
  perSite: Record<string, unknown>
  allowSendAnywayWithReason: boolean
  auditRetentionDays: number
}

export async function compilePolicy(tenantId: string): Promise<PolicyDoc> {
  return {
    version: 1,
    tenantId,
    baseline: [],
    custom: [],
    perSite: {},
    allowSendAnywayWithReason: false,
    auditRetentionDays: 365,
  }
}
