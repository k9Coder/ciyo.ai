import { membersClient } from '../http/internal-client.js'
import { getContext } from '../context/request-context.js'
import type { PolicyDoc } from './compiler.js'
import type { ResolvedPolicy } from '../members/resolver.js'

export type { ResolvedRulePolicy, ResolvedSubjectPolicy, ResolvedPolicy } from '../members/resolver.js'

export async function resolveMemberPolicy(
  tenantId: string,
  memberId: string,
  snapshot: PolicyDoc,
): Promise<ResolvedPolicy> {
  const ctx = getContext()
  if (ctx && !ctx.tenantId) ctx.tenantId = tenantId
  const res = await membersClient.post<ResolvedPolicy>('/resolve-policy', { memberId, snapshot })
  return res.data
}
