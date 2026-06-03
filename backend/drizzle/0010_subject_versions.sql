CREATE TYPE "subject_version_source" AS ENUM('pre_ai_apply', 'rollback');

CREATE TABLE IF NOT EXISTS "subject_versions" (
  "id"                  uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id"           uuid NOT NULL REFERENCES "tenants"("id"),
  "subject_id"          uuid NOT NULL REFERENCES "subjects"("id") ON DELETE CASCADE,
  "version"             integer NOT NULL,
  "snapshot"            jsonb NOT NULL,
  "source"              "subject_version_source" NOT NULL,
  "conversation_msg_id" uuid REFERENCES "chat_messages"("id") ON DELETE SET NULL,
  "created_at"          timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "subject_versions_subject_id_version_unique" UNIQUE("subject_id", "version")
);

CREATE INDEX IF NOT EXISTS "subject_versions_conversation_msg_idx" ON "subject_versions" ("conversation_msg_id");
