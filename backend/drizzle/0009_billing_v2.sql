-- Make external_sub_id nullable (free tier has no payment)
ALTER TABLE "tenants" ALTER COLUMN "external_sub_id" DROP NOT NULL;

-- Make payment_provider nullable (free tier has no provider)
ALTER TABLE "tenants" ALTER COLUMN "payment_provider" DROP NOT NULL;

-- Add new billing columns
ALTER TABLE "tenants"
  ADD COLUMN IF NOT EXISTS "seat_count"         integer   NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "trial_ends_at"       timestamptz,
  ADD COLUMN IF NOT EXISTS "stripe_customer_id"  text;

-- Migrate existing tenants that were on 'pro' plan to 'business'
UPDATE "tenants" SET "plan" = 'business' WHERE "plan" = 'pro';

-- Change the column default for new tenants
ALTER TABLE "tenants" ALTER COLUMN "plan" SET DEFAULT 'free';
