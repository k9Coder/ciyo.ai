ALTER TABLE "rules" ADD COLUMN "is_overridable" boolean;

UPDATE "rules"
SET "is_overridable" = CASE WHEN "action" = 'warn' THEN true ELSE false END
WHERE "is_overridable" IS NULL;

ALTER TABLE "rules" ALTER COLUMN "is_overridable" SET NOT NULL;
ALTER TABLE "rules" ALTER COLUMN "is_overridable" SET DEFAULT false;
