DO $$ BEGIN
 CREATE TYPE "public"."device_client" AS ENUM('desktop', 'extension');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "extension_auth_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"member_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"code_challenge" text NOT NULL,
	"redirect_uri" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "extension_auth_codes_code_unique" UNIQUE("code")
);
--> statement-breakpoint
ALTER TABLE "device_tokens" ADD COLUMN "client" "device_client" DEFAULT 'desktop' NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "extension_auth_codes" ADD CONSTRAINT "extension_auth_codes_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "extension_auth_codes" ADD CONSTRAINT "extension_auth_codes_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
