import {
  pgTable, pgEnum, uuid, text, boolean, integer,
  timestamp, jsonb, index, unique, primaryKey,
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'

// ── Enums ────────────────────────────────────────────────────────────────────
export const memberRoleEnum = pgEnum('member_role', ['super_admin', 'division_admin', 'member'])
export const ruleKindEnum   = pgEnum('rule_kind',   ['keyword', 'pattern', 'entropy', 'score'])
export const ruleActionEnum = pgEnum('rule_action', ['warn', 'block'])

// ── Tenants ──────────────────────────────────────────────────────────────────
export const tenants = pgTable('tenants', {
  id:                 uuid('id').primaryKey().defaultRandom(),
  name:               text('name').notNull(),
  slug:               text('slug').notNull(),
  orgTokenHash:       text('org_token_hash').notNull(),
  adminTokenHash:     text('admin_token_hash').notNull(),
  paymentProvider:    text('payment_provider').notNull(),
  externalSubId:      text('external_sub_id').notNull(),
  subscriptionStatus: text('subscription_status').notNull().default('active'),
  plan:               text('plan').notNull().default('pro'),
  gracePeriodDays:    integer('grace_period_days').notNull().default(7),
  gracePeriodEndsAt:  timestamp('grace_period_ends_at', { withTimezone: true }),
  createdAt:          timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  slugUniq: unique().on(t.slug),
}))

// ── Policies (versioned snapshots — unchanged) ────────────────────────────────
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
export const members = pgTable('members', {
  id:              uuid('id').primaryKey().defaultRandom(),
  tenantId:        uuid('tenant_id').notNull().references(() => tenants.id),
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

// ── Subjects (replaces matters) ───────────────────────────────────────────────
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

// ── Types ─────────────────────────────────────────────────────────────────────
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
