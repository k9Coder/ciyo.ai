ALTER TABLE "events" DROP CONSTRAINT "events_rule_id_rules_id_fk";
--> statement-breakpoint
ALTER TABLE "events" ALTER COLUMN "rule_id" DROP NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "events" ADD CONSTRAINT "events_rule_id_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."rules"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
