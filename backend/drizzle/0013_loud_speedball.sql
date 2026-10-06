DO $$ BEGIN
 CREATE TYPE "public"."shadow_verdict_kind" AS ENUM('keyword', 'pattern', 'entropy', 'score');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."shadow_verdict_outcome" AS ENUM('match', 'no_match');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "shadow_verdicts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"rule_id" uuid NOT NULL,
	"kind" "shadow_verdict_kind" NOT NULL,
	"verdict" "shadow_verdict_outcome" NOT NULL,
	"confidence" numeric(4, 3) NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "shadow_verdicts" ADD CONSTRAINT "shadow_verdicts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "shadow_verdicts_tenant_id_occurred_at_index" ON "shadow_verdicts" ("tenant_id","occurred_at");