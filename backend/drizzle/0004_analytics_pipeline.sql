CREATE TYPE "report_level" AS ENUM ('none', 'minimal', 'medium', 'rich');

ALTER TABLE "rules" ADD COLUMN "report_level" "report_level" NOT NULL DEFAULT 'none';

CREATE TABLE "events" (
  "id"           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id"    uuid NOT NULL REFERENCES "tenants"("id"),
  "rule_id"      uuid NOT NULL REFERENCES "rules"("id"),
  "member_id"    uuid REFERENCES "members"("id"),
  "action"       "rule_action" NOT NULL,
  "site_url"     text NOT NULL,
  "matched_term" text,
  "occurred_at"  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ON "events"("tenant_id", "occurred_at");
CREATE INDEX ON "events"("rule_id");
