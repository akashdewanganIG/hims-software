CREATE TYPE "public"."AttendanceStatus" AS ENUM('PRESENT', 'ABSENT', 'LATE', 'HALF_DAY', 'LEAVE', 'OFF_DUTY');--> statement-breakpoint
ALTER TYPE "public"."EntityType" ADD VALUE 'attendance' BEFORE 'user';--> statement-breakpoint
CREATE TABLE "attendance" (
	"id" text PRIMARY KEY NOT NULL,
	"seq" serial NOT NULL,
	"staff_id" text NOT NULL,
	"date" date NOT NULL,
	"status" "AttendanceStatus" NOT NULL,
	"check_in_at" timestamp(3),
	"check_out_at" timestamp(3),
	"note" text,
	"recorded_by_id" text NOT NULL,
	"created_at" timestamp(3) NOT NULL,
	"updated_at" timestamp(3) NOT NULL
);
--> statement-breakpoint
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_recorded_by_id_fkey" FOREIGN KEY ("recorded_by_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
CREATE UNIQUE INDEX "attendance_staff_id_date_key" ON "attendance" USING btree ("staff_id","date");--> statement-breakpoint
CREATE INDEX "attendance_date_idx" ON "attendance" USING btree ("date");--> statement-breakpoint
CREATE INDEX "attendance_status_idx" ON "attendance" USING btree ("status");