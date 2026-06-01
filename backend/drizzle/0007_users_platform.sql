-- Add users table (global identity, not tenant-scoped)
CREATE TABLE "users" (
  "id"               uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "clerk_id"         text UNIQUE,
  "email"            text NOT NULL UNIQUE,
  "first_name"       text,
  "last_name"        text,
  "avatar_url"       text,
  "is_platform_admin" boolean NOT NULL DEFAULT false,
  "created_at"       timestamptz NOT NULL DEFAULT now(),
  "updated_at"       timestamptz NOT NULL DEFAULT now()
);

-- Remove Clerk org coupling from tenants
ALTER TABLE "tenants" DROP CONSTRAINT IF EXISTS "tenants_clerk_org_id_unique";
ALTER TABLE "tenants" DROP COLUMN IF EXISTS "clerk_org_id";

-- Add userId FK to members, remove Clerk-owned identity columns
ALTER TABLE "members" ADD COLUMN "user_id" uuid REFERENCES "users"("id");
ALTER TABLE "members" DROP CONSTRAINT IF EXISTS "members_clerk_id_unique";
ALTER TABLE "members" DROP COLUMN IF EXISTS "clerk_id";
ALTER TABLE "members" DROP COLUMN IF EXISTS "first_name";
ALTER TABLE "members" DROP COLUMN IF EXISTS "last_name";
ALTER TABLE "members" DROP COLUMN IF EXISTS "avatar_url";
