CREATE TYPE "fail_mode" AS ENUM('open', 'closed');--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "fail_mode" "fail_mode" NOT NULL DEFAULT 'open';
