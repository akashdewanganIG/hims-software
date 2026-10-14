ALTER TABLE "alerts" ADD COLUMN "patient_id" text;--> statement-breakpoint
ALTER TABLE "alerts" ADD COLUMN "admission_id" text;--> statement-breakpoint
ALTER TABLE "alerts" ADD COLUMN "due_at" timestamp(3);--> statement-breakpoint
ALTER TABLE "alerts" ADD COLUMN "escalation_recipient_id" text;--> statement-breakpoint
ALTER TABLE "alerts" ADD COLUMN "escalation_label" text;--> statement-breakpoint
ALTER TABLE "alerts" ADD COLUMN "participant_states" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE no action ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_admission_id_fkey" FOREIGN KEY ("admission_id") REFERENCES "public"."admissions"("id") ON DELETE no action ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_escalation_recipient_id_fkey" FOREIGN KEY ("escalation_recipient_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
CREATE INDEX "alerts_due_at_idx" ON "alerts" USING btree ("due_at");--> statement-breakpoint
CREATE INDEX "alerts_patient_id_idx" ON "alerts" USING btree ("patient_id");