CREATE TABLE IF NOT EXISTS "matters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"client_name" text NOT NULL,
	"matter_name" text,
	"matter_number" text,
	"opposing_parties" text[] DEFAULT '{}',
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "policies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"policy_json" jsonb NOT NULL,
	"published_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "policies_tenant_id_version_unique" UNIQUE("tenant_id","version")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tenants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"org_token_hash" text NOT NULL,
	"admin_token_hash" text NOT NULL,
	"payment_provider" text NOT NULL,
	"external_sub_id" text NOT NULL,
	"subscription_status" text DEFAULT 'active' NOT NULL,
	"plan" text DEFAULT 'pro' NOT NULL,
	"grace_period_days" integer DEFAULT 7 NOT NULL,
	"grace_period_ends_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tenants_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "matters" ADD CONSTRAINT "matters_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "policies" ADD CONSTRAINT "policies_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "matters_tenant_id_active_index" ON "matters" ("tenant_id","active");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "policies_tenant_id_version_index" ON "policies" ("tenant_id","version");