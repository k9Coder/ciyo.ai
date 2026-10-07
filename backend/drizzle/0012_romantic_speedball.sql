ALTER TYPE "rule_kind" ADD VALUE 'judge_prompt';--> statement-breakpoint
ALTER TABLE "rules" ADD COLUMN "prompt" text;