import {
  pgTable, uuid, text, integer, boolean,
  timestamp, jsonb, index, unique,
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'

export const tenants = pgTable('tenants', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  slug: text('slug').notNull(),
  orgTokenHash: text('org_token_hash').notNull(),
  adminTokenHash: text('admin_token_hash').notNull(),
  paymentProvider: text('payment_provider').notNull(),
  externalSubId: text('external_sub_id').notNull(),
  subscriptionStatus: text('subscription_status').notNull().default('active'),
  plan: text('plan').notNull().default('pro'),
  gracePeriodDays: integer('grace_period_days').notNull().default(7),
  gracePeriodEndsAt: timestamp('grace_period_ends_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  slugUniq: unique().on(t.slug),
}))

export const policies = pgTable('policies', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  version: integer('version').notNull(),
  policyJson: jsonb('policy_json').notNull(),
  publishedAt: timestamp('published_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  tenantVersionUniq: unique().on(t.tenantId, t.version),
  versionIdx: index().on(t.tenantId, t.version),
}))

export const matters = pgTable('matters', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  clientName: text('client_name').notNull(),
  matterName: text('matter_name'),
  matterNumber: text('matter_number'),
  opposingParties: text('opposing_parties').array().default(sql`'{}'`),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  tenantActiveIdx: index().on(t.tenantId, t.active),
}))

export type Tenant = typeof tenants.$inferSelect
export type NewTenant = typeof tenants.$inferInsert
export type PolicyRow = typeof policies.$inferSelect
export type Matter = typeof matters.$inferSelect
export type NewMatter = typeof matters.$inferInsert
