CREATE TYPE "public"."AdmissionSource" AS ENUM('OPD', 'DIRECT', 'REFERRAL');--> statement-breakpoint
CREATE TYPE "public"."AdmissionStatus" AS ENUM('ADMITTED', 'ACTIVE', 'TRANSFER_PENDING', 'DISCHARGE_PENDING', 'DISCHARGED');--> statement-breakpoint
CREATE TYPE "public"."AppointmentStatus" AS ENUM('SCHEDULED', 'CHECKED_IN', 'IN_CONSULTATION', 'COMPLETED', 'CANCELLED', 'NO_SHOW');--> statement-breakpoint
CREATE TYPE "public"."AppointmentType" AS ENUM('NEW', 'FOLLOW_UP', 'REFERRAL');--> statement-breakpoint
CREATE TYPE "public"."BedStatus" AS ENUM('AVAILABLE', 'OCCUPIED', 'RESERVED', 'CLEANING', 'MAINTENANCE');--> statement-breakpoint
CREATE TYPE "public"."BloodGroup" AS ENUM('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-');--> statement-breakpoint
CREATE TYPE "public"."BookingSource" AS ENUM('ENQUIRY', 'WALK_IN', 'PHONE', 'ONLINE', 'FOLLOW_UP');--> statement-breakpoint
CREATE TYPE "public"."CareOrderStatus" AS ENUM('ACTIVE', 'COMPLETED', 'DISCONTINUED');--> statement-breakpoint
CREATE TYPE "public"."CareOrderType" AS ENUM('DIET', 'NURSING', 'MONITORING', 'PROCEDURE', 'ACTIVITY');--> statement-breakpoint
CREATE TYPE "public"."ChargeCategory" AS ENUM('REGISTRATION', 'CONSULTATION', 'LAB', 'PHARMACY', 'ROOM', 'NURSING', 'PROCEDURE', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."ChargeSource" AS ENUM('APPOINTMENT', 'REGISTRATION', 'LAB_ORDER_ITEM', 'PHARMACY_TXN', 'BED_ASSIGNMENT', 'ADMISSION', 'MANUAL');--> statement-breakpoint
CREATE TYPE "public"."ClinicalNoteType" AS ENUM('ADMISSION', 'PROGRESS', 'NURSING', 'PROCEDURE');--> statement-breakpoint
CREATE TYPE "public"."ComplainantType" AS ENUM('PATIENT', 'ATTENDANT', 'VISITOR', 'STAFF');--> statement-breakpoint
CREATE TYPE "public"."ComplaintCategory" AS ENUM('CLINICAL_CARE', 'STAFF_BEHAVIOUR', 'WAITING_TIME', 'BILLING', 'CLEANLINESS', 'FOOD', 'FACILITIES', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."ComplaintNoteKind" AS ENUM('NOTE', 'STATUS');--> statement-breakpoint
CREATE TYPE "public"."ComplaintStatus" AS ENUM('OPEN', 'ASSIGNED', 'IN_PROGRESS', 'RESOLVED', 'CLOSED');--> statement-breakpoint
CREATE TYPE "public"."DepartmentKind" AS ENUM('CLINICAL', 'DIAGNOSTIC', 'SUPPORT', 'ADMINISTRATIVE');--> statement-breakpoint
CREATE TYPE "public"."DischargeSummaryStatus" AS ENUM('DRAFT', 'FINAL');--> statement-breakpoint
CREATE TYPE "public"."DocumentKind" AS ENUM('CONSENT_FORM', 'DISCHARGE_SUMMARY', 'LAB_REPORT', 'REFERRAL_LETTER', 'EXTERNAL_REPORT', 'ID_PROOF', 'PRESCRIPTION', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."EncounterStatus" AS ENUM('OPEN', 'CLOSED');--> statement-breakpoint
CREATE TYPE "public"."EncounterType" AS ENUM('OPD', 'IPD');--> statement-breakpoint
CREATE TYPE "public"."EnquirySource" AS ENUM('WALK_IN', 'PHONE', 'WEBSITE', 'WHATSAPP', 'REFERRAL', 'DEPARTMENT_REFERRAL', 'HEALTH_CAMP');--> statement-breakpoint
CREATE TYPE "public"."EnquiryStatus" AS ENUM('NEW', 'FOLLOW_UP_REQUIRED', 'APPOINTMENT_SCHEDULED', 'CONVERTED', 'CANCELLED', 'CLOSED');--> statement-breakpoint
CREATE TYPE "public"."EnquiryType" AS ENUM('INTERNAL', 'EXTERNAL');--> statement-breakpoint
CREATE TYPE "public"."EntityType" AS ENUM('patient', 'enquiry', 'appointment', 'encounter', 'admission', 'bed', 'prescription', 'pharmacy', 'lab', 'invoice', 'mrd', 'complaint', 'feedback', 'staff', 'roster', 'user', 'role');--> statement-breakpoint
CREATE TYPE "public"."FeedbackCategory" AS ENUM('DOCTOR_CONSULTATION', 'NURSING_CARE', 'WAITING_TIME', 'CLEANLINESS', 'BILLING', 'FOOD', 'FRONT_DESK', 'PHARMACY', 'LAB');--> statement-breakpoint
CREATE TYPE "public"."FeedbackChannel" AS ENUM('KIOSK', 'SMS_LINK', 'IN_PERSON', 'EMAIL');--> statement-breakpoint
CREATE TYPE "public"."FollowUpChannel" AS ENUM('CALL', 'WHATSAPP', 'EMAIL', 'IN_PERSON');--> statement-breakpoint
CREATE TYPE "public"."FollowUpStatus" AS ENUM('NOT_REQUIRED', 'PENDING', 'IN_PROGRESS', 'COMPLETED');--> statement-breakpoint
CREATE TYPE "public"."Frequency" AS ENUM('OD', 'BD', 'TDS', 'QID', 'HS', 'SOS', 'STAT');--> statement-breakpoint
CREATE TYPE "public"."Gender" AS ENUM('MALE', 'FEMALE', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."InvoiceStatus" AS ENUM('DRAFT', 'PENDING', 'PARTIALLY_PAID', 'PAID', 'REFUNDED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."LabPriority" AS ENUM('ROUTINE', 'URGENT', 'STAT');--> statement-breakpoint
CREATE TYPE "public"."LabStatus" AS ENUM('ORDERED', 'SAMPLE_PENDING', 'COLLECTED', 'PROCESSING', 'RESULT_READY', 'VERIFIED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."MedicineForm" AS ENUM('TABLET', 'CAPSULE', 'SYRUP', 'INJECTION', 'INFUSION', 'OINTMENT', 'INHALER', 'DROPS');--> statement-breakpoint
CREATE TYPE "public"."MrdRecordType" AS ENUM('OPD_CASE_SHEET', 'IPD_CASE_FILE');--> statement-breakpoint
CREATE TYPE "public"."MrdStatus" AS ENUM('INCOMPLETE', 'PENDING_REVIEW', 'COMPLETE', 'ARCHIVED');--> statement-breakpoint
CREATE TYPE "public"."OpdDisposition" AS ENUM('SENT_HOME', 'FOLLOW_UP', 'REFERRED', 'ADMISSION_ADVISED');--> statement-breakpoint
CREATE TYPE "public"."PaymentKind" AS ENUM('PAYMENT', 'REFUND');--> statement-breakpoint
CREATE TYPE "public"."PaymentMethod" AS ENUM('CASH', 'CARD', 'UPI', 'NET_BANKING');--> statement-breakpoint
CREATE TYPE "public"."PharmacyTxnType" AS ENUM('DISPENSE', 'RETURN', 'RECEIPT', 'WRITE_OFF', 'SALE');--> statement-breakpoint
CREATE TYPE "public"."PrescriptionItemStatus" AS ENUM('PENDING', 'PARTIAL', 'DISPENSED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."PrescriptionStatus" AS ENUM('PENDING', 'PARTIALLY_DISPENSED', 'DISPENSED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."Priority" AS ENUM('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');--> statement-breakpoint
CREATE TYPE "public"."RecordAccessAction" AS ENUM('CREATED', 'VIEWED', 'DOCUMENT_ADDED', 'SUBMITTED', 'RETURNED', 'REVIEWED', 'ARCHIVED');--> statement-breakpoint
CREATE TYPE "public"."ResultFlag" AS ENUM('NORMAL', 'LOW', 'HIGH', 'CRITICAL_LOW', 'CRITICAL_HIGH', 'ABNORMAL');--> statement-breakpoint
CREATE TYPE "public"."RosterStatus" AS ENUM('SCHEDULED', 'OFF', 'LEAVE');--> statement-breakpoint
CREATE TYPE "public"."Route" AS ENUM('ORAL', 'IV', 'IM', 'SC', 'TOPICAL', 'INHALED', 'OPHTHALMIC');--> statement-breakpoint
CREATE TYPE "public"."SampleType" AS ENUM('BLOOD', 'SERUM', 'URINE', 'STOOL', 'SWAB', 'SPUTUM');--> statement-breakpoint
CREATE TYPE "public"."StaffRole" AS ENUM('ADMINISTRATOR', 'RECEPTIONIST', 'DOCTOR', 'NURSE', 'PHARMACIST', 'LAB_TECHNICIAN', 'BILLING_EXECUTIVE', 'MRD_STAFF', 'OPERATIONS_MANAGER', 'SUPPORT');--> statement-breakpoint
CREATE TYPE "public"."StaffStatus" AS ENUM('ACTIVE', 'ON_LEAVE', 'INACTIVE');--> statement-breakpoint
CREATE TYPE "public"."UserStatus" AS ENUM('ACTIVE', 'DISABLED');--> statement-breakpoint
CREATE TYPE "public"."WardCategory" AS ENUM('GENERAL', 'SEMI_PRIVATE', 'PRIVATE', 'HDU');--> statement-breakpoint
CREATE TABLE "activity" (
	"id" text PRIMARY KEY NOT NULL,
	"seq" serial NOT NULL,
	"at" timestamp(3) NOT NULL,
	"actor_id" text NOT NULL,
	"entity_type" "EntityType" NOT NULL,
	"entity_id" text NOT NULL,
	"patient_id" text,
	"action" text NOT NULL,
	"summary" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admissions" (
	"id" text PRIMARY KEY NOT NULL,
	"seq" serial NOT NULL,
	"code" text NOT NULL,
	"patient_id" text NOT NULL,
	"encounter_id" text NOT NULL,
	"doctor_id" text NOT NULL,
	"department_id" text NOT NULL,
	"source" "AdmissionSource" NOT NULL,
	"source_encounter_id" text,
	"admitted_at" timestamp(3) NOT NULL,
	"reason" text NOT NULL,
	"provisional_diagnosis" text NOT NULL,
	"status" "AdmissionStatus" NOT NULL,
	"expected_discharge_date" date,
	"pending_transfer" jsonb,
	"discharge_initiated_at" timestamp(3),
	"billing_cleared_at" timestamp(3),
	"billing_cleared_by_id" text,
	"clearance_note" text,
	"discharged_at" timestamp(3),
	"created_at" timestamp(3) NOT NULL,
	"updated_at" timestamp(3) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "appointments" (
	"id" text PRIMARY KEY NOT NULL,
	"seq" serial NOT NULL,
	"code" text NOT NULL,
	"patient_id" text NOT NULL,
	"doctor_id" text NOT NULL,
	"department_id" text NOT NULL,
	"scheduled_at" timestamp(3) NOT NULL,
	"slot_minutes" integer NOT NULL,
	"type" "AppointmentType" NOT NULL,
	"source" "BookingSource" NOT NULL,
	"enquiry_id" text,
	"reason" text NOT NULL,
	"status" "AppointmentStatus" NOT NULL,
	"token_number" integer,
	"checked_in_at" timestamp(3),
	"consultation_started_at" timestamp(3),
	"completed_at" timestamp(3),
	"cancelled_at" timestamp(3),
	"cancel_reason" text,
	"encounter_id" text,
	"rescheduled_from" timestamp(3),
	"created_at" timestamp(3) NOT NULL,
	"updated_at" timestamp(3) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bed_assignments" (
	"id" text PRIMARY KEY NOT NULL,
	"seq" serial NOT NULL,
	"admission_id" text NOT NULL,
	"bed_id" text NOT NULL,
	"from_at" timestamp(3) NOT NULL,
	"to_at" timestamp(3),
	"reason" text NOT NULL,
	"by_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "beds" (
	"id" text PRIMARY KEY NOT NULL,
	"seq" serial NOT NULL,
	"room_id" text NOT NULL,
	"code" text NOT NULL,
	"status" "BedStatus" NOT NULL,
	"admission_id" text,
	"note" text,
	"status_changed_at" timestamp(3) NOT NULL,
	"created_at" timestamp(3) NOT NULL,
	"updated_at" timestamp(3) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "care_orders" (
	"id" text PRIMARY KEY NOT NULL,
	"seq" serial NOT NULL,
	"admission_id" text NOT NULL,
	"type" "CareOrderType" NOT NULL,
	"instruction" text NOT NULL,
	"ordered_by_id" text NOT NULL,
	"ordered_at" timestamp(3) NOT NULL,
	"status" "CareOrderStatus" NOT NULL,
	"ended_at" timestamp(3),
	"created_at" timestamp(3) NOT NULL,
	"updated_at" timestamp(3) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "change_log" (
	"version" integer PRIMARY KEY NOT NULL,
	"epoch" text NOT NULL,
	"at" timestamp(3) DEFAULT now() NOT NULL,
	"user_id" text,
	"actor_id" text,
	"operation" text NOT NULL,
	"label" text NOT NULL,
	"changes" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clinical_notes" (
	"id" text PRIMARY KEY NOT NULL,
	"seq" serial NOT NULL,
	"patient_id" text NOT NULL,
	"encounter_id" text NOT NULL,
	"admission_id" text,
	"type" "ClinicalNoteType" NOT NULL,
	"author_id" text NOT NULL,
	"at" timestamp(3) NOT NULL,
	"text" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "complaint_notes" (
	"id" text PRIMARY KEY NOT NULL,
	"seq" serial NOT NULL,
	"complaint_id" text NOT NULL,
	"at" timestamp(3) NOT NULL,
	"by_id" text NOT NULL,
	"text" text NOT NULL,
	"kind" "ComplaintNoteKind" NOT NULL
);
--> statement-breakpoint
CREATE TABLE "complaints" (
	"id" text PRIMARY KEY NOT NULL,
	"seq" serial NOT NULL,
	"code" text NOT NULL,
	"patient_id" text,
	"complainant_name" text NOT NULL,
	"complainant_type" "ComplainantType" NOT NULL,
	"contact" text NOT NULL,
	"encounter_id" text,
	"category" "ComplaintCategory" NOT NULL,
	"department_id" text NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"priority" "Priority" NOT NULL,
	"assigned_to_id" text,
	"due_date" date NOT NULL,
	"status" "ComplaintStatus" NOT NULL,
	"resolution" text,
	"resolved_at" timestamp(3),
	"closed_at" timestamp(3),
	"logged_by_id" text NOT NULL,
	"created_at" timestamp(3) NOT NULL,
	"updated_at" timestamp(3) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "departments" (
	"id" text PRIMARY KEY NOT NULL,
	"seq" serial NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"kind" "DepartmentKind" NOT NULL,
	"location" text NOT NULL,
	"created_at" timestamp(3) NOT NULL,
	"updated_at" timestamp(3) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "discharge_summaries" (
	"id" text PRIMARY KEY NOT NULL,
	"seq" serial NOT NULL,
	"admission_id" text NOT NULL,
	"patient_id" text NOT NULL,
	"prepared_by_id" text NOT NULL,
	"final_diagnosis" text NOT NULL,
	"course_in_hospital" text NOT NULL,
	"procedures_done" text NOT NULL,
	"condition_at_discharge" text NOT NULL,
	"discharge_medications" text NOT NULL,
	"follow_up_instructions" text NOT NULL,
	"follow_up_date" date,
	"status" "DischargeSummaryStatus" NOT NULL,
	"finalised_at" timestamp(3),
	"created_at" timestamp(3) NOT NULL,
	"updated_at" timestamp(3) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" text PRIMARY KEY NOT NULL,
	"seq" serial NOT NULL,
	"patient_id" text NOT NULL,
	"encounter_id" text,
	"admission_id" text,
	"title" text NOT NULL,
	"kind" "DocumentKind" NOT NULL,
	"file_name" text NOT NULL,
	"size_kb" integer NOT NULL,
	"uploaded_at" timestamp(3) NOT NULL,
	"uploaded_by_id" text NOT NULL,
	"source_id" text
);
--> statement-breakpoint
CREATE TABLE "encounters" (
	"id" text PRIMARY KEY NOT NULL,
	"seq" serial NOT NULL,
	"code" text NOT NULL,
	"patient_id" text NOT NULL,
	"type" "EncounterType" NOT NULL,
	"department_id" text NOT NULL,
	"doctor_id" text NOT NULL,
	"appointment_id" text,
	"admission_id" text,
	"status" "EncounterStatus" NOT NULL,
	"started_at" timestamp(3) NOT NULL,
	"closed_at" timestamp(3),
	"vitals" jsonb,
	"chief_complaint" text NOT NULL,
	"history" text NOT NULL,
	"examination" text NOT NULL,
	"diagnoses" jsonb NOT NULL,
	"consultation_notes" text NOT NULL,
	"advice" text NOT NULL,
	"follow_up_date" date,
	"referral" jsonb,
	"disposition" "OpdDisposition",
	"created_at" timestamp(3) NOT NULL,
	"updated_at" timestamp(3) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "enquiries" (
	"id" text PRIMARY KEY NOT NULL,
	"seq" serial NOT NULL,
	"code" text NOT NULL,
	"type" "EnquiryType" NOT NULL,
	"patient_id" text,
	"prospect_name" text NOT NULL,
	"phone" text NOT NULL,
	"email" text,
	"source" "EnquirySource" NOT NULL,
	"reason" text NOT NULL,
	"department_id" text,
	"preferred_doctor_id" text,
	"assigned_to_id" text NOT NULL,
	"referred_by_id" text,
	"notes" text NOT NULL,
	"follow_up_date" date,
	"status" "EnquiryStatus" NOT NULL,
	"appointment_id" text,
	"cancel_reason" text,
	"created_at" timestamp(3) NOT NULL,
	"updated_at" timestamp(3) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "enquiry_follow_ups" (
	"id" text PRIMARY KEY NOT NULL,
	"seq" serial NOT NULL,
	"enquiry_id" text NOT NULL,
	"at" timestamp(3) NOT NULL,
	"by_id" text NOT NULL,
	"channel" "FollowUpChannel" NOT NULL,
	"note" text NOT NULL,
	"next_follow_up_date" date
);
--> statement-breakpoint
CREATE TABLE "feedback" (
	"id" text PRIMARY KEY NOT NULL,
	"seq" serial NOT NULL,
	"code" text NOT NULL,
	"patient_id" text,
	"encounter_id" text,
	"department_id" text NOT NULL,
	"doctor_id" text,
	"rating" integer NOT NULL,
	"categories" "FeedbackCategory"[] NOT NULL,
	"comments" text NOT NULL,
	"channel" "FeedbackChannel" NOT NULL,
	"submitted_at" timestamp(3) NOT NULL,
	"follow_up_required" boolean NOT NULL,
	"follow_up_status" "FollowUpStatus" NOT NULL,
	"follow_up_note" text,
	"follow_up_by_id" text,
	"created_at" timestamp(3) NOT NULL,
	"updated_at" timestamp(3) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoice_items" (
	"id" text PRIMARY KEY NOT NULL,
	"seq" serial NOT NULL,
	"invoice_id" text NOT NULL,
	"category" "ChargeCategory" NOT NULL,
	"description" text NOT NULL,
	"quantity" integer NOT NULL,
	"unit_price" numeric(12, 2) NOT NULL,
	"discount" numeric(12, 2) NOT NULL,
	"source_type" "ChargeSource" NOT NULL,
	"source_id" text,
	"service_date" timestamp(3) NOT NULL,
	"created_at" timestamp(3) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" text PRIMARY KEY NOT NULL,
	"seq" serial NOT NULL,
	"code" text NOT NULL,
	"patient_id" text NOT NULL,
	"encounter_id" text,
	"admission_id" text,
	"status" "InvoiceStatus" NOT NULL,
	"finalised_at" timestamp(3),
	"cancelled_at" timestamp(3),
	"cancel_reason" text,
	"notes" text NOT NULL,
	"created_at" timestamp(3) NOT NULL,
	"updated_at" timestamp(3) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lab_order_items" (
	"id" text PRIMARY KEY NOT NULL,
	"seq" serial NOT NULL,
	"lab_order_id" text NOT NULL,
	"test_id" text NOT NULL,
	"price" numeric(12, 2) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lab_orders" (
	"id" text PRIMARY KEY NOT NULL,
	"seq" serial NOT NULL,
	"code" text NOT NULL,
	"patient_id" text NOT NULL,
	"encounter_id" text NOT NULL,
	"admission_id" text,
	"ordered_by_id" text NOT NULL,
	"ordered_at" timestamp(3) NOT NULL,
	"priority" "LabPriority" NOT NULL,
	"clinical_notes" text NOT NULL,
	"status" "LabStatus" NOT NULL,
	"sample_id" text,
	"sample_requested_at" timestamp(3),
	"sample_collected_at" timestamp(3),
	"collected_by_id" text,
	"technician_id" text,
	"processing_started_at" timestamp(3),
	"result_entered_at" timestamp(3),
	"verified_at" timestamp(3),
	"verified_by_id" text,
	"cancelled_at" timestamp(3),
	"cancel_reason" text,
	"created_at" timestamp(3) NOT NULL,
	"updated_at" timestamp(3) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lab_results" (
	"id" text PRIMARY KEY NOT NULL,
	"seq" serial NOT NULL,
	"lab_order_item_id" text NOT NULL,
	"parameter_id" text NOT NULL,
	"value" text NOT NULL,
	"flag" "ResultFlag" NOT NULL,
	"entered_at" timestamp(3) NOT NULL,
	"entered_by_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lab_tests" (
	"id" text PRIMARY KEY NOT NULL,
	"seq" serial NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"section" text NOT NULL,
	"sample_type" "SampleType" NOT NULL,
	"price" numeric(12, 2) NOT NULL,
	"turnaround_hours" integer NOT NULL,
	"parameters" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "medical_records" (
	"id" text PRIMARY KEY NOT NULL,
	"seq" serial NOT NULL,
	"code" text NOT NULL,
	"patient_id" text NOT NULL,
	"encounter_id" text NOT NULL,
	"admission_id" text,
	"record_type" "MrdRecordType" NOT NULL,
	"department_id" text NOT NULL,
	"attending_doctor_id" text NOT NULL,
	"status" "MrdStatus" NOT NULL,
	"location" text,
	"submitted_at" timestamp(3),
	"reviewed_at" timestamp(3),
	"reviewed_by_id" text,
	"archived_at" timestamp(3),
	"review_note" text,
	"created_at" timestamp(3) NOT NULL,
	"updated_at" timestamp(3) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "medicine_batches" (
	"id" text PRIMARY KEY NOT NULL,
	"seq" serial NOT NULL,
	"medicine_id" text NOT NULL,
	"batch_number" text NOT NULL,
	"expiry_date" date NOT NULL,
	"quantity_on_hand" integer NOT NULL,
	"received_at" timestamp(3) NOT NULL,
	"cost_price" numeric(12, 2) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "medicines" (
	"id" text PRIMARY KEY NOT NULL,
	"seq" serial NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"generic_name" text NOT NULL,
	"form" "MedicineForm" NOT NULL,
	"strength" text NOT NULL,
	"unit" text NOT NULL,
	"category" text NOT NULL,
	"unit_price" numeric(12, 2) NOT NULL,
	"reorder_level" integer NOT NULL,
	"manufacturer" text NOT NULL,
	"prescription_only" boolean NOT NULL,
	"created_at" timestamp(3) NOT NULL,
	"updated_at" timestamp(3) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "patients" (
	"id" text PRIMARY KEY NOT NULL,
	"seq" serial NOT NULL,
	"uhid" text NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"gender" "Gender" NOT NULL,
	"date_of_birth" date NOT NULL,
	"blood_group" "BloodGroup",
	"phone" text NOT NULL,
	"email" text,
	"address" text NOT NULL,
	"city" text NOT NULL,
	"emergency_contact_name" text NOT NULL,
	"emergency_contact_phone" text NOT NULL,
	"allergies" text[] NOT NULL,
	"chronic_conditions" text[] NOT NULL,
	"registered_at" timestamp(3) NOT NULL,
	"created_at" timestamp(3) NOT NULL,
	"updated_at" timestamp(3) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" text PRIMARY KEY NOT NULL,
	"seq" serial NOT NULL,
	"code" text NOT NULL,
	"invoice_id" text NOT NULL,
	"kind" "PaymentKind" NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"method" "PaymentMethod" NOT NULL,
	"reference" text NOT NULL,
	"received_at" timestamp(3) NOT NULL,
	"received_by_id" text NOT NULL,
	"note" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pharmacy_transactions" (
	"id" text PRIMARY KEY NOT NULL,
	"seq" serial NOT NULL,
	"code" text NOT NULL,
	"type" "PharmacyTxnType" NOT NULL,
	"medicine_id" text NOT NULL,
	"batch_id" text NOT NULL,
	"quantity" integer NOT NULL,
	"prescription_item_id" text,
	"patient_id" text,
	"at" timestamp(3) NOT NULL,
	"by_id" text NOT NULL,
	"note" text NOT NULL,
	"supplier" text,
	"reference" text
);
--> statement-breakpoint
CREATE TABLE "prescription_items" (
	"id" text PRIMARY KEY NOT NULL,
	"seq" serial NOT NULL,
	"prescription_id" text NOT NULL,
	"medicine_id" text NOT NULL,
	"dose" text NOT NULL,
	"frequency" "Frequency" NOT NULL,
	"route" "Route" NOT NULL,
	"duration_days" integer NOT NULL,
	"quantity_prescribed" integer NOT NULL,
	"quantity_dispensed" integer NOT NULL,
	"quantity_returned" integer NOT NULL,
	"instructions" text NOT NULL,
	"status" "PrescriptionItemStatus" NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prescriptions" (
	"id" text PRIMARY KEY NOT NULL,
	"seq" serial NOT NULL,
	"code" text NOT NULL,
	"patient_id" text NOT NULL,
	"encounter_id" text NOT NULL,
	"admission_id" text,
	"prescriber_id" text NOT NULL,
	"status" "PrescriptionStatus" NOT NULL,
	"notes" text NOT NULL,
	"is_discharge_medication" boolean,
	"created_at" timestamp(3) NOT NULL,
	"updated_at" timestamp(3) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "record_access_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"seq" serial NOT NULL,
	"medical_record_id" text NOT NULL,
	"at" timestamp(3) NOT NULL,
	"by_id" text NOT NULL,
	"action" "RecordAccessAction" NOT NULL,
	"note" text
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"id" text PRIMARY KEY NOT NULL,
	"seq" serial NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"modules" text[] NOT NULL,
	"actions" text[] NOT NULL,
	"home_path" text NOT NULL,
	"system" boolean NOT NULL,
	"created_at" timestamp(3) NOT NULL,
	"updated_at" timestamp(3) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rooms" (
	"id" text PRIMARY KEY NOT NULL,
	"seq" serial NOT NULL,
	"ward_id" text NOT NULL,
	"number" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "roster" (
	"id" text PRIMARY KEY NOT NULL,
	"seq" serial NOT NULL,
	"staff_id" text NOT NULL,
	"date" date NOT NULL,
	"status" "RosterStatus" NOT NULL,
	"shift_id" text,
	"department_id" text NOT NULL,
	"note" text
);
--> statement-breakpoint
CREATE TABLE "shifts" (
	"id" text PRIMARY KEY NOT NULL,
	"seq" serial NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"start" text NOT NULL,
	"end" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "staff" (
	"id" text PRIMARY KEY NOT NULL,
	"seq" serial NOT NULL,
	"staff_code" text NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"role" "StaffRole" NOT NULL,
	"department_id" text NOT NULL,
	"designation" text NOT NULL,
	"specialisation" text,
	"qualification" text,
	"phone" text NOT NULL,
	"email" text NOT NULL,
	"status" "StaffStatus" NOT NULL,
	"joined_on" date NOT NULL,
	"consultation_fee" numeric(12, 2),
	"created_at" timestamp(3) NOT NULL,
	"updated_at" timestamp(3) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sync_state" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"epoch" text NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"schema_version" integer NOT NULL,
	"anchored_at" timestamp(3) NOT NULL,
	"counters" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"user_changes" integer DEFAULT 0 NOT NULL,
	"seeded_at" timestamp(3) NOT NULL,
	"updated_at" timestamp(3) DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"seq" serial NOT NULL,
	"staff_id" text NOT NULL,
	"role_id" text NOT NULL,
	"username" text NOT NULL,
	"status" "UserStatus" NOT NULL,
	"custom_access" boolean NOT NULL,
	"modules" text[] NOT NULL,
	"actions" text[] NOT NULL,
	"created_at" timestamp(3) NOT NULL,
	"updated_at" timestamp(3) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wards" (
	"id" text PRIMARY KEY NOT NULL,
	"seq" serial NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"floor" integer NOT NULL,
	"category" "WardCategory" NOT NULL,
	"department_id" text,
	"daily_rate" numeric(12, 2) NOT NULL,
	"restriction" jsonb,
	"created_at" timestamp(3) NOT NULL,
	"updated_at" timestamp(3) NOT NULL
);
--> statement-breakpoint
ALTER TABLE "activity" ADD CONSTRAINT "activity_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "activity" ADD CONSTRAINT "activity_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE no action ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "admissions" ADD CONSTRAINT "admissions_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE no action ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "admissions" ADD CONSTRAINT "admissions_encounter_id_fkey" FOREIGN KEY ("encounter_id") REFERENCES "public"."encounters"("id") ON DELETE no action ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "admissions" ADD CONSTRAINT "admissions_doctor_id_fkey" FOREIGN KEY ("doctor_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "admissions" ADD CONSTRAINT "admissions_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE no action ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "admissions" ADD CONSTRAINT "admissions_billing_cleared_by_id_fkey" FOREIGN KEY ("billing_cleared_by_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "admissions" ADD CONSTRAINT "admissions_source_encounter_id_fkey" FOREIGN KEY ("source_encounter_id") REFERENCES "public"."encounters"("id") ON DELETE no action ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE no action ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_doctor_id_fkey" FOREIGN KEY ("doctor_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE no action ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_enquiry_id_fkey" FOREIGN KEY ("enquiry_id") REFERENCES "public"."enquiries"("id") ON DELETE no action ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_encounter_id_fkey" FOREIGN KEY ("encounter_id") REFERENCES "public"."encounters"("id") ON DELETE no action ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "bed_assignments" ADD CONSTRAINT "bed_assignments_admission_id_fkey" FOREIGN KEY ("admission_id") REFERENCES "public"."admissions"("id") ON DELETE no action ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "bed_assignments" ADD CONSTRAINT "bed_assignments_bed_id_fkey" FOREIGN KEY ("bed_id") REFERENCES "public"."beds"("id") ON DELETE no action ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "bed_assignments" ADD CONSTRAINT "bed_assignments_by_id_fkey" FOREIGN KEY ("by_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "beds" ADD CONSTRAINT "beds_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE no action ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "beds" ADD CONSTRAINT "beds_admission_id_fkey" FOREIGN KEY ("admission_id") REFERENCES "public"."admissions"("id") ON DELETE no action ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "care_orders" ADD CONSTRAINT "care_orders_admission_id_fkey" FOREIGN KEY ("admission_id") REFERENCES "public"."admissions"("id") ON DELETE no action ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "care_orders" ADD CONSTRAINT "care_orders_ordered_by_id_fkey" FOREIGN KEY ("ordered_by_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "clinical_notes" ADD CONSTRAINT "clinical_notes_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE no action ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "clinical_notes" ADD CONSTRAINT "clinical_notes_encounter_id_fkey" FOREIGN KEY ("encounter_id") REFERENCES "public"."encounters"("id") ON DELETE no action ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "clinical_notes" ADD CONSTRAINT "clinical_notes_admission_id_fkey" FOREIGN KEY ("admission_id") REFERENCES "public"."admissions"("id") ON DELETE no action ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "clinical_notes" ADD CONSTRAINT "clinical_notes_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "complaint_notes" ADD CONSTRAINT "complaint_notes_complaint_id_fkey" FOREIGN KEY ("complaint_id") REFERENCES "public"."complaints"("id") ON DELETE no action ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "complaint_notes" ADD CONSTRAINT "complaint_notes_by_id_fkey" FOREIGN KEY ("by_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "complaints" ADD CONSTRAINT "complaints_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE no action ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "complaints" ADD CONSTRAINT "complaints_encounter_id_fkey" FOREIGN KEY ("encounter_id") REFERENCES "public"."encounters"("id") ON DELETE no action ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "complaints" ADD CONSTRAINT "complaints_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE no action ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "complaints" ADD CONSTRAINT "complaints_assigned_to_id_fkey" FOREIGN KEY ("assigned_to_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "complaints" ADD CONSTRAINT "complaints_logged_by_id_fkey" FOREIGN KEY ("logged_by_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "discharge_summaries" ADD CONSTRAINT "discharge_summaries_admission_id_fkey" FOREIGN KEY ("admission_id") REFERENCES "public"."admissions"("id") ON DELETE no action ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "discharge_summaries" ADD CONSTRAINT "discharge_summaries_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE no action ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "discharge_summaries" ADD CONSTRAINT "discharge_summaries_prepared_by_id_fkey" FOREIGN KEY ("prepared_by_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE no action ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_encounter_id_fkey" FOREIGN KEY ("encounter_id") REFERENCES "public"."encounters"("id") ON DELETE no action ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_admission_id_fkey" FOREIGN KEY ("admission_id") REFERENCES "public"."admissions"("id") ON DELETE no action ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "encounters" ADD CONSTRAINT "encounters_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE no action ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "encounters" ADD CONSTRAINT "encounters_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE no action ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "encounters" ADD CONSTRAINT "encounters_doctor_id_fkey" FOREIGN KEY ("doctor_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "encounters" ADD CONSTRAINT "encounters_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointments"("id") ON DELETE no action ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "encounters" ADD CONSTRAINT "encounters_admission_id_fkey" FOREIGN KEY ("admission_id") REFERENCES "public"."admissions"("id") ON DELETE no action ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "enquiries" ADD CONSTRAINT "enquiries_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE no action ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "enquiries" ADD CONSTRAINT "enquiries_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE no action ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "enquiries" ADD CONSTRAINT "enquiries_preferred_doctor_id_fkey" FOREIGN KEY ("preferred_doctor_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "enquiries" ADD CONSTRAINT "enquiries_assigned_to_id_fkey" FOREIGN KEY ("assigned_to_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "enquiries" ADD CONSTRAINT "enquiries_referred_by_id_fkey" FOREIGN KEY ("referred_by_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "enquiries" ADD CONSTRAINT "enquiries_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointments"("id") ON DELETE no action ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "enquiry_follow_ups" ADD CONSTRAINT "enquiry_follow_ups_enquiry_id_fkey" FOREIGN KEY ("enquiry_id") REFERENCES "public"."enquiries"("id") ON DELETE no action ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "enquiry_follow_ups" ADD CONSTRAINT "enquiry_follow_ups_by_id_fkey" FOREIGN KEY ("by_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE no action ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_encounter_id_fkey" FOREIGN KEY ("encounter_id") REFERENCES "public"."encounters"("id") ON DELETE no action ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE no action ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_doctor_id_fkey" FOREIGN KEY ("doctor_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_follow_up_by_id_fkey" FOREIGN KEY ("follow_up_by_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE no action ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE no action ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_encounter_id_fkey" FOREIGN KEY ("encounter_id") REFERENCES "public"."encounters"("id") ON DELETE no action ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_admission_id_fkey" FOREIGN KEY ("admission_id") REFERENCES "public"."admissions"("id") ON DELETE no action ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "lab_order_items" ADD CONSTRAINT "lab_order_items_lab_order_id_fkey" FOREIGN KEY ("lab_order_id") REFERENCES "public"."lab_orders"("id") ON DELETE no action ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "lab_order_items" ADD CONSTRAINT "lab_order_items_test_id_fkey" FOREIGN KEY ("test_id") REFERENCES "public"."lab_tests"("id") ON DELETE no action ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "lab_orders" ADD CONSTRAINT "lab_orders_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE no action ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "lab_orders" ADD CONSTRAINT "lab_orders_encounter_id_fkey" FOREIGN KEY ("encounter_id") REFERENCES "public"."encounters"("id") ON DELETE no action ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "lab_orders" ADD CONSTRAINT "lab_orders_admission_id_fkey" FOREIGN KEY ("admission_id") REFERENCES "public"."admissions"("id") ON DELETE no action ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "lab_orders" ADD CONSTRAINT "lab_orders_ordered_by_id_fkey" FOREIGN KEY ("ordered_by_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "lab_orders" ADD CONSTRAINT "lab_orders_collected_by_id_fkey" FOREIGN KEY ("collected_by_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "lab_orders" ADD CONSTRAINT "lab_orders_technician_id_fkey" FOREIGN KEY ("technician_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "lab_orders" ADD CONSTRAINT "lab_orders_verified_by_id_fkey" FOREIGN KEY ("verified_by_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "lab_results" ADD CONSTRAINT "lab_results_lab_order_item_id_fkey" FOREIGN KEY ("lab_order_item_id") REFERENCES "public"."lab_order_items"("id") ON DELETE no action ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "lab_results" ADD CONSTRAINT "lab_results_entered_by_id_fkey" FOREIGN KEY ("entered_by_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "medical_records" ADD CONSTRAINT "medical_records_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE no action ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "medical_records" ADD CONSTRAINT "medical_records_encounter_id_fkey" FOREIGN KEY ("encounter_id") REFERENCES "public"."encounters"("id") ON DELETE no action ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "medical_records" ADD CONSTRAINT "medical_records_admission_id_fkey" FOREIGN KEY ("admission_id") REFERENCES "public"."admissions"("id") ON DELETE no action ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "medical_records" ADD CONSTRAINT "medical_records_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE no action ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "medical_records" ADD CONSTRAINT "medical_records_attending_doctor_id_fkey" FOREIGN KEY ("attending_doctor_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "medical_records" ADD CONSTRAINT "medical_records_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "medicine_batches" ADD CONSTRAINT "medicine_batches_medicine_id_fkey" FOREIGN KEY ("medicine_id") REFERENCES "public"."medicines"("id") ON DELETE no action ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE no action ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_received_by_id_fkey" FOREIGN KEY ("received_by_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "pharmacy_transactions" ADD CONSTRAINT "pharmacy_transactions_medicine_id_fkey" FOREIGN KEY ("medicine_id") REFERENCES "public"."medicines"("id") ON DELETE no action ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "pharmacy_transactions" ADD CONSTRAINT "pharmacy_transactions_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "public"."medicine_batches"("id") ON DELETE no action ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "pharmacy_transactions" ADD CONSTRAINT "pharmacy_transactions_prescription_item_id_fkey" FOREIGN KEY ("prescription_item_id") REFERENCES "public"."prescription_items"("id") ON DELETE no action ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "pharmacy_transactions" ADD CONSTRAINT "pharmacy_transactions_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE no action ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "pharmacy_transactions" ADD CONSTRAINT "pharmacy_transactions_by_id_fkey" FOREIGN KEY ("by_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "prescription_items" ADD CONSTRAINT "prescription_items_prescription_id_fkey" FOREIGN KEY ("prescription_id") REFERENCES "public"."prescriptions"("id") ON DELETE no action ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "prescription_items" ADD CONSTRAINT "prescription_items_medicine_id_fkey" FOREIGN KEY ("medicine_id") REFERENCES "public"."medicines"("id") ON DELETE no action ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "prescriptions" ADD CONSTRAINT "prescriptions_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE no action ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "prescriptions" ADD CONSTRAINT "prescriptions_encounter_id_fkey" FOREIGN KEY ("encounter_id") REFERENCES "public"."encounters"("id") ON DELETE no action ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "prescriptions" ADD CONSTRAINT "prescriptions_admission_id_fkey" FOREIGN KEY ("admission_id") REFERENCES "public"."admissions"("id") ON DELETE no action ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "prescriptions" ADD CONSTRAINT "prescriptions_prescriber_id_fkey" FOREIGN KEY ("prescriber_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "record_access_logs" ADD CONSTRAINT "record_access_logs_medical_record_id_fkey" FOREIGN KEY ("medical_record_id") REFERENCES "public"."medical_records"("id") ON DELETE no action ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "record_access_logs" ADD CONSTRAINT "record_access_logs_by_id_fkey" FOREIGN KEY ("by_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_ward_id_fkey" FOREIGN KEY ("ward_id") REFERENCES "public"."wards"("id") ON DELETE no action ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "roster" ADD CONSTRAINT "roster_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "roster" ADD CONSTRAINT "roster_shift_id_fkey" FOREIGN KEY ("shift_id") REFERENCES "public"."shifts"("id") ON DELETE no action ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "roster" ADD CONSTRAINT "roster_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE no action ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "staff" ADD CONSTRAINT "staff_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE no action ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE no action ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "wards" ADD CONSTRAINT "wards_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE no action ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
CREATE INDEX "activity_at_idx" ON "activity" USING btree ("at");--> statement-breakpoint
CREATE INDEX "activity_patient_id_idx" ON "activity" USING btree ("patient_id");--> statement-breakpoint
CREATE INDEX "activity_entity_type_entity_id_idx" ON "activity" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "admissions_code_key" ON "admissions" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "admissions_encounter_id_key" ON "admissions" USING btree ("encounter_id");--> statement-breakpoint
CREATE INDEX "admissions_patient_id_idx" ON "admissions" USING btree ("patient_id");--> statement-breakpoint
CREATE INDEX "admissions_doctor_id_idx" ON "admissions" USING btree ("doctor_id");--> statement-breakpoint
CREATE INDEX "admissions_department_id_idx" ON "admissions" USING btree ("department_id");--> statement-breakpoint
CREATE INDEX "admissions_status_idx" ON "admissions" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "appointments_code_key" ON "appointments" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "appointments_encounter_id_key" ON "appointments" USING btree ("encounter_id");--> statement-breakpoint
CREATE INDEX "appointments_patient_id_idx" ON "appointments" USING btree ("patient_id");--> statement-breakpoint
CREATE INDEX "appointments_doctor_id_scheduled_at_idx" ON "appointments" USING btree ("doctor_id","scheduled_at");--> statement-breakpoint
CREATE INDEX "appointments_department_id_idx" ON "appointments" USING btree ("department_id");--> statement-breakpoint
CREATE INDEX "appointments_enquiry_id_idx" ON "appointments" USING btree ("enquiry_id");--> statement-breakpoint
CREATE INDEX "appointments_status_idx" ON "appointments" USING btree ("status");--> statement-breakpoint
CREATE INDEX "bed_assignments_admission_id_idx" ON "bed_assignments" USING btree ("admission_id");--> statement-breakpoint
CREATE INDEX "bed_assignments_bed_id_idx" ON "bed_assignments" USING btree ("bed_id");--> statement-breakpoint
CREATE UNIQUE INDEX "beds_code_key" ON "beds" USING btree ("code");--> statement-breakpoint
CREATE INDEX "beds_room_id_idx" ON "beds" USING btree ("room_id");--> statement-breakpoint
CREATE INDEX "beds_status_idx" ON "beds" USING btree ("status");--> statement-breakpoint
CREATE INDEX "beds_admission_id_idx" ON "beds" USING btree ("admission_id");--> statement-breakpoint
CREATE INDEX "care_orders_admission_id_idx" ON "care_orders" USING btree ("admission_id");--> statement-breakpoint
CREATE INDEX "change_log_epoch_version_idx" ON "change_log" USING btree ("epoch","version");--> statement-breakpoint
CREATE INDEX "clinical_notes_admission_id_idx" ON "clinical_notes" USING btree ("admission_id");--> statement-breakpoint
CREATE INDEX "clinical_notes_patient_id_idx" ON "clinical_notes" USING btree ("patient_id");--> statement-breakpoint
CREATE INDEX "clinical_notes_encounter_id_idx" ON "clinical_notes" USING btree ("encounter_id");--> statement-breakpoint
CREATE INDEX "complaint_notes_complaint_id_idx" ON "complaint_notes" USING btree ("complaint_id");--> statement-breakpoint
CREATE UNIQUE INDEX "complaints_code_key" ON "complaints" USING btree ("code");--> statement-breakpoint
CREATE INDEX "complaints_patient_id_idx" ON "complaints" USING btree ("patient_id");--> statement-breakpoint
CREATE INDEX "complaints_department_id_idx" ON "complaints" USING btree ("department_id");--> statement-breakpoint
CREATE INDEX "complaints_status_idx" ON "complaints" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "departments_code_key" ON "departments" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "discharge_summaries_admission_id_key" ON "discharge_summaries" USING btree ("admission_id");--> statement-breakpoint
CREATE INDEX "discharge_summaries_patient_id_idx" ON "discharge_summaries" USING btree ("patient_id");--> statement-breakpoint
CREATE INDEX "documents_patient_id_idx" ON "documents" USING btree ("patient_id");--> statement-breakpoint
CREATE INDEX "documents_admission_id_idx" ON "documents" USING btree ("admission_id");--> statement-breakpoint
CREATE INDEX "documents_encounter_id_idx" ON "documents" USING btree ("encounter_id");--> statement-breakpoint
CREATE UNIQUE INDEX "encounters_code_key" ON "encounters" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "encounters_appointment_id_key" ON "encounters" USING btree ("appointment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "encounters_admission_id_key" ON "encounters" USING btree ("admission_id");--> statement-breakpoint
CREATE INDEX "encounters_patient_id_idx" ON "encounters" USING btree ("patient_id");--> statement-breakpoint
CREATE INDEX "encounters_doctor_id_idx" ON "encounters" USING btree ("doctor_id");--> statement-breakpoint
CREATE INDEX "encounters_department_id_idx" ON "encounters" USING btree ("department_id");--> statement-breakpoint
CREATE INDEX "encounters_status_idx" ON "encounters" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "enquiries_code_key" ON "enquiries" USING btree ("code");--> statement-breakpoint
CREATE INDEX "enquiries_patient_id_idx" ON "enquiries" USING btree ("patient_id");--> statement-breakpoint
CREATE INDEX "enquiries_status_idx" ON "enquiries" USING btree ("status");--> statement-breakpoint
CREATE INDEX "enquiries_assigned_to_id_idx" ON "enquiries" USING btree ("assigned_to_id");--> statement-breakpoint
CREATE INDEX "enquiries_appointment_id_idx" ON "enquiries" USING btree ("appointment_id");--> statement-breakpoint
CREATE INDEX "enquiry_follow_ups_enquiry_id_idx" ON "enquiry_follow_ups" USING btree ("enquiry_id");--> statement-breakpoint
CREATE INDEX "enquiry_follow_ups_by_id_idx" ON "enquiry_follow_ups" USING btree ("by_id");--> statement-breakpoint
CREATE UNIQUE INDEX "feedback_code_key" ON "feedback" USING btree ("code");--> statement-breakpoint
CREATE INDEX "feedback_patient_id_idx" ON "feedback" USING btree ("patient_id");--> statement-breakpoint
CREATE INDEX "feedback_department_id_idx" ON "feedback" USING btree ("department_id");--> statement-breakpoint
CREATE INDEX "feedback_submitted_at_idx" ON "feedback" USING btree ("submitted_at");--> statement-breakpoint
CREATE INDEX "invoice_items_invoice_id_idx" ON "invoice_items" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "invoice_items_source_type_source_id_idx" ON "invoice_items" USING btree ("source_type","source_id");--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_code_key" ON "invoices" USING btree ("code");--> statement-breakpoint
CREATE INDEX "invoices_patient_id_idx" ON "invoices" USING btree ("patient_id");--> statement-breakpoint
CREATE INDEX "invoices_encounter_id_idx" ON "invoices" USING btree ("encounter_id");--> statement-breakpoint
CREATE INDEX "invoices_admission_id_idx" ON "invoices" USING btree ("admission_id");--> statement-breakpoint
CREATE INDEX "invoices_status_idx" ON "invoices" USING btree ("status");--> statement-breakpoint
CREATE INDEX "lab_order_items_lab_order_id_idx" ON "lab_order_items" USING btree ("lab_order_id");--> statement-breakpoint
CREATE INDEX "lab_order_items_test_id_idx" ON "lab_order_items" USING btree ("test_id");--> statement-breakpoint
CREATE UNIQUE INDEX "lab_orders_code_key" ON "lab_orders" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "lab_orders_sample_id_key" ON "lab_orders" USING btree ("sample_id");--> statement-breakpoint
CREATE INDEX "lab_orders_patient_id_idx" ON "lab_orders" USING btree ("patient_id");--> statement-breakpoint
CREATE INDEX "lab_orders_encounter_id_idx" ON "lab_orders" USING btree ("encounter_id");--> statement-breakpoint
CREATE INDEX "lab_orders_admission_id_idx" ON "lab_orders" USING btree ("admission_id");--> statement-breakpoint
CREATE INDEX "lab_orders_status_idx" ON "lab_orders" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "lab_results_lab_order_item_id_parameter_id_key" ON "lab_results" USING btree ("lab_order_item_id","parameter_id");--> statement-breakpoint
CREATE UNIQUE INDEX "lab_tests_code_key" ON "lab_tests" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "medical_records_code_key" ON "medical_records" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "medical_records_encounter_id_key" ON "medical_records" USING btree ("encounter_id");--> statement-breakpoint
CREATE INDEX "medical_records_patient_id_idx" ON "medical_records" USING btree ("patient_id");--> statement-breakpoint
CREATE INDEX "medical_records_admission_id_idx" ON "medical_records" USING btree ("admission_id");--> statement-breakpoint
CREATE INDEX "medical_records_status_idx" ON "medical_records" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "medicine_batches_medicine_id_batch_number_key" ON "medicine_batches" USING btree ("medicine_id","batch_number");--> statement-breakpoint
CREATE INDEX "medicine_batches_expiry_date_idx" ON "medicine_batches" USING btree ("expiry_date");--> statement-breakpoint
CREATE UNIQUE INDEX "medicines_code_key" ON "medicines" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "patients_uhid_key" ON "patients" USING btree ("uhid");--> statement-breakpoint
CREATE INDEX "patients_phone_idx" ON "patients" USING btree ("phone");--> statement-breakpoint
CREATE INDEX "patients_last_name_first_name_idx" ON "patients" USING btree ("last_name","first_name");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_code_key" ON "payments" USING btree ("code");--> statement-breakpoint
CREATE INDEX "payments_invoice_id_idx" ON "payments" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "payments_received_at_idx" ON "payments" USING btree ("received_at");--> statement-breakpoint
CREATE UNIQUE INDEX "pharmacy_transactions_code_key" ON "pharmacy_transactions" USING btree ("code");--> statement-breakpoint
CREATE INDEX "pharmacy_transactions_medicine_id_idx" ON "pharmacy_transactions" USING btree ("medicine_id");--> statement-breakpoint
CREATE INDEX "pharmacy_transactions_batch_id_idx" ON "pharmacy_transactions" USING btree ("batch_id");--> statement-breakpoint
CREATE INDEX "pharmacy_transactions_prescription_item_id_idx" ON "pharmacy_transactions" USING btree ("prescription_item_id");--> statement-breakpoint
CREATE INDEX "pharmacy_transactions_patient_id_idx" ON "pharmacy_transactions" USING btree ("patient_id");--> statement-breakpoint
CREATE INDEX "pharmacy_transactions_at_idx" ON "pharmacy_transactions" USING btree ("at");--> statement-breakpoint
CREATE INDEX "prescription_items_prescription_id_idx" ON "prescription_items" USING btree ("prescription_id");--> statement-breakpoint
CREATE INDEX "prescription_items_medicine_id_idx" ON "prescription_items" USING btree ("medicine_id");--> statement-breakpoint
CREATE UNIQUE INDEX "prescriptions_code_key" ON "prescriptions" USING btree ("code");--> statement-breakpoint
CREATE INDEX "prescriptions_patient_id_idx" ON "prescriptions" USING btree ("patient_id");--> statement-breakpoint
CREATE INDEX "prescriptions_encounter_id_idx" ON "prescriptions" USING btree ("encounter_id");--> statement-breakpoint
CREATE INDEX "prescriptions_admission_id_idx" ON "prescriptions" USING btree ("admission_id");--> statement-breakpoint
CREATE INDEX "prescriptions_status_idx" ON "prescriptions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "record_access_logs_medical_record_id_idx" ON "record_access_logs" USING btree ("medical_record_id");--> statement-breakpoint
CREATE UNIQUE INDEX "roles_name_key" ON "roles" USING btree ("name");--> statement-breakpoint
CREATE UNIQUE INDEX "rooms_ward_id_number_key" ON "rooms" USING btree ("ward_id","number");--> statement-breakpoint
CREATE UNIQUE INDEX "roster_staff_id_date_key" ON "roster" USING btree ("staff_id","date");--> statement-breakpoint
CREATE INDEX "roster_date_idx" ON "roster" USING btree ("date");--> statement-breakpoint
CREATE UNIQUE INDEX "shifts_code_key" ON "shifts" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "staff_staff_code_key" ON "staff" USING btree ("staff_code");--> statement-breakpoint
CREATE UNIQUE INDEX "staff_email_key" ON "staff" USING btree ("email");--> statement-breakpoint
CREATE INDEX "staff_department_id_idx" ON "staff" USING btree ("department_id");--> statement-breakpoint
CREATE INDEX "staff_role_idx" ON "staff" USING btree ("role");--> statement-breakpoint
CREATE UNIQUE INDEX "users_staff_id_key" ON "users" USING btree ("staff_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_username_key" ON "users" USING btree ("username");--> statement-breakpoint
CREATE INDEX "users_role_id_idx" ON "users" USING btree ("role_id");--> statement-breakpoint
CREATE UNIQUE INDEX "wards_code_key" ON "wards" USING btree ("code");