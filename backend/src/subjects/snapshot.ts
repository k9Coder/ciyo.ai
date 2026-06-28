import { eq, and, max } from 'drizzle-orm'
import { db } from '../db/client.js'
import { subjects, subjectVersions, type SubjectSnapshot } from '../db/schema.js'
import type { Rule } from '../db/schema.js'
import { rulesClient } from '../http/internal-client.js'
import { getContext } from '../context/request-context.js'

export async function snapshotSubject(
  tenantId: string,
  subjectId: string,
  source: 'pre_ai_apply' | 'rollback',
  conversationMsgId?: string,
): Promise<void> {
  const ctx = getContext()
  if (ctx && !ctx.tenantId) ctx.tenantId = tenantId

  const [subject] = await db
    .select()
    .from(subjects)
    .where(and(eq(subjects.id, subjectId), eq(subjects.tenantId, tenantId)))

  if (!subject) return

  const currentRules = await rulesClient.get<Rule[]>('/', { params: { subjectId } })
    .then(r => r.data)

  const [lastVersionRow] = await db
    .select({ version: max(subjectVersions.version) })
    .from(subjectVersions)
    .where(eq(subjectVersions.subjectId, subjectId))

  const nextVersion = (lastVersionRow?.version ?? 0) + 1

  const snapshot: SubjectSnapshot = {
    name:        subject.name,
    description: subject.description ?? null,
    divisionId:  subject.divisionId ?? null,
    teamId:      subject.teamId ?? null,
    active:      subject.active,
    rules: currentRules.map(r => ({
      id:                  r.id,
      kind:                r.kind,
      keywords:            r.keywords ?? null,
      pattern:             r.pattern ?? null,
      destinations:        r.destinations ?? [],
      destinationGroupIds: r.destinationGroupIds ?? [],
      action:              r.action,
      message:             r.message ?? null,
      reportLevel:         r.reportLevel,
      active:              r.active,
    })),
  }

  await db.insert(subjectVersions).values({
    tenantId,
    subjectId,
    version:           nextVersion,
    snapshot,
    source,
    conversationMsgId: conversationMsgId ?? null,
  })
}
