CREATE TYPE "public"."RadiologyCriticality" AS ENUM('ROUTINE', 'SIGNIFICANT', 'CRITICAL');--> statement-breakpoint
CREATE TYPE "public"."RadiologyEquipmentStatus" AS ENUM('ACTIVE', 'MAINTENANCE', 'OUT_OF_SERVICE');--> statement-breakpoint
CREATE TYPE "public"."RadiologyModality" AS ENUM('XRAY', 'CT', 'MRI', 'ULTRASOUND', 'MAMMOGRAPHY', 'FLUOROSCOPY', 'INTERVENTIONAL', 'DEXA');--> statement-breakpoint
CREATE TYPE "public"."RadiologyPriority" AS ENUM('ROUTINE', 'URGENT', 'STAT');--> statement-breakpoint
CREATE TYPE "public"."RadiologyReportStatus" AS ENUM('DRAFT', 'PRELIMINARY', 'FINAL', 'AMENDED');--> statement-breakpoint
CREATE TYPE "public"."RadiologyStatus" AS ENUM('ORDERED', 'SCHEDULED', 'CHECKED_IN', 'READY', 'IN_PROGRESS', 'ACQUIRED', 'REPORT_DRAFT', 'PRELIMINARY', 'FINAL', 'AMENDED', 'CANCELLED');--> statement-breakpoint
ALTER TYPE "public"."ChargeCategory" ADD VALUE 'RADIOLOGY' BEFORE 'PHARMACY';--> statement-breakpoint
ALTER TYPE "public"."ChargeSource" ADD VALUE 'RADIOLOGY_ORDER' BEFORE 'PHARMACY_TXN';--> statement-breakpoint
ALTER TYPE "public"."DocumentKind" ADD VALUE 'RADIOLOGY_REPORT' BEFORE 'REFERRAL_LETTER';--> statement-breakpoint
ALTER TYPE "public"."FeedbackCategory" ADD VALUE 'RADIOLOGY';--> statement-breakpoint
ALTER TYPE "public"."StaffRole" ADD VALUE 'RADIOLOGIST' BEFORE 'BILLING_EXECUTIVE';--> statement-breakpoint
ALTER TYPE "public"."StaffRole" ADD VALUE 'RADIOLOGY_TECHNICIAN' BEFORE 'BILLING_EXECUTIVE';--> statement-breakpoint
CREATE TABLE "radiology_communications" (
	"id" text PRIMARY KEY NOT NULL,
	"seq" serial NOT NULL,
	"report_id" text NOT NULL,
	"recipient_id" text NOT NULL,
	"method" text NOT NULL,
	"outcome" text NOT NULL,
	"communicated_by_id" text NOT NULL,
	"communicated_at" timestamp(3) NOT NULL,
	"acknowledged_by_id" text,
	"acknowledged_at" timestamp(3),
	"notes" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "radiology_equipment" (
	"id" text PRIMARY KEY NOT NULL,
	"seq" serial NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"modality" "RadiologyModality" NOT NULL,
	"room" text NOT NULL,
	"manufacturer" text NOT NULL,
	"model" text NOT NULL,
	"serial_number" text NOT NULL,
	"status" "RadiologyEquipmentStatus" NOT NULL,
	"portable" boolean NOT NULL,
	"aerb_licence_number" text,
	"aerb_licence_valid_until" date,
	"last_qa_at" date,
	"next_qa_due" date,
	"created_at" timestamp(3) NOT NULL,
	"updated_at" timestamp(3) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "radiology_equipment_events" (
	"id" text PRIMARY KEY NOT NULL,
	"seq" serial NOT NULL,
	"equipment_id" text NOT NULL,
	"type" text NOT NULL,
	"status" text NOT NULL,
	"scheduled_at" timestamp(3),
	"completed_at" timestamp(3),
	"recorded_by_id" text NOT NULL,
	"result" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "radiology_orders" (
	"id" text PRIMARY KEY NOT NULL,
	"seq" serial NOT NULL,
	"accession_number" text NOT NULL,
	"batch_id" text,
	"patient_id" text NOT NULL,
	"encounter_id" text,
	"admission_id" text,
	"source" text NOT NULL,
	"external_referrer" text,
	"procedure_id" text NOT NULL,
	"ordered_by_id" text NOT NULL,
	"ordered_at" timestamp(3) NOT NULL,
	"priority" "RadiologyPriority" NOT NULL,
	"clinical_indication" text NOT NULL,
	"provisional_diagnosis" text NOT NULL,
	"status" "RadiologyStatus" NOT NULL,
	"scheduled_at" timestamp(3),
	"equipment_id" text,
	"checked_in_at" timestamp(3),
	"ready_at" timestamp(3),
	"cancelled_at" timestamp(3),
	"cancel_reason" text,
	"created_at" timestamp(3) NOT NULL,
	"updated_at" timestamp(3) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "radiology_procedures" (
	"id" text PRIMARY KEY NOT NULL,
	"seq" serial NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"modality" "RadiologyModality" NOT NULL,
	"body_part" text NOT NULL,
	"price" numeric(12, 2) NOT NULL,
	"duration_minutes" integer NOT NULL,
	"turnaround_hours" integer NOT NULL,
	"preparation" text NOT NULL,
	"requires_contrast" boolean NOT NULL,
	"requires_consent" boolean NOT NULL,
	"requires_pregnancy_screening" boolean NOT NULL,
	"requires_pc_pndt" boolean NOT NULL,
	"records_radiation_dose" boolean NOT NULL,
	"active" boolean NOT NULL
);
--> statement-breakpoint
CREATE TABLE "radiology_reports" (
	"id" text PRIMARY KEY NOT NULL,
	"seq" serial NOT NULL,
	"order_id" text NOT NULL,
	"study_id" text NOT NULL,
	"version" integer NOT NULL,
	"status" "RadiologyReportStatus" NOT NULL,
	"findings" text NOT NULL,
	"impression" text NOT NULL,
	"recommendations" text NOT NULL,
	"criticality" "RadiologyCriticality" NOT NULL,
	"radiologist_id" text NOT NULL,
	"created_at" timestamp(3) NOT NULL,
	"finalised_at" timestamp(3),
	"supersedes_id" text
);
--> statement-breakpoint
CREATE TABLE "radiology_safety_assessments" (
	"id" text PRIMARY KEY NOT NULL,
	"seq" serial NOT NULL,
	"order_id" text NOT NULL,
	"identity_verified" boolean NOT NULL,
	"preparation_confirmed" boolean NOT NULL,
	"consent_confirmed" boolean NOT NULL,
	"allergies_reviewed" boolean NOT NULL,
	"renal_function_reviewed" boolean NOT NULL,
	"pregnancy_status" text NOT NULL,
	"mri_implant_screening_complete" boolean NOT NULL,
	"pc_pndt_form_complete" boolean NOT NULL,
	"pc_pndt_indication" text,
	"lmp" date,
	"contrast_agent" text,
	"contrast_dose" text,
	"contrast_lot" text,
	"notes" text NOT NULL,
	"completed_by_id" text NOT NULL,
	"completed_at" timestamp(3) NOT NULL,
	"created_at" timestamp(3) NOT NULL,
	"updated_at" timestamp(3) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "radiology_studies" (
	"id" text PRIMARY KEY NOT NULL,
	"seq" serial NOT NULL,
	"order_id" text NOT NULL,
	"attempt" integer NOT NULL,
	"study_instance_uid" text NOT NULL,
	"equipment_id" text NOT NULL,
	"performed_by_id" text NOT NULL,
	"started_at" timestamp(3) NOT NULL,
	"completed_at" timestamp(3),
	"accepted" boolean NOT NULL,
	"rejection_reason" text,
	"series_count" integer NOT NULL,
	"image_count" integer NOT NULL,
	"dose_measurements" jsonb NOT NULL,
	"contrast_administered" boolean NOT NULL,
	"contrast_reaction" text,
	"pacs_status" text NOT NULL,
	"pacs_study_url" text,
	"created_at" timestamp(3) NOT NULL,
	"updated_at" timestamp(3) NOT NULL
);
--> statement-breakpoint
ALTER TABLE "radiology_communications" ADD CONSTRAINT "radiology_communications_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "public"."radiology_reports"("id") ON DELETE no action ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "radiology_communications" ADD CONSTRAINT "radiology_communications_recipient_id_fkey" FOREIGN KEY ("recipient_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "radiology_communications" ADD CONSTRAINT "radiology_communications_communicated_by_id_fkey" FOREIGN KEY ("communicated_by_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "radiology_communications" ADD CONSTRAINT "radiology_communications_acknowledged_by_id_fkey" FOREIGN KEY ("acknowledged_by_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "radiology_equipment_events" ADD CONSTRAINT "radiology_equipment_events_equipment_id_fkey" FOREIGN KEY ("equipment_id") REFERENCES "public"."radiology_equipment"("id") ON DELETE no action ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "radiology_equipment_events" ADD CONSTRAINT "radiology_equipment_events_recorded_by_id_fkey" FOREIGN KEY ("recorded_by_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "radiology_orders" ADD CONSTRAINT "radiology_orders_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE no action ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "radiology_orders" ADD CONSTRAINT "radiology_orders_encounter_id_fkey" FOREIGN KEY ("encounter_id") REFERENCES "public"."encounters"("id") ON DELETE no action ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "radiology_orders" ADD CONSTRAINT "radiology_orders_admission_id_fkey" FOREIGN KEY ("admission_id") REFERENCES "public"."admissions"("id") ON DELETE no action ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "radiology_orders" ADD CONSTRAINT "radiology_orders_procedure_id_fkey" FOREIGN KEY ("procedure_id") REFERENCES "public"."radiology_procedures"("id") ON DELETE no action ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "radiology_orders" ADD CONSTRAINT "radiology_orders_ordered_by_id_fkey" FOREIGN KEY ("ordered_by_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "radiology_orders" ADD CONSTRAINT "radiology_orders_equipment_id_fkey" FOREIGN KEY ("equipment_id") REFERENCES "public"."radiology_equipment"("id") ON DELETE no action ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "radiology_reports" ADD CONSTRAINT "radiology_reports_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."radiology_orders"("id") ON DELETE no action ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "radiology_reports" ADD CONSTRAINT "radiology_reports_study_id_fkey" FOREIGN KEY ("study_id") REFERENCES "public"."radiology_studies"("id") ON DELETE no action ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "radiology_reports" ADD CONSTRAINT "radiology_reports_radiologist_id_fkey" FOREIGN KEY ("radiologist_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "radiology_safety_assessments" ADD CONSTRAINT "radiology_safety_assessments_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."radiology_orders"("id") ON DELETE no action ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "radiology_safety_assessments" ADD CONSTRAINT "radiology_safety_assessments_completed_by_id_fkey" FOREIGN KEY ("completed_by_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "radiology_studies" ADD CONSTRAINT "radiology_studies_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."radiology_orders"("id") ON DELETE no action ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "radiology_studies" ADD CONSTRAINT "radiology_studies_equipment_id_fkey" FOREIGN KEY ("equipment_id") REFERENCES "public"."radiology_equipment"("id") ON DELETE no action ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "radiology_studies" ADD CONSTRAINT "radiology_studies_performed_by_id_fkey" FOREIGN KEY ("performed_by_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
CREATE INDEX "radiology_communications_report_id_idx" ON "radiology_communications" USING btree ("report_id");--> statement-breakpoint
CREATE UNIQUE INDEX "radiology_equipment_code_key" ON "radiology_equipment" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "radiology_equipment_serial_number_key" ON "radiology_equipment" USING btree ("serial_number");--> statement-breakpoint
CREATE INDEX "radiology_equipment_events_equipment_id_idx" ON "radiology_equipment_events" USING btree ("equipment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "radiology_orders_accession_number_key" ON "radiology_orders" USING btree ("accession_number");--> statement-breakpoint
CREATE INDEX "radiology_orders_patient_id_idx" ON "radiology_orders" USING btree ("patient_id");--> statement-breakpoint
CREATE INDEX "radiology_orders_status_idx" ON "radiology_orders" USING btree ("status");--> statement-breakpoint
CREATE INDEX "radiology_orders_scheduled_at_idx" ON "radiology_orders" USING btree ("scheduled_at");--> statement-breakpoint
CREATE UNIQUE INDEX "radiology_procedures_code_key" ON "radiology_procedures" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "radiology_reports_order_version_key" ON "radiology_reports" USING btree ("order_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "radiology_safety_assessments_order_id_key" ON "radiology_safety_assessments" USING btree ("order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "radiology_studies_uid_key" ON "radiology_studies" USING btree ("study_instance_uid");--> statement-breakpoint
CREATE UNIQUE INDEX "radiology_studies_order_attempt_key" ON "radiology_studies" USING btree ("order_id","attempt");