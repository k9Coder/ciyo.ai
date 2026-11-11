DO $$ BEGIN
 CREATE TYPE "public"."judge_shadow_primary_action" AS ENUM('block', 'warn', 'log', 'none');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."judge_shadow_rule_kind" AS ENUM('keyword', 'pattern', 'judge_prompt');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."judge_shadow_secondary_verdict" AS ENUM('block', 'warn', 'ok', 'pending', 'skipped', 'error', 'not_applicable');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."judge_shadow_surface" AS ENUM('extension', 'desktop');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "judge_shadow_checks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"member_id" uuid,
	"check_id" uuid NOT NULL,
	"surface" "judge_shadow_surface" NOT NULL,
	"rule_id" uuid NOT NULL,
	"rule_kind" "judge_shadow_rule_kind" NOT NULL,
	"primary_action" "judge_shadow_primary_action" NOT NULL,
	"secondary_verdict" "judge_shadow_secondary_verdict" NOT NULL,
	"fast_score" numeric(4, 3),
	"second_score" numeric(4, 3),
	"span_start" integer,
	"span_end" integer,
	"message_chars" integer NOT NULL,
	"windows" smallint NOT NULL,
	"latency_ms" integer NOT NULL,
	"model_version" text NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "judge_shadow_checks" ADD CONSTRAINT "judge_shadow_checks_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "judge_shadow_checks" ADD CONSTRAINT "judge_shadow_checks_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "judge_shadow_checks_tenant_id_occurred_at_index" ON "judge_shadow_checks" ("tenant_id","occurred_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "judge_shadow_checks_check_id_index" ON "judge_shadow_checks" ("check_id");