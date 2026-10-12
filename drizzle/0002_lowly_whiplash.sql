ALTER TYPE "public"."EntityType" ADD VALUE 'ward' BEFORE 'bed';--> statement-breakpoint
ALTER TYPE "public"."EntityType" ADD VALUE 'alert';--> statement-breakpoint
CREATE TABLE "alerts" (
	"id" text PRIMARY KEY NOT NULL,
	"seq" serial NOT NULL,
	"sender_id" text NOT NULL,
	"recipient_ids" text[] NOT NULL,
	"read_by_ids" text[] NOT NULL,
	"category" text NOT NULL,
	"subject" text NOT NULL,
	"message" text NOT NULL,
	"priority" "Priority" NOT NULL,
	"created_at" timestamp(3) NOT NULL
);
--> statement-breakpoint
ALTER TABLE "wards" ALTER COLUMN "category" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
CREATE INDEX "alerts_created_at_idx" ON "alerts" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "alerts_sender_id_idx" ON "alerts" USING btree ("sender_id");--> statement-breakpoint
DROP TYPE "public"."WardCategory";