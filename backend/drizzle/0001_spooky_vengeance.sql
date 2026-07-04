CREATE TABLE IF NOT EXISTS "policy_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"policy_json" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "profession_template_map" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profession" text NOT NULL,
	"follow_up_answer" text NOT NULL,
	"template_id" uuid NOT NULL,
	CONSTRAINT "profession_template_map_profession_follow_up_answer_unique" UNIQUE("profession","follow_up_answer")
);
--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "profession" text;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "profession_follow_up" text;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "onboarding_wizard_completed" boolean DEFAULT false NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "profession_template_map" ADD CONSTRAINT "profession_template_map_template_id_policy_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."policy_templates"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "profession_template_map_profession_index" ON "profession_template_map" ("profession");