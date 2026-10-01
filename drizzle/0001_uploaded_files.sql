CREATE TYPE "public"."FileOwner" AS ENUM('PATIENT_PHOTO', 'STAFF_PHOTO', 'DOCUMENT', 'COMPLAINT');--> statement-breakpoint
ALTER TYPE "public"."RecordAccessAction" ADD VALUE 'DOCUMENT_REMOVED' BEFORE 'SUBMITTED';--> statement-breakpoint
CREATE TABLE "files" (
	"id" text PRIMARY KEY NOT NULL,
	"seq" serial NOT NULL,
	"owner_type" "FileOwner" NOT NULL,
	"owner_id" text NOT NULL,
	"name" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_kb" integer NOT NULL,
	"data" text NOT NULL,
	"uploaded_at" timestamp(3) NOT NULL,
	"uploaded_by_id" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
CREATE INDEX "files_owner_idx" ON "files" USING btree ("owner_type","owner_id");