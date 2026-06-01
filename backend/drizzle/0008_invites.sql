CREATE TABLE "invites" (
  "id"              uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id"       uuid NOT NULL REFERENCES "tenants"("id"),
  "token"           text NOT NULL,
  "email"           text,
  "role"            "member_role" NOT NULL DEFAULT 'member',
  "created_by_id"   uuid REFERENCES "members"("id"),
  "expires_at"      timestamptz NOT NULL,
  "used_at"         timestamptz,
  "used_by_user_id" uuid REFERENCES "users"("id"),
  "created_at"      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "invites_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE INDEX ON "invites" ("tenant_id");
