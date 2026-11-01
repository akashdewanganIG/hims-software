CREATE TYPE "public"."FeedbackRequestProcess" AS ENUM('OPD_VISIT', 'IPD_DISCHARGE');--> statement-breakpoint
CREATE TYPE "public"."FeedbackRequestStatus" AS ENUM('READY', 'WHATSAPP_OPENED', 'SUBMITTED');--> statement-breakpoint
ALTER TYPE "public"."FeedbackChannel" ADD VALUE 'WHATSAPP_LINK';--> statement-breakpoint
CREATE TABLE "feedback_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"seq" serial NOT NULL,
	"token" text NOT NULL,
	"process" "FeedbackRequestProcess" NOT NULL,
	"source_id" text NOT NULL,
	"patient_id" text NOT NULL,
	"encounter_id" text NOT NULL,
	"admission_id" text,
	"department_id" text NOT NULL,
	"doctor_id" text,
	"phone" text NOT NULL,
	"completed_at" timestamp(3) NOT NULL,
	"status" "FeedbackRequestStatus" NOT NULL,
	"whatsapp_opened_at" timestamp(3),
	"submitted_at" timestamp(3),
	"feedback_id" text,
	"created_by_id" text NOT NULL,
	"created_at" timestamp(3) NOT NULL,
	"updated_at" timestamp(3) NOT NULL
);
--> statement-breakpoint
ALTER TABLE "feedback_requests" ADD CONSTRAINT "feedback_requests_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE no action ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "feedback_requests" ADD CONSTRAINT "feedback_requests_encounter_id_fkey" FOREIGN KEY ("encounter_id") REFERENCES "public"."encounters"("id") ON DELETE no action ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "feedback_requests" ADD CONSTRAINT "feedback_requests_admission_id_fkey" FOREIGN KEY ("admission_id") REFERENCES "public"."admissions"("id") ON DELETE no action ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "feedback_requests" ADD CONSTRAINT "feedback_requests_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE no action ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "feedback_requests" ADD CONSTRAINT "feedback_requests_doctor_id_fkey" FOREIGN KEY ("doctor_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "feedback_requests" ADD CONSTRAINT "feedback_requests_feedback_id_fkey" FOREIGN KEY ("feedback_id") REFERENCES "public"."feedback"("id") ON DELETE no action ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "feedback_requests" ADD CONSTRAINT "feedback_requests_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
CREATE UNIQUE INDEX "feedback_requests_token_key" ON "feedback_requests" USING btree ("token");--> statement-breakpoint
CREATE UNIQUE INDEX "feedback_requests_process_source_key" ON "feedback_requests" USING btree ("process","source_id");--> statement-breakpoint
CREATE UNIQUE INDEX "feedback_requests_feedback_id_key" ON "feedback_requests" USING btree ("feedback_id");--> statement-breakpoint
CREATE INDEX "feedback_requests_patient_id_idx" ON "feedback_requests" USING btree ("patient_id");--> statement-breakpoint
CREATE INDEX "feedback_requests_created_at_idx" ON "feedback_requests" USING btree ("created_at");--> statement-breakpoint
INSERT INTO "feedback_requests" (
	"id", "token", "process", "source_id", "patient_id", "encounter_id",
	"department_id", "doctor_id", "phone", "completed_at", "status",
	"created_by_id", "created_at", "updated_at"
)
SELECT
	'fbr_mig_opd_' || e."id", gen_random_uuid()::text, 'OPD_VISIT', e."id",
	e."patient_id", e."id", e."department_id", e."doctor_id", p."phone",
	COALESCE(e."closed_at", e."updated_at"), 'READY', e."doctor_id",
	COALESCE(e."closed_at", e."updated_at"), COALESCE(e."closed_at", e."updated_at")
FROM "encounters" e
JOIN "patients" p ON p."id" = e."patient_id"
WHERE e."type" = 'OPD' AND e."status" = 'CLOSED'
ON CONFLICT ("process", "source_id") DO NOTHING;--> statement-breakpoint
INSERT INTO "feedback_requests" (
	"id", "token", "process", "source_id", "patient_id", "encounter_id",
	"admission_id", "department_id", "doctor_id", "phone", "completed_at",
	"status", "created_by_id", "created_at", "updated_at"
)
SELECT
	'fbr_mig_ipd_' || a."id", gen_random_uuid()::text, 'IPD_DISCHARGE', a."id",
	a."patient_id", a."encounter_id", a."id", a."department_id", a."doctor_id",
	p."phone", COALESCE(a."discharged_at", a."updated_at"), 'READY', a."doctor_id",
	COALESCE(a."discharged_at", a."updated_at"), COALESCE(a."discharged_at", a."updated_at")
FROM "admissions" a
JOIN "patients" p ON p."id" = a."patient_id"
WHERE a."status" = 'DISCHARGED'
ON CONFLICT ("process", "source_id") DO NOTHING;--> statement-breakpoint
UPDATE "feedback_requests" request
SET
	"status" = 'SUBMITTED',
	"feedback_id" = response."id",
	"submitted_at" = response."submitted_at",
	"updated_at" = response."submitted_at"
FROM (
	SELECT DISTINCT ON ("encounter_id") "id", "encounter_id", "submitted_at"
	FROM "feedback"
	WHERE "encounter_id" IS NOT NULL
	ORDER BY "encounter_id", "submitted_at" DESC
) response
WHERE request."encounter_id" = response."encounter_id";
