CREATE TABLE "scans" (
  "id"          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id"   uuid NOT NULL REFERENCES "tenants"("id"),
  "member_id"   uuid REFERENCES "members"("id"),
  "occurred_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ON "scans"("tenant_id", "occurred_at");
