import { z } from "zod";

// ─── Rule kinds ──────────────────────────────────────────────────────────────

const SeveritySchema = z.enum(["low", "medium", "high", "critical"]);
const ActionSchema = z.enum(["log", "warn", "require_confirmation", "block"]);

const RuleBaseSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string(),
  severity: SeveritySchema,
  action: ActionSchema,
  enabled: z.boolean(),
  tags: z.array(z.string()),
});

export const PatternRuleSchema = RuleBaseSchema.extend({
  kind: z.literal("pattern"),
  /** Regex source string (no delimiters). */
  pattern: z.string().min(1),
  flags: z.string().default(""),
  validator: z.enum(["luhn", "ssn", "iban", "none"]).default("none"),
  /** Whether this rule fires inside code fences, outside, or everywhere. */
  scope: z.enum(["all", "outside_code", "inside_code"]).default("all"),
});

export const EntropyRuleSchema = RuleBaseSchema.extend({
  kind: z.literal("entropy"),
  minTokenLength: z.number().int().positive(),
  minBitsPerChar: z.number().positive(),
});

export const DictionaryRuleSchema = RuleBaseSchema.extend({
  kind: z.literal("dictionary"),
  terms: z.array(z.string()),
  fuzzyTerms: z
    .array(z.object({ term: z.string(), maxDistance: z.number().int().nonnegative() }))
    .optional(),
  caseSensitive: z.boolean(),
});

export const ScoreSignalConfigSchema = z.object({
  id: z.string(),
  description: z.string(),
  points: z.number(),
  enabled: z.boolean(),
  threshold: z.number().optional(),
});

export const ScoreRuleSchema = RuleBaseSchema.extend({
  kind: z.literal("score"),
  signals: z.array(ScoreSignalConfigSchema),
  warnThreshold: z.number().int().min(10).max(100),
  confirmThreshold: z.number().int().min(10).max(100),
});

export const RuleSchema = z.discriminatedUnion("kind", [
  PatternRuleSchema,
  EntropyRuleSchema,
  DictionaryRuleSchema,
  ScoreRuleSchema,
]);

// ─── Full policy ─────────────────────────────────────────────────────────────

export const PolicySchema = z.object({
  version: z.literal(1),
  tenantId: z.string().optional(),
  baseline: z.array(RuleSchema),
  custom: z.array(RuleSchema),
  perSite: z.record(
    z.object({
      enabled: z.boolean(),
      defaultAction: ActionSchema.optional(),
    })
  ),
  allowSendAnywayWithReason: z.boolean(),
  auditRetentionDays: z.number().int().positive(),
});

// ─── Derived TypeScript types (engine-internal) ───────────────────────────────

export type Severity = z.infer<typeof SeveritySchema>;
export type Action = z.infer<typeof ActionSchema>;
export type PatternRule = z.infer<typeof PatternRuleSchema>;
export type EntropyRule = z.infer<typeof EntropyRuleSchema>;
export type DictionaryRule = z.infer<typeof DictionaryRuleSchema>;
export type ScoreSignalConfig = z.infer<typeof ScoreSignalConfigSchema>;
export type ScoreRule = z.infer<typeof ScoreRuleSchema>;
export type Rule = z.infer<typeof RuleSchema>;
export type Policy = z.infer<typeof PolicySchema>;

// ─── Backend API shape (ResolvedPolicy from GET /v1/policy) ──────────────────

export const ResolvedRuleSchema = z.object({
  id:           z.string(),
  kind:         z.enum(["keyword", "pattern", "entropy", "score"]),
  keywords:     z.array(z.string()).nullable(),
  pattern:      z.string().nullable(),
  destinations: z.array(z.string()),
  action:       z.enum(["warn", "block"]),
  message:      z.string().nullable(),
  reportLevel:  z.enum(["none", "minimal", "medium", "rich"]).default("none"),
});

export const ResolvedSubjectSchema = z.object({
  id:    z.string(),
  name:  z.string(),
  rules: z.array(ResolvedRuleSchema),
});

export const SiteConfigSchema = z.object({
  inputSelector:      z.string(),
  sendButtonSelector: z.string(),
});

export const PolicyDocSchema = z.object({
  version:     z.literal(1),
  tenantId:    z.string(),
  subjects:    z.array(ResolvedSubjectSchema),
  siteConfigs: z.record(SiteConfigSchema).default({}),
});

export type ResolvedRule    = z.infer<typeof ResolvedRuleSchema>;
export type ResolvedSubject = z.infer<typeof ResolvedSubjectSchema>;
export type SiteConfigEntry = z.infer<typeof SiteConfigSchema>;
export type PolicyDoc       = z.infer<typeof PolicyDocSchema>;
