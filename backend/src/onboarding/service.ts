import { eq, and, or, desc, sql } from 'drizzle-orm'
import { db } from '../db/client.js'
import {
  tenants, subjects, rules, policies,
  policyTemplates, professionTemplateMap,
} from '../db/schema.js'
import { compilePolicy } from '../policy/compiler.js'
import { publishPolicy } from '../policy/service.js'
import { logger } from '../logger/index.js'

interface TemplateSeedRule {
  kind: 'keyword' | 'pattern' | 'entropy' | 'score'
  keywords?: string[]
  pattern?: string
  action: 'warn' | 'block'
  message?: string
  reportLevel?: 'none' | 'minimal' | 'medium' | 'rich'
}

interface TemplateSubject {
  name: string
  description?: string
  rules: TemplateSeedRule[]
}

interface TemplateContent {
  subjects: TemplateSubject[]
}

export type ApplyTemplateResult =
  | { status: 'created'; policyId: string }
  | { status: 'already_existed'; policyId: string }
  | { status: 'no_policy'; wizardCompleted: true }

export async function applyTemplate(
  tenantId: string,
  profession: string,
  followUpAnswer: string,
): Promise<ApplyTemplateResult> {
  // 'other' profession: no template exists, mark wizard complete
  if (profession === 'other') {
    await db.update(tenants)
      .set({ profession, professionFollowUp: followUpAnswer || null, onboardingWizardCompleted: true })
      .where(eq(tenants.id, tenantId))
    return { status: 'no_policy', wizardCompleted: true }
  }

  // Find matching template: exact match preferred, wildcard '*' fallback
  const [mapRow] = await db
    .select({ templateId: professionTemplateMap.templateId })
    .from(professionTemplateMap)
    .where(
      and(
        eq(professionTemplateMap.profession, profession),
        or(
          eq(professionTemplateMap.followUpAnswer, followUpAnswer),
          eq(professionTemplateMap.followUpAnswer, '*'),
        ),
      )
    )
    .orderBy(sql`CASE WHEN ${professionTemplateMap.followUpAnswer} = ${followUpAnswer} THEN 0 ELSE 1 END`)
    .limit(1)

  if (!mapRow) {
    // No template: treat same as 'other'
    logger.info('No template found for profession/followUpAnswer', { tenantId, profession, followUpAnswer })
    await db.update(tenants)
      .set({ profession, professionFollowUp: followUpAnswer, onboardingWizardCompleted: true })
      .where(eq(tenants.id, tenantId))
    return { status: 'no_policy', wizardCompleted: true }
  }

  // Idempotency: if tenant already has active subjects, return existing policy
  const [existingSubject] = await db
    .select({ id: subjects.id })
    .from(subjects)
    .where(and(eq(subjects.tenantId, tenantId), eq(subjects.active, true)))
    .limit(1)

  if (existingSubject) {
    const [latestPolicy] = await db
      .select({ id: policies.id })
      .from(policies)
      .where(eq(policies.tenantId, tenantId))
      .orderBy(desc(policies.version))
      .limit(1)

    await db.update(tenants)
      .set({ profession, professionFollowUp: followUpAnswer, onboardingWizardCompleted: true })
      .where(eq(tenants.id, tenantId))

    return { status: 'already_existed', policyId: latestPolicy?.id ?? '' }
  }

  // Load template content
  const [template] = await db
    .select({ policyJson: policyTemplates.policyJson })
    .from(policyTemplates)
    .where(eq(policyTemplates.id, mapRow.templateId))

  if (!template) throw new Error(`Template ${mapRow.templateId} not found`)

  const content = template.policyJson as TemplateContent

  // Create subjects and rules in live tables
  for (const subjectDef of content.subjects) {
    const [createdSubject] = await db
      .insert(subjects)
      .values({ tenantId, name: subjectDef.name, description: subjectDef.description ?? null })
      .returning()

    if (!createdSubject) continue

    for (const ruleDef of subjectDef.rules) {
      await db.insert(rules).values({
        tenantId,
        subjectId: createdSubject.id,
        kind:        ruleDef.kind,
        keywords:    ruleDef.keywords ?? null,
        pattern:     ruleDef.pattern ?? null,
        action:      ruleDef.action,
        message:     ruleDef.message ?? null,
        reportLevel: ruleDef.reportLevel ?? 'none',
      })
    }
  }

  // Compile and publish policy so the extension picks it up immediately
  const policyDoc = await compilePolicy(tenantId)
  await publishPolicy(tenantId, policyDoc)

  // Get the published policy ID
  const [newPolicy] = await db
    .select({ id: policies.id })
    .from(policies)
    .where(eq(policies.tenantId, tenantId))
    .orderBy(desc(policies.version))
    .limit(1)

  // Mark wizard complete
  await db.update(tenants)
    .set({ profession, professionFollowUp: followUpAnswer, onboardingWizardCompleted: true })
    .where(eq(tenants.id, tenantId))

  return { status: 'created', policyId: newPolicy?.id ?? '' }
}

export async function completeWizardSkip(tenantId: string): Promise<void> {
  await db.update(tenants)
    .set({ onboardingWizardCompleted: true })
    .where(eq(tenants.id, tenantId))
}
