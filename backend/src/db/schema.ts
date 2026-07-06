import {
  pgTable, pgEnum, uuid, text, boolean, integer,
  timestamp, jsonb, index, unique, primaryKey,
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'

// ── Enums ────────────────────────────────────────────────────────────────────
export const memberRoleEnum  = pgEnum('member_role',  ['super_admin', 'division_admin', 'member'])
export const ruleKindEnum    = pgEnum('rule_kind',    ['keyword', 'pattern', 'entropy', 'score'])
export const ruleActionEnum  = pgEnum('rule_action',  ['warn', 'block'])
export const reportLevelEnum = pgEnum('report_level', ['none', 'minimal', 'medium', 'rich'])
export const failModeEnum    = pgEnum('fail_mode',    ['open', 'closed'])

// ── Users (global identity, not tenant-scoped) ────────────────────────────────
export const users = pgTable('users', {
  id:              uuid('id').primaryKey().defaultRandom(),
  clerkId:         text('clerk_id').unique(),          // nullable — nulled on Clerk account deletion
  email:           text('email').notNull().unique(),
  firstName:       text('first_name'),
  lastName:        text('last_name'),
  avatarUrl:       text('avatar_url'),
  isPlatformAdmin: boolean('is_platform_admin').notNull().default(false),
  createdAt:       timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:       timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

// ── Tenants ──────────────────────────────────────────────────────────────────
export const tenants = pgTable('tenants', {
  id:                        uuid('id').primaryKey().defaultRandom(),
  name:                      text('name').notNull(),
  orgTokenHash:              text('org_token_hash').notNull(),
  adminTokenHash:            text('admin_token_hash').notNull(),
  paymentProvider:           text('payment_provider'),            // nullable — free tier has no provider
  externalSubId:             text('external_sub_id'),             // nullable — free tier has no sub
  subscriptionStatus:        text('subscription_status').notNull().default('active'),
  plan:                      text('plan').notNull().default('free'),
  seatCount:                 integer('seat_count').notNull().default(1),
  trialEndsAt:               timestamp('trial_ends_at', { withTimezone: true }),
  stripeCustomerId:          text('stripe_customer_id'),
  gracePeriodDays:           integer('grace_period_days').notNull().default(7),
  gracePeriodEndsAt:         timestamp('grace_period_ends_at', { withTimezone: true }),
  profession:                text('profession'),
  professionFollowUp:        text('profession_follow_up'),
  onboardingWizardCompleted: boolean('onboarding_wizard_completed').notNull().default(false),
  failMode:                  failModeEnum('fail_mode').notNull().default('open'),
  createdAt:                 timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

// ── Policies (versioned snapshots) ───────────────────────────────────────────
export const policies = pgTable('policies', {
  id:          uuid('id').primaryKey().defaultRandom(),
  tenantId:    uuid('tenant_id').notNull().references(() => tenants.id),
  version:     integer('version').notNull(),
  policyJson:  jsonb('policy_json').notNull(),
  publishedAt: timestamp('published_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  tenantVersionUniq: unique().on(t.tenantId, t.version),
  versionIdx:        index().on(t.tenantId, t.version),
}))

// ── Divisions ────────────────────────────────────────────────────────────────
export const divisions = pgTable('divisions', {
  id:        uuid('id').primaryKey().defaultRandom(),
  tenantId:  uuid('tenant_id').notNull().references(() => tenants.id),
  name:      text('name').notNull(),
  slug:      text('slug').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  tenantSlugUniq: unique().on(t.tenantId, t.slug),
}))

// ── Teams ────────────────────────────────────────────────────────────────────
export const teams = pgTable('teams', {
  id:         uuid('id').primaryKey().defaultRandom(),
  tenantId:   uuid('tenant_id').notNull().references(() => tenants.id),
  divisionId: uuid('division_id').notNull().references(() => divisions.id),
  name:       text('name').notNull(),
  slug:       text('slug').notNull(),
  createdAt:  timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  divisionSlugUniq: unique().on(t.divisionId, t.slug),
}))

// ── Members ──────────────────────────────────────────────────────────────────
// userId is nullable for pre-enrolled members (admin added by email before sign-up).
// Stamped by the user.created webhook once the user creates a Clerk account.
export const members = pgTable('members', {
  id:              uuid('id').primaryKey().defaultRandom(),
  tenantId:        uuid('tenant_id').notNull().references(() => tenants.id),
  userId:          uuid('user_id').references(() => users.id),
  email:           text('email').notNull(),
  displayName:     text('display_name'),
  role:            memberRoleEnum('role').notNull().default('member'),
  adminDivisionId: uuid('admin_division_id').references(() => divisions.id),
  createdAt:       timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  tenantEmailUniq: unique().on(t.tenantId, t.email),
}))

// ── Member ↔ Team (many-to-many) ─────────────────────────────────────────────
export const memberTeams = pgTable('member_teams', {
  memberId: uuid('member_id').notNull().references(() => members.id),
  teamId:   uuid('team_id').notNull().references(() => teams.id),
}, (t) => ({
  pk: primaryKey({ columns: [t.memberId, t.teamId] }),
}))

// ── Subjects ──────────────────────────────────────────────────────────────────
// Scope: teamId set = team-scoped; divisionId set + teamId null = division-scoped; both null = global
export const subjects = pgTable('subjects', {
  id:          uuid('id').primaryKey().defaultRandom(),
  tenantId:    uuid('tenant_id').notNull().references(() => tenants.id),
  divisionId:  uuid('division_id').references(() => divisions.id),
  teamId:      uuid('team_id').references(() => teams.id),
  name:        text('name').notNull(),
  description: text('description'),
  active:      boolean('active').notNull().default(true),
  createdAt:   timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  tenantActiveIdx: index().on(t.tenantId, t.active),
}))

// ── Rules ─────────────────────────────────────────────────────────────────────
export const rules = pgTable('rules', {
  id:                  uuid('id').primaryKey().defaultRandom(),
  tenantId:            uuid('tenant_id').notNull().references(() => tenants.id),
  subjectId:           uuid('subject_id').notNull().references(() => subjects.id),
  kind:                ruleKindEnum('kind').notNull(),
  keywords:            text('keywords').array(),
  pattern:             text('pattern'),
  destinations:        text('destinations').array().default(sql`'{}'`),
  destinationGroupIds: uuid('destination_group_ids').array().default(sql`'{}'`),
  action:              ruleActionEnum('action').notNull(),
  message:             text('message'),
  active:              boolean('active').notNull().default(true),
  reportLevel:         reportLevelEnum('report_level').notNull().default('none'),
  createdAt:           timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  subjectIdx: index().on(t.subjectId),
}))

// ── Destination Groups ────────────────────────────────────────────────────────
export const destinationGroups = pgTable('destination_groups', {
  id:         uuid('id').primaryKey().defaultRandom(),
  tenantId:   uuid('tenant_id').notNull().references(() => tenants.id),
  divisionId: uuid('division_id').references(() => divisions.id),
  teamId:     uuid('team_id').references(() => teams.id),
  name:       text('name').notNull(),
  domains:    text('domains').array().notNull().default(sql`'{}'`),
  createdAt:  timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  tenantIdx: index().on(t.tenantId),
}))

// ── Site Configs ──────────────────────────────────────────────────────────────
export const siteConfigs = pgTable('site_configs', {
  id:                  uuid('id').primaryKey().defaultRandom(),
  tenantId:            uuid('tenant_id').notNull().references(() => tenants.id),
  domain:              text('domain').notNull(),
  inputSelector:       text('input_selector').notNull(),
  sendButtonSelector:  text('send_button_selector').notNull(),
  createdAt:           timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  tenantDomainUniq: unique().on(t.tenantId, t.domain),
}))

// ── Events (analytics) ───────────────────────────────────────────────────────
export const events = pgTable('events', {
  id:          uuid('id').primaryKey().defaultRandom(),
  tenantId:    uuid('tenant_id').notNull().references(() => tenants.id),
  ruleId:      uuid('rule_id').notNull().references(() => rules.id),
  memberId:    uuid('member_id').references(() => members.id),
  action:      ruleActionEnum('action').notNull(),
  siteUrl:     text('site_url').notNull(),
  matchedTerm: text('matched_term'),
  occurredAt:  timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  tenantTimeIdx: index().on(t.tenantId, t.occurredAt),
  ruleIdx:       index().on(t.ruleId),
}))

// ── Scans ─────────────────────────────────────────────────────────────────────
export const scans = pgTable('scans', {
  id:         uuid('id').primaryKey().defaultRandom(),
  tenantId:   uuid('tenant_id').notNull().references(() => tenants.id),
  memberId:   uuid('member_id').references(() => members.id),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  tenantTimeIdx: index().on(t.tenantId, t.occurredAt),
}))

// ── Enforcement signals ───────────────────────────────────────────────────────
// Degraded-enforcement telemetry from the extension. Never carries prompt
// content — only host + reason. Powers the console "protection degraded" banner.
export const enforcementReasonEnum = pgEnum('enforcement_reason', [
  'decision_timeout',
  'bridge_error',
  'adapter_miss',
])

export const enforcementSignals = pgTable('enforcement_signals', {
  id:         uuid('id').primaryKey().defaultRandom(),
  tenantId:   uuid('tenant_id').notNull().references(() => tenants.id),
  memberId:   uuid('member_id').references(() => members.id),
  hostname:   text('hostname').notNull(),
  reason:     enforcementReasonEnum('reason').notNull(),
  extVersion: text('ext_version'),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  tenantTimeIdx: index().on(t.tenantId, t.occurredAt),
}))

// ── Chat Sessions ─────────────────────────────────────────────────────────────
export const chatMessageRoleEnum = pgEnum('chat_message_role', ['user', 'assistant'])

export const chatSessions = pgTable('chat_sessions', {
  id:        uuid('id').primaryKey().defaultRandom(),
  tenantId:  uuid('tenant_id').notNull().references(() => tenants.id),
  memberId:  uuid('member_id').references(() => members.id),
  title:     text('title').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  tenantIdx: index().on(t.tenantId),
}))

// ── Chat Messages ─────────────────────────────────────────────────────────────
export const chatMessages = pgTable('chat_messages', {
  id:          uuid('id').primaryKey().defaultRandom(),
  sessionId:   uuid('session_id').notNull().references(() => chatSessions.id),
  role:        chatMessageRoleEnum('role').notNull(),
  content:     text('content').notNull(),
  actionsJson: jsonb('actions_json'),
  appliedAt:   timestamp('applied_at', { withTimezone: true }),
  createdAt:   timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  sessionIdx: index().on(t.sessionId),
}))

// ── Subject Snapshot (stored in subject_versions.snapshot) ───────────────────
export interface SubjectSnapshot {
  name:        string
  description: string | null
  divisionId:  string | null
  teamId:      string | null
  active:      boolean
  rules: Array<{
    id:                  string
    kind:                'keyword' | 'pattern' | 'entropy' | 'score'
    keywords:            string[] | null
    pattern:             string | null
    destinations:        string[]
    destinationGroupIds: string[]
    action:              'warn' | 'block'
    message:             string | null
    reportLevel:         'none' | 'minimal' | 'medium' | 'rich'
    active:              boolean
  }>
}

// ── Subject Versions ──────────────────────────────────────────────────────────
// One row per subject per version snapshot. Source 'pre_ai_apply' is taken
// BEFORE executeActions runs — restoring it undoes what the AI message did.
export const subjectVersionSourceEnum = pgEnum('subject_version_source', [
  'pre_ai_apply',
  'rollback',
])

export const subjectVersions = pgTable('subject_versions', {
  id:                uuid('id').primaryKey().defaultRandom(),
  tenantId:          uuid('tenant_id').notNull().references(() => tenants.id),
  subjectId:         uuid('subject_id').notNull().references(() => subjects.id, { onDelete: 'cascade' }),
  version:           integer('version').notNull(),
  snapshot:          jsonb('snapshot').notNull().$type<SubjectSnapshot>(),
  source:            subjectVersionSourceEnum('source').notNull(),
  conversationMsgId: uuid('conversation_msg_id').references(() => chatMessages.id, { onDelete: 'set null' }),
  createdAt:         timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  subjectVersionUniq: unique().on(t.subjectId, t.version),
  conversationMsgIdx: index().on(t.conversationMsgId),
}))

// ── Invites ───────────────────────────────────────────────────────────────────
export const invites = pgTable('invites', {
  id:           uuid('id').primaryKey().defaultRandom(),
  tenantId:     uuid('tenant_id').notNull().references(() => tenants.id),
  token:        text('token').notNull(),
  email:        text('email'),                              // null = open link
  role:         memberRoleEnum('role').notNull().default('member'),
  createdById:  uuid('created_by_id').references(() => members.id),
  expiresAt:    timestamp('expires_at', { withTimezone: true }).notNull(),
  usedAt:       timestamp('used_at', { withTimezone: true }),
  usedByUserId: uuid('used_by_user_id').references(() => users.id),
  createdAt:    timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  tokenUniq: unique().on(t.token),
  tenantIdx: index().on(t.tenantId),
}))

// ── Policy Templates (onboarding wizard) ─────────────────────────────────────
// policy_json stores TemplateContent: { subjects: [{ name, description, rules: [...] }] }
// When applied, subjects+rules are created in the live tables and policy is compiled+published.
export const policyTemplates = pgTable('policy_templates', {
  id:          uuid('id').primaryKey().defaultRandom(),
  name:        text('name').notNull(),
  description: text('description'),
  policyJson:  jsonb('policy_json').notNull(),
  createdAt:   timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

// ── Profession → Template Map ─────────────────────────────────────────────────
// '*' as follow_up_answer is a wildcard — matches any answer for that profession.
// UNIQUE on (profession, follow_up_answer) prevents duplicate mappings.
export const professionTemplateMap = pgTable('profession_template_map', {
  id:             uuid('id').primaryKey().defaultRandom(),
  profession:     text('profession').notNull(),
  followUpAnswer: text('follow_up_answer').notNull(),
  templateId:     uuid('template_id').notNull().references(() => policyTemplates.id),
}, (t) => ({
  professionAnswerUniq: unique().on(t.profession, t.followUpAnswer),
  professionIdx:        index().on(t.profession),
}))

// ── Types ─────────────────────────────────────────────────────────────────────
export type User       = typeof users.$inferSelect
export type NewUser    = typeof users.$inferInsert

export type Tenant    = typeof tenants.$inferSelect
export type NewTenant = typeof tenants.$inferInsert
export type PolicyRow = typeof policies.$inferSelect

export type Division    = typeof divisions.$inferSelect
export type NewDivision = typeof divisions.$inferInsert

export type Team    = typeof teams.$inferSelect
export type NewTeam = typeof teams.$inferInsert

export type Member    = typeof members.$inferSelect
export type NewMember = typeof members.$inferInsert

export type Subject    = typeof subjects.$inferSelect
export type NewSubject = typeof subjects.$inferInsert

export type Rule    = typeof rules.$inferSelect
export type NewRule = typeof rules.$inferInsert

export type DestinationGroup    = typeof destinationGroups.$inferSelect
export type NewDestinationGroup = typeof destinationGroups.$inferInsert

export type SiteConfig    = typeof siteConfigs.$inferSelect
export type NewSiteConfig = typeof siteConfigs.$inferInsert

export type Event    = typeof events.$inferSelect
export type NewEvent = typeof events.$inferInsert

export type Scan    = typeof scans.$inferSelect
export type NewScan = typeof scans.$inferInsert

export type ChatSession    = typeof chatSessions.$inferSelect
export type NewChatSession = typeof chatSessions.$inferInsert
export type ChatMessage    = typeof chatMessages.$inferSelect
export type NewChatMessage = typeof chatMessages.$inferInsert

export type Invite    = typeof invites.$inferSelect
export type NewInvite = typeof invites.$inferInsert

export type SubjectVersion    = typeof subjectVersions.$inferSelect
export type NewSubjectVersion = typeof subjectVersions.$inferInsert

export type PolicyTemplate    = typeof policyTemplates.$inferSelect
export type NewPolicyTemplate = typeof policyTemplates.$inferInsert

export type ProfessionTemplateMap    = typeof professionTemplateMap.$inferSelect
export type NewProfessionTemplateMap = typeof professionTemplateMap.$inferInsert
