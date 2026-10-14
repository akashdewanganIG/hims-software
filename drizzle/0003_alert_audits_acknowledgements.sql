CREATE TYPE "public"."AlertAudience" AS ENUM('ALL', 'DEPARTMENT', 'ROLE', 'STAFF');--> statement-breakpoint
ALTER TABLE "alerts" ADD COLUMN "audience" "AlertAudience";--> statement-breakpoint
ALTER TABLE "alerts" ADD COLUMN "audience_id" text;--> statement-breakpoint
ALTER TABLE "alerts" ADD COLUMN "audience_label" text DEFAULT 'Previously selected recipients' NOT NULL;--> statement-breakpoint
ALTER TABLE "alerts" ADD COLUMN "acknowledgement_required" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "alerts" ADD COLUMN "acknowledgements" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint

-- Preserve the targeting intent of the standard demo alerts already stored.
UPDATE "alerts"
SET "audience" = 'ALL',
    "audience_id" = NULL,
    "audience_label" = 'All active staff'
WHERE "subject" = 'Hospital safety drill at 4 PM';--> statement-breakpoint

UPDATE "alerts"
SET "audience" = 'ROLE',
    "audience_id" = 'NURSE',
    "audience_label" = 'Staff role: Nurse',
    "acknowledgement_required" = true
WHERE "subject" = 'Review isolation-bed readiness';--> statement-breakpoint

UPDATE "alerts" AS "a"
SET "audience" = 'DEPARTMENT',
    "audience_id" = "s"."department_id",
    "audience_label" = 'Department: ' || "d"."name"
FROM "staff" AS "s"
JOIN "departments" AS "d" ON "d"."id" = "s"."department_id"
WHERE "a"."subject" = 'Chemistry analyser maintenance window'
  AND "s"."id" = "a"."recipient_ids"[1];--> statement-breakpoint

UPDATE "alerts" AS "a"
SET "audience" = 'STAFF',
    "audience_id" = "s"."id",
    "audience_label" = 'Staff member: ' || "s"."first_name" || ' ' || "s"."last_name",
    "acknowledgement_required" = true
FROM "staff" AS "s"
WHERE "a"."subject" = 'Confirm evening isolation-room handover'
  AND "s"."id" = "a"."recipient_ids"[1];
