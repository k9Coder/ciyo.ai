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

export const RuleSchema = z.discriminatedUnion("kind", [
  PatternRuleSchema,
  EntropyRuleSchema,
  DictionaryRuleSchema,
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

// ─── Derived TypeScript types ─────────────────────────────────────────────────

export type Severity = z.infer<typeof SeveritySchema>;
export type Action = z.infer<typeof ActionSchema>;
export type PatternRule = z.infer<typeof PatternRuleSchema>;
export type EntropyRule = z.infer<typeof EntropyRuleSchema>;
export type DictionaryRule = z.infer<typeof DictionaryRuleSchema>;
export type Rule = z.infer<typeof RuleSchema>;
export type Policy = z.infer<typeof PolicySchema>;
