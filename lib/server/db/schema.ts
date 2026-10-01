/**
 * HIMS simulation — PostgreSQL schema (Drizzle ORM).
 *
 * Mirrors lib/sim/schema.ts table for table and field for field: the
 * property names are the application's row keys, the columns are
 * snake_case. Rows reference each other through real foreign keys. Value
 * objects that live inside a row — encounter vitals, diagnoses and referral,
 * a ward's admission restriction, a pending transfer, a lab test's
 * parameters — are JSON columns.
 *
 * Foreign keys are created DEFERRABLE INITIALLY DEFERRED (see
 * scripts/db/generate.mjs) so one operation can insert rows that point at
 * each other, e.g. an IPD encounter and its admission, inside a single
 * transaction.
 *
 * Timestamps are written by the application's clock (the simulation replays
 * history), so no column defaults to now() except the server's own
 * bookkeeping tables.
 */
import {
  boolean,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  type PgTableExtraConfigValue,
} from "drizzle-orm/pg-core";

/** A moment in time: UTC, millisecond precision, exchanged as text. */
const instant = (name: string) =>
  timestamp(name, { precision: 3, mode: "string" });
/** A calendar date, exchanged as YYYY-MM-DD. */
const day = (name: string) => date(name, { mode: "string" });
/** Rupees and paise. */
const money = (name: string) =>
  numeric(name, { precision: 12, scale: 2, mode: "number" });

/**
 * Server bookkeeping: one row. `version` increases with every committed
 * operation; `epoch` changes whenever the data set is replaced (reseed or
 * day re-anchoring) so clients know to reload rather than catch up.
 */
export const syncState = pgTable("sync_state", {
  id: integer("id").primaryKey().default(1),
  epoch: text("epoch").notNull(),
  version: integer("version").notNull().default(0),
  schemaVersion: integer("schema_version").notNull(),
  anchoredAt: instant("anchored_at").notNull(),
  counters: jsonb("counters").notNull().default({}),
  userChanges: integer("user_changes").notNull().default(0),
  seededAt: instant("seeded_at").notNull(),
  updatedAt: instant("updated_at")
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date().toISOString()),
});

/**
 * Every committed operation: who ran it, when, and the rows it wrote.
 * Clients replay entries after their version to stay in sync; the log also
 * serves as the audit trail of all changes.
 */
export const changeLog = pgTable(
  "change_log",
  {
    version: integer("version").primaryKey(),
    epoch: text("epoch").notNull(),
    at: instant("at").notNull().defaultNow(),
    userId: text("user_id"),
    actorId: text("actor_id"),
    operation: text("operation").notNull(),
    label: text("label").notNull(),
    changes: jsonb("changes").notNull(),
  },
  (t): PgTableExtraConfigValue[] => [
    index("change_log_epoch_version_idx").on(t.epoch, t.version),
  ]
);

// ------------------------------------------------------------------
// Controlled values
// ------------------------------------------------------------------

export const userStatusEnum = pgEnum("UserStatus", ["ACTIVE", "DISABLED"]);

export const staffRoleEnum = pgEnum("StaffRole", [
  "ADMINISTRATOR",
  "RECEPTIONIST",
  "DOCTOR",
  "NURSE",
  "PHARMACIST",
  "LAB_TECHNICIAN",
  "BILLING_EXECUTIVE",
  "MRD_STAFF",
  "OPERATIONS_MANAGER",
  "SUPPORT",
]);

export const staffStatusEnum = pgEnum("StaffStatus", [
  "ACTIVE",
  "ON_LEAVE",
  "INACTIVE",
]);

export const departmentKindEnum = pgEnum("DepartmentKind", [
  "CLINICAL",
  "DIAGNOSTIC",
  "SUPPORT",
  "ADMINISTRATIVE",
]);

export const genderEnum = pgEnum("Gender", ["MALE", "FEMALE", "OTHER"]);

export const bloodGroupEnum = pgEnum("BloodGroup", [
  "A+",
  "A-",
  "B+",
  "B-",
  "AB+",
  "AB-",
  "O+",
  "O-",
]);

export const enquiryStatusEnum = pgEnum("EnquiryStatus", [
  "NEW",
  "FOLLOW_UP_REQUIRED",
  "APPOINTMENT_SCHEDULED",
  "CONVERTED",
  "CANCELLED",
  "CLOSED",
]);

export const enquiryTypeEnum = pgEnum("EnquiryType", ["INTERNAL", "EXTERNAL"]);

export const enquirySourceEnum = pgEnum("EnquirySource", [
  "WALK_IN",
  "PHONE",
  "WEBSITE",
  "WHATSAPP",
  "REFERRAL",
  "DEPARTMENT_REFERRAL",
  "HEALTH_CAMP",
]);

export const followUpChannelEnum = pgEnum("FollowUpChannel", [
  "CALL",
  "WHATSAPP",
  "EMAIL",
  "IN_PERSON",
]);

export const appointmentStatusEnum = pgEnum("AppointmentStatus", [
  "SCHEDULED",
  "CHECKED_IN",
  "IN_CONSULTATION",
  "COMPLETED",
  "CANCELLED",
  "NO_SHOW",
]);

export const appointmentTypeEnum = pgEnum("AppointmentType", [
  "NEW",
  "FOLLOW_UP",
  "REFERRAL",
]);

export const bookingSourceEnum = pgEnum("BookingSource", [
  "ENQUIRY",
  "WALK_IN",
  "PHONE",
  "ONLINE",
  "FOLLOW_UP",
]);

export const encounterTypeEnum = pgEnum("EncounterType", ["OPD", "IPD"]);

export const encounterStatusEnum = pgEnum("EncounterStatus", [
  "OPEN",
  "CLOSED",
]);

export const opdDispositionEnum = pgEnum("OpdDisposition", [
  "SENT_HOME",
  "FOLLOW_UP",
  "REFERRED",
  "ADMISSION_ADVISED",
]);

export const admissionStatusEnum = pgEnum("AdmissionStatus", [
  "ADMITTED",
  "ACTIVE",
  "TRANSFER_PENDING",
  "DISCHARGE_PENDING",
  "DISCHARGED",
]);

export const admissionSourceEnum = pgEnum("AdmissionSource", [
  "OPD",
  "DIRECT",
  "REFERRAL",
]);

export const bedStatusEnum = pgEnum("BedStatus", [
  "AVAILABLE",
  "OCCUPIED",
  "RESERVED",
  "CLEANING",
  "MAINTENANCE",
]);

export const wardCategoryEnum = pgEnum("WardCategory", [
  "GENERAL",
  "SEMI_PRIVATE",
  "PRIVATE",
  "HDU",
]);

export const clinicalNoteTypeEnum = pgEnum("ClinicalNoteType", [
  "ADMISSION",
  "PROGRESS",
  "NURSING",
  "PROCEDURE",
]);

export const careOrderTypeEnum = pgEnum("CareOrderType", [
  "DIET",
  "NURSING",
  "MONITORING",
  "PROCEDURE",
  "ACTIVITY",
]);

export const careOrderStatusEnum = pgEnum("CareOrderStatus", [
  "ACTIVE",
  "COMPLETED",
  "DISCONTINUED",
]);

export const dischargeSummaryStatusEnum = pgEnum("DischargeSummaryStatus", [
  "DRAFT",
  "FINAL",
]);

export const medicineFormEnum = pgEnum("MedicineForm", [
  "TABLET",
  "CAPSULE",
  "SYRUP",
  "INJECTION",
  "INFUSION",
  "OINTMENT",
  "INHALER",
  "DROPS",
]);

export const frequencyEnum = pgEnum("Frequency", [
  "OD",
  "BD",
  "TDS",
  "QID",
  "HS",
  "SOS",
  "STAT",
]);

export const routeEnum = pgEnum("Route", [
  "ORAL",
  "IV",
  "IM",
  "SC",
  "TOPICAL",
  "INHALED",
  "OPHTHALMIC",
]);

export const prescriptionStatusEnum = pgEnum("PrescriptionStatus", [
  "PENDING",
  "PARTIALLY_DISPENSED",
  "DISPENSED",
  "CANCELLED",
]);

export const prescriptionItemStatusEnum = pgEnum("PrescriptionItemStatus", [
  "PENDING",
  "PARTIAL",
  "DISPENSED",
  "CANCELLED",
]);

export const pharmacyTxnTypeEnum = pgEnum("PharmacyTxnType", [
  "DISPENSE",
  "RETURN",
  "RECEIPT",
  "WRITE_OFF",
  "SALE",
]);

export const labStatusEnum = pgEnum("LabStatus", [
  "ORDERED",
  "SAMPLE_PENDING",
  "COLLECTED",
  "PROCESSING",
  "RESULT_READY",
  "VERIFIED",
  "CANCELLED",
]);

export const labPriorityEnum = pgEnum("LabPriority", [
  "ROUTINE",
  "URGENT",
  "STAT",
]);

export const sampleTypeEnum = pgEnum("SampleType", [
  "BLOOD",
  "SERUM",
  "URINE",
  "STOOL",
  "SWAB",
  "SPUTUM",
]);

export const resultFlagEnum = pgEnum("ResultFlag", [
  "NORMAL",
  "LOW",
  "HIGH",
  "CRITICAL_LOW",
  "CRITICAL_HIGH",
  "ABNORMAL",
]);

export const invoiceStatusEnum = pgEnum("InvoiceStatus", [
  "DRAFT",
  "PENDING",
  "PARTIALLY_PAID",
  "PAID",
  "REFUNDED",
  "CANCELLED",
]);

export const chargeCategoryEnum = pgEnum("ChargeCategory", [
  "REGISTRATION",
  "CONSULTATION",
  "LAB",
  "PHARMACY",
  "ROOM",
  "NURSING",
  "PROCEDURE",
  "OTHER",
]);

export const chargeSourceEnum = pgEnum("ChargeSource", [
  "APPOINTMENT",
  "REGISTRATION",
  "LAB_ORDER_ITEM",
  "PHARMACY_TXN",
  "BED_ASSIGNMENT",
  "ADMISSION",
  "MANUAL",
]);

export const paymentMethodEnum = pgEnum("PaymentMethod", [
  "CASH",
  "CARD",
  "UPI",
  "NET_BANKING",
]);

export const paymentKindEnum = pgEnum("PaymentKind", ["PAYMENT", "REFUND"]);

export const mrdRecordTypeEnum = pgEnum("MrdRecordType", [
  "OPD_CASE_SHEET",
  "IPD_CASE_FILE",
]);

export const mrdStatusEnum = pgEnum("MrdStatus", [
  "INCOMPLETE",
  "PENDING_REVIEW",
  "COMPLETE",
  "ARCHIVED",
]);

export const recordAccessActionEnum = pgEnum("RecordAccessAction", [
  "CREATED",
  "VIEWED",
  "DOCUMENT_ADDED",
  "DOCUMENT_REMOVED",
  "SUBMITTED",
  "RETURNED",
  "REVIEWED",
  "ARCHIVED",
]);

export const documentKindEnum = pgEnum("DocumentKind", [
  "CONSENT_FORM",
  "DISCHARGE_SUMMARY",
  "LAB_REPORT",
  "REFERRAL_LETTER",
  "EXTERNAL_REPORT",
  "ID_PROOF",
  "PRESCRIPTION",
  "OTHER",
]);

export const fileOwnerEnum = pgEnum("FileOwner", [
  "PATIENT_PHOTO",
  "STAFF_PHOTO",
  "DOCUMENT",
  "COMPLAINT",
]);

export const complaintStatusEnum = pgEnum("ComplaintStatus", [
  "OPEN",
  "ASSIGNED",
  "IN_PROGRESS",
  "RESOLVED",
  "CLOSED",
]);

export const complaintCategoryEnum = pgEnum("ComplaintCategory", [
  "CLINICAL_CARE",
  "STAFF_BEHAVIOUR",
  "WAITING_TIME",
  "BILLING",
  "CLEANLINESS",
  "FOOD",
  "FACILITIES",
  "OTHER",
]);

export const priorityEnum = pgEnum("Priority", [
  "LOW",
  "MEDIUM",
  "HIGH",
  "CRITICAL",
]);

export const complainantTypeEnum = pgEnum("ComplainantType", [
  "PATIENT",
  "ATTENDANT",
  "VISITOR",
  "STAFF",
]);

export const complaintNoteKindEnum = pgEnum("ComplaintNoteKind", [
  "NOTE",
  "STATUS",
]);

export const feedbackCategoryEnum = pgEnum("FeedbackCategory", [
  "DOCTOR_CONSULTATION",
  "NURSING_CARE",
  "WAITING_TIME",
  "CLEANLINESS",
  "BILLING",
  "FOOD",
  "FRONT_DESK",
  "PHARMACY",
  "LAB",
]);

export const feedbackChannelEnum = pgEnum("FeedbackChannel", [
  "KIOSK",
  "SMS_LINK",
  "IN_PERSON",
  "EMAIL",
]);

export const followUpStatusEnum = pgEnum("FollowUpStatus", [
  "NOT_REQUIRED",
  "PENDING",
  "IN_PROGRESS",
  "COMPLETED",
]);

export const rosterStatusEnum = pgEnum("RosterStatus", [
  "SCHEDULED",
  "OFF",
  "LEAVE",
]);

export const entityTypeEnum = pgEnum("EntityType", [
  "patient",
  "enquiry",
  "appointment",
  "encounter",
  "admission",
  "bed",
  "prescription",
  "pharmacy",
  "lab",
  "invoice",
  "mrd",
  "complaint",
  "feedback",
  "staff",
  "roster",
  "user",
  "role",
]);

// ------------------------------------------------------------------
// Organisation & people
// ------------------------------------------------------------------

export const departments = pgTable(
  "departments",
  {
    id: text("id").primaryKey(),
    /** Insertion order, so reloaded tables keep the order rows were created in. */
    seq: serial("seq"),
    code: text("code").notNull(),
    name: text("name").notNull(),
    kind: departmentKindEnum("kind").notNull(),
    location: text("location").notNull(),
    createdAt: instant("created_at").notNull(),
    updatedAt: instant("updated_at").notNull(),
  },
  (t): PgTableExtraConfigValue[] => [
    uniqueIndex("departments_code_key").on(t.code),
  ]
);

export const staff = pgTable(
  "staff",
  {
    id: text("id").primaryKey(),
    /** Insertion order, so reloaded tables keep the order rows were created in. */
    seq: serial("seq"),
    staffCode: text("staff_code").notNull(),
    firstName: text("first_name").notNull(),
    lastName: text("last_name").notNull(),
    role: staffRoleEnum("role").notNull(),
    departmentId: text("department_id").notNull(),
    designation: text("designation").notNull(),
    specialisation: text("specialisation"),
    qualification: text("qualification"),
    phone: text("phone").notNull(),
    email: text("email").notNull(),
    status: staffStatusEnum("status").notNull(),
    joinedOn: day("joined_on").notNull(),
    consultationFee: money("consultation_fee"),
    createdAt: instant("created_at").notNull(),
    updatedAt: instant("updated_at").notNull(),
  },
  (t): PgTableExtraConfigValue[] => [
    uniqueIndex("staff_staff_code_key").on(t.staffCode),
    uniqueIndex("staff_email_key").on(t.email),
    index("staff_department_id_idx").on(t.departmentId),
    index("staff_role_idx").on(t.role),
    foreignKey({
      name: "staff_department_id_fkey",
      columns: [t.departmentId],
      foreignColumns: [departments.id],
    }),
  ]
);

/** A login for the simulation. Every user is a staff member. */
/**
 * An access role: the modules its members can open and the actions they can
 * take (keys from lib/rbac.ts). Seeded roles keep their SYSTEM_ROLES key as
 * id; Administrators edit them and add their own from User management.
 */
export const roles = pgTable(
  "roles",
  {
    id: text("id").primaryKey(),
    /** Insertion order, so reloaded tables keep the order rows were created in. */
    seq: serial("seq"),
    name: text("name").notNull(),
    description: text("description").notNull(),
    modules: text("modules").array().notNull(),
    actions: text("actions").array().notNull(),
    /** Where members land after signing in. */
    homePath: text("home_path").notNull(),
    /** Seeded with the hospital: editable, never deleted. */
    system: boolean("system").notNull(),
    createdAt: instant("created_at").notNull(),
    updatedAt: instant("updated_at").notNull(),
  },
  (t): PgTableExtraConfigValue[] => [uniqueIndex("roles_name_key").on(t.name)]
);

/** A login: one per staff member, with one access role. */
export const users = pgTable(
  "users",
  {
    id: text("id").primaryKey(),
    /** Insertion order, so reloaded tables keep the order rows were created in. */
    seq: serial("seq"),
    staffId: text("staff_id").notNull(),
    roleId: text("role_id").notNull(),
    /** Login ID shown on the sign-in screen. */
    username: text("username").notNull(),
    status: userStatusEnum("status").notNull(),
    /** When true, modules/actions replace the role's permissions. */
    customAccess: boolean("custom_access").notNull(),
    modules: text("modules").array().notNull(),
    actions: text("actions").array().notNull(),
    createdAt: instant("created_at").notNull(),
    updatedAt: instant("updated_at").notNull(),
  },
  (t): PgTableExtraConfigValue[] => [
    uniqueIndex("users_staff_id_key").on(t.staffId),
    uniqueIndex("users_username_key").on(t.username),
    index("users_role_id_idx").on(t.roleId),
    foreignKey({
      name: "users_staff_id_fkey",
      columns: [t.staffId],
      foreignColumns: [staff.id],
    }),
    foreignKey({
      name: "users_role_id_fkey",
      columns: [t.roleId],
      foreignColumns: [roles.id],
    }),
  ]
);

export const patients = pgTable(
  "patients",
  {
    id: text("id").primaryKey(),
    /** Insertion order, so reloaded tables keep the order rows were created in. */
    seq: serial("seq"),
    uhid: text("uhid").notNull(),
    firstName: text("first_name").notNull(),
    lastName: text("last_name").notNull(),
    gender: genderEnum("gender").notNull(),
    dateOfBirth: day("date_of_birth").notNull(),
    bloodGroup: bloodGroupEnum("blood_group"),
    phone: text("phone").notNull(),
    email: text("email"),
    address: text("address").notNull(),
    city: text("city").notNull(),
    emergencyContactName: text("emergency_contact_name").notNull(),
    emergencyContactPhone: text("emergency_contact_phone").notNull(),
    allergies: text("allergies").array().notNull(),
    chronicConditions: text("chronic_conditions").array().notNull(),
    registeredAt: instant("registered_at").notNull(),
    createdAt: instant("created_at").notNull(),
    updatedAt: instant("updated_at").notNull(),
  },
  (t): PgTableExtraConfigValue[] => [
    uniqueIndex("patients_uhid_key").on(t.uhid),
    index("patients_phone_idx").on(t.phone),
    index("patients_last_name_first_name_idx").on(t.lastName, t.firstName),
  ]
);

// ------------------------------------------------------------------
// Front office
// ------------------------------------------------------------------

export const enquiries = pgTable(
  "enquiries",
  {
    id: text("id").primaryKey(),
    /** Insertion order, so reloaded tables keep the order rows were created in. */
    seq: serial("seq"),
    code: text("code").notNull(),
    type: enquiryTypeEnum("type").notNull(),
    patientId: text("patient_id"),
    prospectName: text("prospect_name").notNull(),
    phone: text("phone").notNull(),
    email: text("email"),
    source: enquirySourceEnum("source").notNull(),
    reason: text("reason").notNull(),
    departmentId: text("department_id"),
    preferredDoctorId: text("preferred_doctor_id"),
    assignedToId: text("assigned_to_id").notNull(),
    referredById: text("referred_by_id"),
    notes: text("notes").notNull(),
    followUpDate: day("follow_up_date"),
    status: enquiryStatusEnum("status").notNull(),
    appointmentId: text("appointment_id"),
    cancelReason: text("cancel_reason"),
    createdAt: instant("created_at").notNull(),
    updatedAt: instant("updated_at").notNull(),
  },
  (t): PgTableExtraConfigValue[] => [
    uniqueIndex("enquiries_code_key").on(t.code),
    index("enquiries_patient_id_idx").on(t.patientId),
    index("enquiries_status_idx").on(t.status),
    index("enquiries_assigned_to_id_idx").on(t.assignedToId),
    index("enquiries_appointment_id_idx").on(t.appointmentId),
    foreignKey({
      name: "enquiries_patient_id_fkey",
      columns: [t.patientId],
      foreignColumns: [patients.id],
    }),
    foreignKey({
      name: "enquiries_department_id_fkey",
      columns: [t.departmentId],
      foreignColumns: [departments.id],
    }),
    foreignKey({
      name: "enquiries_preferred_doctor_id_fkey",
      columns: [t.preferredDoctorId],
      foreignColumns: [staff.id],
    }),
    foreignKey({
      name: "enquiries_assigned_to_id_fkey",
      columns: [t.assignedToId],
      foreignColumns: [staff.id],
    }),
    foreignKey({
      name: "enquiries_referred_by_id_fkey",
      columns: [t.referredById],
      foreignColumns: [staff.id],
    }),
    foreignKey({
      name: "enquiries_appointment_id_fkey",
      columns: [t.appointmentId],
      foreignColumns: [appointments.id],
    }),
  ]
);

export const enquiryFollowUps = pgTable(
  "enquiry_follow_ups",
  {
    id: text("id").primaryKey(),
    /** Insertion order, so reloaded tables keep the order rows were created in. */
    seq: serial("seq"),
    enquiryId: text("enquiry_id").notNull(),
    at: instant("at").notNull(),
    byId: text("by_id").notNull(),
    channel: followUpChannelEnum("channel").notNull(),
    note: text("note").notNull(),
    nextFollowUpDate: day("next_follow_up_date"),
  },
  (t): PgTableExtraConfigValue[] => [
    index("enquiry_follow_ups_enquiry_id_idx").on(t.enquiryId),
    index("enquiry_follow_ups_by_id_idx").on(t.byId),
    foreignKey({
      name: "enquiry_follow_ups_enquiry_id_fkey",
      columns: [t.enquiryId],
      foreignColumns: [enquiries.id],
    }),
    foreignKey({
      name: "enquiry_follow_ups_by_id_fkey",
      columns: [t.byId],
      foreignColumns: [staff.id],
    }),
  ]
);

export const appointments = pgTable(
  "appointments",
  {
    id: text("id").primaryKey(),
    /** Insertion order, so reloaded tables keep the order rows were created in. */
    seq: serial("seq"),
    code: text("code").notNull(),
    patientId: text("patient_id").notNull(),
    doctorId: text("doctor_id").notNull(),
    departmentId: text("department_id").notNull(),
    scheduledAt: instant("scheduled_at").notNull(),
    slotMinutes: integer("slot_minutes").notNull(),
    type: appointmentTypeEnum("type").notNull(),
    source: bookingSourceEnum("source").notNull(),
    enquiryId: text("enquiry_id"),
    reason: text("reason").notNull(),
    status: appointmentStatusEnum("status").notNull(),
    tokenNumber: integer("token_number"),
    checkedInAt: instant("checked_in_at"),
    consultationStartedAt: instant("consultation_started_at"),
    completedAt: instant("completed_at"),
    cancelledAt: instant("cancelled_at"),
    cancelReason: text("cancel_reason"),
    encounterId: text("encounter_id"),
    rescheduledFrom: instant("rescheduled_from"),
    createdAt: instant("created_at").notNull(),
    updatedAt: instant("updated_at").notNull(),
  },
  (t): PgTableExtraConfigValue[] => [
    uniqueIndex("appointments_code_key").on(t.code),
    uniqueIndex("appointments_encounter_id_key").on(t.encounterId),
    index("appointments_patient_id_idx").on(t.patientId),
    index("appointments_doctor_id_scheduled_at_idx").on(
      t.doctorId,
      t.scheduledAt
    ),
    index("appointments_department_id_idx").on(t.departmentId),
    index("appointments_enquiry_id_idx").on(t.enquiryId),
    index("appointments_status_idx").on(t.status),
    foreignKey({
      name: "appointments_patient_id_fkey",
      columns: [t.patientId],
      foreignColumns: [patients.id],
    }),
    foreignKey({
      name: "appointments_doctor_id_fkey",
      columns: [t.doctorId],
      foreignColumns: [staff.id],
    }),
    foreignKey({
      name: "appointments_department_id_fkey",
      columns: [t.departmentId],
      foreignColumns: [departments.id],
    }),
    foreignKey({
      name: "appointments_enquiry_id_fkey",
      columns: [t.enquiryId],
      foreignColumns: [enquiries.id],
    }),
    foreignKey({
      name: "appointments_encounter_id_fkey",
      columns: [t.encounterId],
      foreignColumns: [encounters.id],
    }),
  ]
);

// ------------------------------------------------------------------
// Clinical
// ------------------------------------------------------------------

export const encounters = pgTable(
  "encounters",
  {
    id: text("id").primaryKey(),
    /** Insertion order, so reloaded tables keep the order rows were created in. */
    seq: serial("seq"),
    code: text("code").notNull(),
    patientId: text("patient_id").notNull(),
    type: encounterTypeEnum("type").notNull(),
    departmentId: text("department_id").notNull(),
    doctorId: text("doctor_id").notNull(),
    appointmentId: text("appointment_id"),
    admissionId: text("admission_id"),
    status: encounterStatusEnum("status").notNull(),
    startedAt: instant("started_at").notNull(),
    closedAt: instant("closed_at"),
    /**
     * Vitals: temperatureC, pulse, systolic, diastolic, respiratoryRate,
     * spo2, weightKg, heightCm, recordedAt, recordedById.
     */
    vitals: jsonb("vitals"),
    chiefComplaint: text("chief_complaint").notNull(),
    history: text("history").notNull(),
    examination: text("examination").notNull(),
    /** Array of { code?, description, type: PRIMARY | SECONDARY | PROVISIONAL }. */
    diagnoses: jsonb("diagnoses").notNull(),
    consultationNotes: text("consultation_notes").notNull(),
    advice: text("advice").notNull(),
    followUpDate: day("follow_up_date"),
    /** { toDepartmentId?, note } */
    referral: jsonb("referral"),
    disposition: opdDispositionEnum("disposition"),
    createdAt: instant("created_at").notNull(),
    updatedAt: instant("updated_at").notNull(),
  },
  (t): PgTableExtraConfigValue[] => [
    uniqueIndex("encounters_code_key").on(t.code),
    uniqueIndex("encounters_appointment_id_key").on(t.appointmentId),
    uniqueIndex("encounters_admission_id_key").on(t.admissionId),
    index("encounters_patient_id_idx").on(t.patientId),
    index("encounters_doctor_id_idx").on(t.doctorId),
    index("encounters_department_id_idx").on(t.departmentId),
    index("encounters_status_idx").on(t.status),
    foreignKey({
      name: "encounters_patient_id_fkey",
      columns: [t.patientId],
      foreignColumns: [patients.id],
    }),
    foreignKey({
      name: "encounters_department_id_fkey",
      columns: [t.departmentId],
      foreignColumns: [departments.id],
    }),
    foreignKey({
      name: "encounters_doctor_id_fkey",
      columns: [t.doctorId],
      foreignColumns: [staff.id],
    }),
    foreignKey({
      name: "encounters_appointment_id_fkey",
      columns: [t.appointmentId],
      foreignColumns: [appointments.id],
    }),
    foreignKey({
      name: "encounters_admission_id_fkey",
      columns: [t.admissionId],
      foreignColumns: [admissions.id],
    }),
  ]
);

export const wards = pgTable(
  "wards",
  {
    id: text("id").primaryKey(),
    /** Insertion order, so reloaded tables keep the order rows were created in. */
    seq: serial("seq"),
    code: text("code").notNull(),
    name: text("name").notNull(),
    floor: integer("floor").notNull(),
    category: wardCategoryEnum("category").notNull(),
    departmentId: text("department_id"),
    dailyRate: money("daily_rate").notNull(),
    /** { gender?, maxAge? } — single-gender wards, paediatric age limit. */
    restriction: jsonb("restriction"),
    createdAt: instant("created_at").notNull(),
    updatedAt: instant("updated_at").notNull(),
  },
  (t): PgTableExtraConfigValue[] => [
    uniqueIndex("wards_code_key").on(t.code),
    foreignKey({
      name: "wards_department_id_fkey",
      columns: [t.departmentId],
      foreignColumns: [departments.id],
    }),
  ]
);

export const rooms = pgTable(
  "rooms",
  {
    id: text("id").primaryKey(),
    /** Insertion order, so reloaded tables keep the order rows were created in. */
    seq: serial("seq"),
    wardId: text("ward_id").notNull(),
    number: text("number").notNull(),
  },
  (t): PgTableExtraConfigValue[] => [
    uniqueIndex("rooms_ward_id_number_key").on(t.wardId, t.number),
    foreignKey({
      name: "rooms_ward_id_fkey",
      columns: [t.wardId],
      foreignColumns: [wards.id],
    }),
  ]
);

export const beds = pgTable(
  "beds",
  {
    id: text("id").primaryKey(),
    /** Insertion order, so reloaded tables keep the order rows were created in. */
    seq: serial("seq"),
    roomId: text("room_id").notNull(),
    code: text("code").notNull(),
    status: bedStatusEnum("status").notNull(),
    admissionId: text("admission_id"),
    note: text("note"),
    statusChangedAt: instant("status_changed_at").notNull(),
    createdAt: instant("created_at").notNull(),
    updatedAt: instant("updated_at").notNull(),
  },
  (t): PgTableExtraConfigValue[] => [
    uniqueIndex("beds_code_key").on(t.code),
    index("beds_room_id_idx").on(t.roomId),
    index("beds_status_idx").on(t.status),
    index("beds_admission_id_idx").on(t.admissionId),
    foreignKey({
      name: "beds_room_id_fkey",
      columns: [t.roomId],
      foreignColumns: [rooms.id],
    }),
    foreignKey({
      name: "beds_admission_id_fkey",
      columns: [t.admissionId],
      foreignColumns: [admissions.id],
    }),
  ]
);

export const admissions = pgTable(
  "admissions",
  {
    id: text("id").primaryKey(),
    /** Insertion order, so reloaded tables keep the order rows were created in. */
    seq: serial("seq"),
    code: text("code").notNull(),
    patientId: text("patient_id").notNull(),
    encounterId: text("encounter_id").notNull(),
    doctorId: text("doctor_id").notNull(),
    departmentId: text("department_id").notNull(),
    source: admissionSourceEnum("source").notNull(),
    sourceEncounterId: text("source_encounter_id"),
    admittedAt: instant("admitted_at").notNull(),
    reason: text("reason").notNull(),
    provisionalDiagnosis: text("provisional_diagnosis").notNull(),
    status: admissionStatusEnum("status").notNull(),
    expectedDischargeDate: day("expected_discharge_date"),
    /** { toBedId, reason, requestedAt, requestedById } while a transfer is pending. */
    pendingTransfer: jsonb("pending_transfer"),
    dischargeInitiatedAt: instant("discharge_initiated_at"),
    /** Financial clearance from the billing desk before the patient leaves. */
    billingClearedAt: instant("billing_cleared_at"),
    billingClearedById: text("billing_cleared_by_id"),
    /** Who approved leaving with a balance, when the bill was not settled. */
    clearanceNote: text("clearance_note"),
    dischargedAt: instant("discharged_at"),
    createdAt: instant("created_at").notNull(),
    updatedAt: instant("updated_at").notNull(),
  },
  (t): PgTableExtraConfigValue[] => [
    uniqueIndex("admissions_code_key").on(t.code),
    uniqueIndex("admissions_encounter_id_key").on(t.encounterId),
    index("admissions_patient_id_idx").on(t.patientId),
    index("admissions_doctor_id_idx").on(t.doctorId),
    index("admissions_department_id_idx").on(t.departmentId),
    index("admissions_status_idx").on(t.status),
    foreignKey({
      name: "admissions_patient_id_fkey",
      columns: [t.patientId],
      foreignColumns: [patients.id],
    }),
    foreignKey({
      name: "admissions_encounter_id_fkey",
      columns: [t.encounterId],
      foreignColumns: [encounters.id],
    }),
    foreignKey({
      name: "admissions_doctor_id_fkey",
      columns: [t.doctorId],
      foreignColumns: [staff.id],
    }),
    foreignKey({
      name: "admissions_department_id_fkey",
      columns: [t.departmentId],
      foreignColumns: [departments.id],
    }),
    foreignKey({
      name: "admissions_billing_cleared_by_id_fkey",
      columns: [t.billingClearedById],
      foreignColumns: [staff.id],
    }),
    foreignKey({
      name: "admissions_source_encounter_id_fkey",
      columns: [t.sourceEncounterId],
      foreignColumns: [encounters.id],
    }),
  ]
);

export const bedAssignments = pgTable(
  "bed_assignments",
  {
    id: text("id").primaryKey(),
    /** Insertion order, so reloaded tables keep the order rows were created in. */
    seq: serial("seq"),
    admissionId: text("admission_id").notNull(),
    bedId: text("bed_id").notNull(),
    fromAt: instant("from_at").notNull(),
    toAt: instant("to_at"),
    reason: text("reason").notNull(),
    byId: text("by_id").notNull(),
  },
  (t): PgTableExtraConfigValue[] => [
    index("bed_assignments_admission_id_idx").on(t.admissionId),
    index("bed_assignments_bed_id_idx").on(t.bedId),
    foreignKey({
      name: "bed_assignments_admission_id_fkey",
      columns: [t.admissionId],
      foreignColumns: [admissions.id],
    }),
    foreignKey({
      name: "bed_assignments_bed_id_fkey",
      columns: [t.bedId],
      foreignColumns: [beds.id],
    }),
    foreignKey({
      name: "bed_assignments_by_id_fkey",
      columns: [t.byId],
      foreignColumns: [staff.id],
    }),
  ]
);

export const clinicalNotes = pgTable(
  "clinical_notes",
  {
    id: text("id").primaryKey(),
    /** Insertion order, so reloaded tables keep the order rows were created in. */
    seq: serial("seq"),
    patientId: text("patient_id").notNull(),
    encounterId: text("encounter_id").notNull(),
    admissionId: text("admission_id"),
    type: clinicalNoteTypeEnum("type").notNull(),
    authorId: text("author_id").notNull(),
    at: instant("at").notNull(),
    text: text("text").notNull(),
  },
  (t): PgTableExtraConfigValue[] => [
    index("clinical_notes_admission_id_idx").on(t.admissionId),
    index("clinical_notes_patient_id_idx").on(t.patientId),
    index("clinical_notes_encounter_id_idx").on(t.encounterId),
    foreignKey({
      name: "clinical_notes_patient_id_fkey",
      columns: [t.patientId],
      foreignColumns: [patients.id],
    }),
    foreignKey({
      name: "clinical_notes_encounter_id_fkey",
      columns: [t.encounterId],
      foreignColumns: [encounters.id],
    }),
    foreignKey({
      name: "clinical_notes_admission_id_fkey",
      columns: [t.admissionId],
      foreignColumns: [admissions.id],
    }),
    foreignKey({
      name: "clinical_notes_author_id_fkey",
      columns: [t.authorId],
      foreignColumns: [staff.id],
    }),
  ]
);

export const careOrders = pgTable(
  "care_orders",
  {
    id: text("id").primaryKey(),
    /** Insertion order, so reloaded tables keep the order rows were created in. */
    seq: serial("seq"),
    admissionId: text("admission_id").notNull(),
    type: careOrderTypeEnum("type").notNull(),
    instruction: text("instruction").notNull(),
    orderedById: text("ordered_by_id").notNull(),
    orderedAt: instant("ordered_at").notNull(),
    status: careOrderStatusEnum("status").notNull(),
    endedAt: instant("ended_at"),
    createdAt: instant("created_at").notNull(),
    updatedAt: instant("updated_at").notNull(),
  },
  (t): PgTableExtraConfigValue[] => [
    index("care_orders_admission_id_idx").on(t.admissionId),
    foreignKey({
      name: "care_orders_admission_id_fkey",
      columns: [t.admissionId],
      foreignColumns: [admissions.id],
    }),
    foreignKey({
      name: "care_orders_ordered_by_id_fkey",
      columns: [t.orderedById],
      foreignColumns: [staff.id],
    }),
  ]
);

export const dischargeSummaries = pgTable(
  "discharge_summaries",
  {
    id: text("id").primaryKey(),
    /** Insertion order, so reloaded tables keep the order rows were created in. */
    seq: serial("seq"),
    admissionId: text("admission_id").notNull(),
    patientId: text("patient_id").notNull(),
    preparedById: text("prepared_by_id").notNull(),
    finalDiagnosis: text("final_diagnosis").notNull(),
    courseInHospital: text("course_in_hospital").notNull(),
    proceduresDone: text("procedures_done").notNull(),
    conditionAtDischarge: text("condition_at_discharge").notNull(),
    dischargeMedications: text("discharge_medications").notNull(),
    followUpInstructions: text("follow_up_instructions").notNull(),
    followUpDate: day("follow_up_date"),
    status: dischargeSummaryStatusEnum("status").notNull(),
    finalisedAt: instant("finalised_at"),
    createdAt: instant("created_at").notNull(),
    updatedAt: instant("updated_at").notNull(),
  },
  (t): PgTableExtraConfigValue[] => [
    uniqueIndex("discharge_summaries_admission_id_key").on(t.admissionId),
    index("discharge_summaries_patient_id_idx").on(t.patientId),
    foreignKey({
      name: "discharge_summaries_admission_id_fkey",
      columns: [t.admissionId],
      foreignColumns: [admissions.id],
    }),
    foreignKey({
      name: "discharge_summaries_patient_id_fkey",
      columns: [t.patientId],
      foreignColumns: [patients.id],
    }),
    foreignKey({
      name: "discharge_summaries_prepared_by_id_fkey",
      columns: [t.preparedById],
      foreignColumns: [staff.id],
    }),
  ]
);

// ------------------------------------------------------------------
// Pharmacy
// ------------------------------------------------------------------

export const medicines = pgTable(
  "medicines",
  {
    id: text("id").primaryKey(),
    /** Insertion order, so reloaded tables keep the order rows were created in. */
    seq: serial("seq"),
    code: text("code").notNull(),
    name: text("name").notNull(),
    genericName: text("generic_name").notNull(),
    form: medicineFormEnum("form").notNull(),
    strength: text("strength").notNull(),
    unit: text("unit").notNull(),
    category: text("category").notNull(),
    unitPrice: money("unit_price").notNull(),
    reorderLevel: integer("reorder_level").notNull(),
    manufacturer: text("manufacturer").notNull(),
    /** Schedule H / H1 / X: never sold over the counter. */
    prescriptionOnly: boolean("prescription_only").notNull(),
    createdAt: instant("created_at").notNull(),
    updatedAt: instant("updated_at").notNull(),
  },
  (t): PgTableExtraConfigValue[] => [
    uniqueIndex("medicines_code_key").on(t.code),
  ]
);

/** Inventory is held per batch so expiry can drive FEFO dispensing. */
export const medicineBatches = pgTable(
  "medicine_batches",
  {
    id: text("id").primaryKey(),
    /** Insertion order, so reloaded tables keep the order rows were created in. */
    seq: serial("seq"),
    medicineId: text("medicine_id").notNull(),
    batchNumber: text("batch_number").notNull(),
    expiryDate: day("expiry_date").notNull(),
    quantityOnHand: integer("quantity_on_hand").notNull(),
    receivedAt: instant("received_at").notNull(),
    costPrice: money("cost_price").notNull(),
  },
  (t): PgTableExtraConfigValue[] => [
    uniqueIndex("medicine_batches_medicine_id_batch_number_key").on(
      t.medicineId,
      t.batchNumber
    ),
    index("medicine_batches_expiry_date_idx").on(t.expiryDate),
    foreignKey({
      name: "medicine_batches_medicine_id_fkey",
      columns: [t.medicineId],
      foreignColumns: [medicines.id],
    }),
  ]
);

export const prescriptions = pgTable(
  "prescriptions",
  {
    id: text("id").primaryKey(),
    /** Insertion order, so reloaded tables keep the order rows were created in. */
    seq: serial("seq"),
    code: text("code").notNull(),
    patientId: text("patient_id").notNull(),
    encounterId: text("encounter_id").notNull(),
    admissionId: text("admission_id"),
    prescriberId: text("prescriber_id").notNull(),
    status: prescriptionStatusEnum("status").notNull(),
    notes: text("notes").notNull(),
    isDischargeMedication: boolean("is_discharge_medication"),
    createdAt: instant("created_at").notNull(),
    updatedAt: instant("updated_at").notNull(),
  },
  (t): PgTableExtraConfigValue[] => [
    uniqueIndex("prescriptions_code_key").on(t.code),
    index("prescriptions_patient_id_idx").on(t.patientId),
    index("prescriptions_encounter_id_idx").on(t.encounterId),
    index("prescriptions_admission_id_idx").on(t.admissionId),
    index("prescriptions_status_idx").on(t.status),
    foreignKey({
      name: "prescriptions_patient_id_fkey",
      columns: [t.patientId],
      foreignColumns: [patients.id],
    }),
    foreignKey({
      name: "prescriptions_encounter_id_fkey",
      columns: [t.encounterId],
      foreignColumns: [encounters.id],
    }),
    foreignKey({
      name: "prescriptions_admission_id_fkey",
      columns: [t.admissionId],
      foreignColumns: [admissions.id],
    }),
    foreignKey({
      name: "prescriptions_prescriber_id_fkey",
      columns: [t.prescriberId],
      foreignColumns: [staff.id],
    }),
  ]
);

export const prescriptionItems = pgTable(
  "prescription_items",
  {
    id: text("id").primaryKey(),
    /** Insertion order, so reloaded tables keep the order rows were created in. */
    seq: serial("seq"),
    prescriptionId: text("prescription_id").notNull(),
    medicineId: text("medicine_id").notNull(),
    dose: text("dose").notNull(),
    frequency: frequencyEnum("frequency").notNull(),
    route: routeEnum("route").notNull(),
    durationDays: integer("duration_days").notNull(),
    quantityPrescribed: integer("quantity_prescribed").notNull(),
    quantityDispensed: integer("quantity_dispensed").notNull(),
    quantityReturned: integer("quantity_returned").notNull(),
    instructions: text("instructions").notNull(),
    status: prescriptionItemStatusEnum("status").notNull(),
  },
  (t): PgTableExtraConfigValue[] => [
    index("prescription_items_prescription_id_idx").on(t.prescriptionId),
    index("prescription_items_medicine_id_idx").on(t.medicineId),
    foreignKey({
      name: "prescription_items_prescription_id_fkey",
      columns: [t.prescriptionId],
      foreignColumns: [prescriptions.id],
    }),
    foreignKey({
      name: "prescription_items_medicine_id_fkey",
      columns: [t.medicineId],
      foreignColumns: [medicines.id],
    }),
  ]
);

export const pharmacyTransactions = pgTable(
  "pharmacy_transactions",
  {
    id: text("id").primaryKey(),
    /** Insertion order, so reloaded tables keep the order rows were created in. */
    seq: serial("seq"),
    code: text("code").notNull(),
    type: pharmacyTxnTypeEnum("type").notNull(),
    medicineId: text("medicine_id").notNull(),
    batchId: text("batch_id").notNull(),
    quantity: integer("quantity").notNull(),
    prescriptionItemId: text("prescription_item_id"),
    patientId: text("patient_id"),
    at: instant("at").notNull(),
    byId: text("by_id").notNull(),
    note: text("note").notNull(),
    /** Goods receipts (GRN): the supplier and their invoice number. */
    supplier: text("supplier"),
    reference: text("reference"),
  },
  (t): PgTableExtraConfigValue[] => [
    uniqueIndex("pharmacy_transactions_code_key").on(t.code),
    index("pharmacy_transactions_medicine_id_idx").on(t.medicineId),
    index("pharmacy_transactions_batch_id_idx").on(t.batchId),
    index("pharmacy_transactions_prescription_item_id_idx").on(
      t.prescriptionItemId
    ),
    index("pharmacy_transactions_patient_id_idx").on(t.patientId),
    index("pharmacy_transactions_at_idx").on(t.at),
    foreignKey({
      name: "pharmacy_transactions_medicine_id_fkey",
      columns: [t.medicineId],
      foreignColumns: [medicines.id],
    }),
    foreignKey({
      name: "pharmacy_transactions_batch_id_fkey",
      columns: [t.batchId],
      foreignColumns: [medicineBatches.id],
    }),
    foreignKey({
      name: "pharmacy_transactions_prescription_item_id_fkey",
      columns: [t.prescriptionItemId],
      foreignColumns: [prescriptionItems.id],
    }),
    foreignKey({
      name: "pharmacy_transactions_patient_id_fkey",
      columns: [t.patientId],
      foreignColumns: [patients.id],
    }),
    foreignKey({
      name: "pharmacy_transactions_by_id_fkey",
      columns: [t.byId],
      foreignColumns: [staff.id],
    }),
  ]
);

// ------------------------------------------------------------------
// Laboratory
// ------------------------------------------------------------------

export const labTests = pgTable(
  "lab_tests",
  {
    id: text("id").primaryKey(),
    /** Insertion order, so reloaded tables keep the order rows were created in. */
    seq: serial("seq"),
    code: text("code").notNull(),
    name: text("name").notNull(),
    section: text("section").notNull(),
    sampleType: sampleTypeEnum("sample_type").notNull(),
    price: money("price").notNull(),
    turnaroundHours: integer("turnaround_hours").notNull(),
    /**
     * Array of { id, name, unit, refLow?, refHigh?, criticalLow?,
     * criticalHigh?, refText?, options? }.
     */
    parameters: jsonb("parameters").notNull(),
  },
  (t): PgTableExtraConfigValue[] => [
    uniqueIndex("lab_tests_code_key").on(t.code),
  ]
);

export const labOrders = pgTable(
  "lab_orders",
  {
    id: text("id").primaryKey(),
    /** Insertion order, so reloaded tables keep the order rows were created in. */
    seq: serial("seq"),
    code: text("code").notNull(),
    patientId: text("patient_id").notNull(),
    encounterId: text("encounter_id").notNull(),
    admissionId: text("admission_id"),
    orderedById: text("ordered_by_id").notNull(),
    orderedAt: instant("ordered_at").notNull(),
    priority: labPriorityEnum("priority").notNull(),
    clinicalNotes: text("clinical_notes").notNull(),
    status: labStatusEnum("status").notNull(),
    sampleId: text("sample_id"),
    sampleRequestedAt: instant("sample_requested_at"),
    sampleCollectedAt: instant("sample_collected_at"),
    collectedById: text("collected_by_id"),
    technicianId: text("technician_id"),
    processingStartedAt: instant("processing_started_at"),
    resultEnteredAt: instant("result_entered_at"),
    verifiedAt: instant("verified_at"),
    verifiedById: text("verified_by_id"),
    cancelledAt: instant("cancelled_at"),
    cancelReason: text("cancel_reason"),
    createdAt: instant("created_at").notNull(),
    updatedAt: instant("updated_at").notNull(),
  },
  (t): PgTableExtraConfigValue[] => [
    uniqueIndex("lab_orders_code_key").on(t.code),
    uniqueIndex("lab_orders_sample_id_key").on(t.sampleId),
    index("lab_orders_patient_id_idx").on(t.patientId),
    index("lab_orders_encounter_id_idx").on(t.encounterId),
    index("lab_orders_admission_id_idx").on(t.admissionId),
    index("lab_orders_status_idx").on(t.status),
    foreignKey({
      name: "lab_orders_patient_id_fkey",
      columns: [t.patientId],
      foreignColumns: [patients.id],
    }),
    foreignKey({
      name: "lab_orders_encounter_id_fkey",
      columns: [t.encounterId],
      foreignColumns: [encounters.id],
    }),
    foreignKey({
      name: "lab_orders_admission_id_fkey",
      columns: [t.admissionId],
      foreignColumns: [admissions.id],
    }),
    foreignKey({
      name: "lab_orders_ordered_by_id_fkey",
      columns: [t.orderedById],
      foreignColumns: [staff.id],
    }),
    foreignKey({
      name: "lab_orders_collected_by_id_fkey",
      columns: [t.collectedById],
      foreignColumns: [staff.id],
    }),
    foreignKey({
      name: "lab_orders_technician_id_fkey",
      columns: [t.technicianId],
      foreignColumns: [staff.id],
    }),
    foreignKey({
      name: "lab_orders_verified_by_id_fkey",
      columns: [t.verifiedById],
      foreignColumns: [staff.id],
    }),
  ]
);

export const labOrderItems = pgTable(
  "lab_order_items",
  {
    id: text("id").primaryKey(),
    /** Insertion order, so reloaded tables keep the order rows were created in. */
    seq: serial("seq"),
    labOrderId: text("lab_order_id").notNull(),
    testId: text("test_id").notNull(),
    price: money("price").notNull(),
  },
  (t): PgTableExtraConfigValue[] => [
    index("lab_order_items_lab_order_id_idx").on(t.labOrderId),
    index("lab_order_items_test_id_idx").on(t.testId),
    foreignKey({
      name: "lab_order_items_lab_order_id_fkey",
      columns: [t.labOrderId],
      foreignColumns: [labOrders.id],
    }),
    foreignKey({
      name: "lab_order_items_test_id_fkey",
      columns: [t.testId],
      foreignColumns: [labTests.id],
    }),
  ]
);

export const labResults = pgTable(
  "lab_results",
  {
    id: text("id").primaryKey(),
    /** Insertion order, so reloaded tables keep the order rows were created in. */
    seq: serial("seq"),
    labOrderItemId: text("lab_order_item_id").notNull(),
    /** A parameter id from the test's `parameters`. */
    parameterId: text("parameter_id").notNull(),
    value: text("value").notNull(),
    flag: resultFlagEnum("flag").notNull(),
    enteredAt: instant("entered_at").notNull(),
    enteredById: text("entered_by_id").notNull(),
  },
  (t): PgTableExtraConfigValue[] => [
    uniqueIndex("lab_results_lab_order_item_id_parameter_id_key").on(
      t.labOrderItemId,
      t.parameterId
    ),
    foreignKey({
      name: "lab_results_lab_order_item_id_fkey",
      columns: [t.labOrderItemId],
      foreignColumns: [labOrderItems.id],
    }),
    foreignKey({
      name: "lab_results_entered_by_id_fkey",
      columns: [t.enteredById],
      foreignColumns: [staff.id],
    }),
  ]
);

// ------------------------------------------------------------------
// Billing
// ------------------------------------------------------------------

/** Totals are always computed from the items and payments — never stored. */
export const invoices = pgTable(
  "invoices",
  {
    id: text("id").primaryKey(),
    /** Insertion order, so reloaded tables keep the order rows were created in. */
    seq: serial("seq"),
    code: text("code").notNull(),
    patientId: text("patient_id").notNull(),
    encounterId: text("encounter_id"),
    admissionId: text("admission_id"),
    status: invoiceStatusEnum("status").notNull(),
    finalisedAt: instant("finalised_at"),
    cancelledAt: instant("cancelled_at"),
    cancelReason: text("cancel_reason"),
    notes: text("notes").notNull(),
    createdAt: instant("created_at").notNull(),
    updatedAt: instant("updated_at").notNull(),
  },
  (t): PgTableExtraConfigValue[] => [
    uniqueIndex("invoices_code_key").on(t.code),
    index("invoices_patient_id_idx").on(t.patientId),
    index("invoices_encounter_id_idx").on(t.encounterId),
    index("invoices_admission_id_idx").on(t.admissionId),
    index("invoices_status_idx").on(t.status),
    foreignKey({
      name: "invoices_patient_id_fkey",
      columns: [t.patientId],
      foreignColumns: [patients.id],
    }),
    foreignKey({
      name: "invoices_encounter_id_fkey",
      columns: [t.encounterId],
      foreignColumns: [encounters.id],
    }),
    foreignKey({
      name: "invoices_admission_id_fkey",
      columns: [t.admissionId],
      foreignColumns: [admissions.id],
    }),
  ]
);

export const invoiceItems = pgTable(
  "invoice_items",
  {
    id: text("id").primaryKey(),
    /** Insertion order, so reloaded tables keep the order rows were created in. */
    seq: serial("seq"),
    invoiceId: text("invoice_id").notNull(),
    category: chargeCategoryEnum("category").notNull(),
    description: text("description").notNull(),
    /** Negative for credits such as returned medicines. */
    quantity: integer("quantity").notNull(),
    unitPrice: money("unit_price").notNull(),
    discount: money("discount").notNull(),
    sourceType: chargeSourceEnum("source_type").notNull(),
    sourceId: text("source_id"),
    serviceDate: instant("service_date").notNull(),
    createdAt: instant("created_at").notNull(),
  },
  (t): PgTableExtraConfigValue[] => [
    index("invoice_items_invoice_id_idx").on(t.invoiceId),
    index("invoice_items_source_type_source_id_idx").on(
      t.sourceType,
      t.sourceId
    ),
    foreignKey({
      name: "invoice_items_invoice_id_fkey",
      columns: [t.invoiceId],
      foreignColumns: [invoices.id],
    }),
  ]
);

export const payments = pgTable(
  "payments",
  {
    id: text("id").primaryKey(),
    /** Insertion order, so reloaded tables keep the order rows were created in. */
    seq: serial("seq"),
    code: text("code").notNull(),
    invoiceId: text("invoice_id").notNull(),
    kind: paymentKindEnum("kind").notNull(),
    amount: money("amount").notNull(),
    method: paymentMethodEnum("method").notNull(),
    reference: text("reference").notNull(),
    receivedAt: instant("received_at").notNull(),
    receivedById: text("received_by_id").notNull(),
    note: text("note").notNull(),
  },
  (t): PgTableExtraConfigValue[] => [
    uniqueIndex("payments_code_key").on(t.code),
    index("payments_invoice_id_idx").on(t.invoiceId),
    index("payments_received_at_idx").on(t.receivedAt),
    foreignKey({
      name: "payments_invoice_id_fkey",
      columns: [t.invoiceId],
      foreignColumns: [invoices.id],
    }),
    foreignKey({
      name: "payments_received_by_id_fkey",
      columns: [t.receivedById],
      foreignColumns: [staff.id],
    }),
  ]
);

// ------------------------------------------------------------------
// Medical records
// ------------------------------------------------------------------

export const medicalRecords = pgTable(
  "medical_records",
  {
    id: text("id").primaryKey(),
    /** Insertion order, so reloaded tables keep the order rows were created in. */
    seq: serial("seq"),
    code: text("code").notNull(),
    patientId: text("patient_id").notNull(),
    encounterId: text("encounter_id").notNull(),
    admissionId: text("admission_id"),
    recordType: mrdRecordTypeEnum("record_type").notNull(),
    departmentId: text("department_id").notNull(),
    attendingDoctorId: text("attending_doctor_id").notNull(),
    status: mrdStatusEnum("status").notNull(),
    location: text("location"),
    submittedAt: instant("submitted_at"),
    reviewedAt: instant("reviewed_at"),
    reviewedById: text("reviewed_by_id"),
    archivedAt: instant("archived_at"),
    reviewNote: text("review_note"),
    createdAt: instant("created_at").notNull(),
    updatedAt: instant("updated_at").notNull(),
  },
  (t): PgTableExtraConfigValue[] => [
    uniqueIndex("medical_records_code_key").on(t.code),
    uniqueIndex("medical_records_encounter_id_key").on(t.encounterId),
    index("medical_records_patient_id_idx").on(t.patientId),
    index("medical_records_admission_id_idx").on(t.admissionId),
    index("medical_records_status_idx").on(t.status),
    foreignKey({
      name: "medical_records_patient_id_fkey",
      columns: [t.patientId],
      foreignColumns: [patients.id],
    }),
    foreignKey({
      name: "medical_records_encounter_id_fkey",
      columns: [t.encounterId],
      foreignColumns: [encounters.id],
    }),
    foreignKey({
      name: "medical_records_admission_id_fkey",
      columns: [t.admissionId],
      foreignColumns: [admissions.id],
    }),
    foreignKey({
      name: "medical_records_department_id_fkey",
      columns: [t.departmentId],
      foreignColumns: [departments.id],
    }),
    foreignKey({
      name: "medical_records_attending_doctor_id_fkey",
      columns: [t.attendingDoctorId],
      foreignColumns: [staff.id],
    }),
    foreignKey({
      name: "medical_records_reviewed_by_id_fkey",
      columns: [t.reviewedById],
      foreignColumns: [staff.id],
    }),
  ]
);

export const recordAccessLogs = pgTable(
  "record_access_logs",
  {
    id: text("id").primaryKey(),
    /** Insertion order, so reloaded tables keep the order rows were created in. */
    seq: serial("seq"),
    medicalRecordId: text("medical_record_id").notNull(),
    at: instant("at").notNull(),
    byId: text("by_id").notNull(),
    action: recordAccessActionEnum("action").notNull(),
    note: text("note"),
  },
  (t): PgTableExtraConfigValue[] => [
    index("record_access_logs_medical_record_id_idx").on(t.medicalRecordId),
    foreignKey({
      name: "record_access_logs_medical_record_id_fkey",
      columns: [t.medicalRecordId],
      foreignColumns: [medicalRecords.id],
    }),
    foreignKey({
      name: "record_access_logs_by_id_fkey",
      columns: [t.byId],
      foreignColumns: [staff.id],
    }),
  ]
);

export const documents = pgTable(
  "documents",
  {
    id: text("id").primaryKey(),
    /** Insertion order, so reloaded tables keep the order rows were created in. */
    seq: serial("seq"),
    patientId: text("patient_id").notNull(),
    encounterId: text("encounter_id"),
    admissionId: text("admission_id"),
    title: text("title").notNull(),
    kind: documentKindEnum("kind").notNull(),
    fileName: text("file_name").notNull(),
    sizeKb: integer("size_kb").notNull(),
    uploadedAt: instant("uploaded_at").notNull(),
    uploadedById: text("uploaded_by_id").notNull(),
    /** Generated documents (discharge summary, lab report) point at their source. */
    sourceId: text("source_id"),
  },
  (t): PgTableExtraConfigValue[] => [
    index("documents_patient_id_idx").on(t.patientId),
    index("documents_admission_id_idx").on(t.admissionId),
    index("documents_encounter_id_idx").on(t.encounterId),
    foreignKey({
      name: "documents_patient_id_fkey",
      columns: [t.patientId],
      foreignColumns: [patients.id],
    }),
    foreignKey({
      name: "documents_encounter_id_fkey",
      columns: [t.encounterId],
      foreignColumns: [encounters.id],
    }),
    foreignKey({
      name: "documents_admission_id_fkey",
      columns: [t.admissionId],
      foreignColumns: [admissions.id],
    }),
    foreignKey({
      name: "documents_uploaded_by_id_fkey",
      columns: [t.uploadedById],
      foreignColumns: [staff.id],
    }),
  ]
);

/**
 * Uploaded file content. `owner_id` points at a patient, staff member,
 * document or complaint depending on `owner_type`, so it is checked by the
 * application's integrity rules rather than a foreign key.
 */
export const files = pgTable(
  "files",
  {
    id: text("id").primaryKey(),
    /** Insertion order, so reloaded tables keep the order rows were created in. */
    seq: serial("seq"),
    ownerType: fileOwnerEnum("owner_type").notNull(),
    ownerId: text("owner_id").notNull(),
    name: text("name").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeKb: integer("size_kb").notNull(),
    data: text("data").notNull(),
    uploadedAt: instant("uploaded_at").notNull(),
    uploadedById: text("uploaded_by_id").notNull(),
  },
  (t): PgTableExtraConfigValue[] => [
    index("files_owner_idx").on(t.ownerType, t.ownerId),
    foreignKey({
      name: "files_uploaded_by_id_fkey",
      columns: [t.uploadedById],
      foreignColumns: [staff.id],
    }),
  ]
);

// ------------------------------------------------------------------
// Service quality
// ------------------------------------------------------------------

export const complaints = pgTable(
  "complaints",
  {
    id: text("id").primaryKey(),
    /** Insertion order, so reloaded tables keep the order rows were created in. */
    seq: serial("seq"),
    code: text("code").notNull(),
    patientId: text("patient_id"),
    complainantName: text("complainant_name").notNull(),
    complainantType: complainantTypeEnum("complainant_type").notNull(),
    contact: text("contact").notNull(),
    encounterId: text("encounter_id"),
    category: complaintCategoryEnum("category").notNull(),
    departmentId: text("department_id").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull(),
    priority: priorityEnum("priority").notNull(),
    assignedToId: text("assigned_to_id"),
    dueDate: day("due_date").notNull(),
    status: complaintStatusEnum("status").notNull(),
    resolution: text("resolution"),
    resolvedAt: instant("resolved_at"),
    closedAt: instant("closed_at"),
    loggedById: text("logged_by_id").notNull(),
    createdAt: instant("created_at").notNull(),
    updatedAt: instant("updated_at").notNull(),
  },
  (t): PgTableExtraConfigValue[] => [
    uniqueIndex("complaints_code_key").on(t.code),
    index("complaints_patient_id_idx").on(t.patientId),
    index("complaints_department_id_idx").on(t.departmentId),
    index("complaints_status_idx").on(t.status),
    foreignKey({
      name: "complaints_patient_id_fkey",
      columns: [t.patientId],
      foreignColumns: [patients.id],
    }),
    foreignKey({
      name: "complaints_encounter_id_fkey",
      columns: [t.encounterId],
      foreignColumns: [encounters.id],
    }),
    foreignKey({
      name: "complaints_department_id_fkey",
      columns: [t.departmentId],
      foreignColumns: [departments.id],
    }),
    foreignKey({
      name: "complaints_assigned_to_id_fkey",
      columns: [t.assignedToId],
      foreignColumns: [staff.id],
    }),
    foreignKey({
      name: "complaints_logged_by_id_fkey",
      columns: [t.loggedById],
      foreignColumns: [staff.id],
    }),
  ]
);

export const complaintNotes = pgTable(
  "complaint_notes",
  {
    id: text("id").primaryKey(),
    /** Insertion order, so reloaded tables keep the order rows were created in. */
    seq: serial("seq"),
    complaintId: text("complaint_id").notNull(),
    at: instant("at").notNull(),
    byId: text("by_id").notNull(),
    text: text("text").notNull(),
    kind: complaintNoteKindEnum("kind").notNull(),
  },
  (t): PgTableExtraConfigValue[] => [
    index("complaint_notes_complaint_id_idx").on(t.complaintId),
    foreignKey({
      name: "complaint_notes_complaint_id_fkey",
      columns: [t.complaintId],
      foreignColumns: [complaints.id],
    }),
    foreignKey({
      name: "complaint_notes_by_id_fkey",
      columns: [t.byId],
      foreignColumns: [staff.id],
    }),
  ]
);

export const feedback = pgTable(
  "feedback",
  {
    id: text("id").primaryKey(),
    /** Insertion order, so reloaded tables keep the order rows were created in. */
    seq: serial("seq"),
    code: text("code").notNull(),
    /** Absent when the feedback was given anonymously. */
    patientId: text("patient_id"),
    encounterId: text("encounter_id"),
    departmentId: text("department_id").notNull(),
    doctorId: text("doctor_id"),
    rating: integer("rating").notNull(),
    categories: feedbackCategoryEnum("categories").array().notNull(),
    comments: text("comments").notNull(),
    channel: feedbackChannelEnum("channel").notNull(),
    submittedAt: instant("submitted_at").notNull(),
    followUpRequired: boolean("follow_up_required").notNull(),
    followUpStatus: followUpStatusEnum("follow_up_status").notNull(),
    followUpNote: text("follow_up_note"),
    followUpById: text("follow_up_by_id"),
    createdAt: instant("created_at").notNull(),
    updatedAt: instant("updated_at").notNull(),
  },
  (t): PgTableExtraConfigValue[] => [
    uniqueIndex("feedback_code_key").on(t.code),
    index("feedback_patient_id_idx").on(t.patientId),
    index("feedback_department_id_idx").on(t.departmentId),
    index("feedback_submitted_at_idx").on(t.submittedAt),
    foreignKey({
      name: "feedback_patient_id_fkey",
      columns: [t.patientId],
      foreignColumns: [patients.id],
    }),
    foreignKey({
      name: "feedback_encounter_id_fkey",
      columns: [t.encounterId],
      foreignColumns: [encounters.id],
    }),
    foreignKey({
      name: "feedback_department_id_fkey",
      columns: [t.departmentId],
      foreignColumns: [departments.id],
    }),
    foreignKey({
      name: "feedback_doctor_id_fkey",
      columns: [t.doctorId],
      foreignColumns: [staff.id],
    }),
    foreignKey({
      name: "feedback_follow_up_by_id_fkey",
      columns: [t.followUpById],
      foreignColumns: [staff.id],
    }),
  ]
);

// ------------------------------------------------------------------
// Workforce
// ------------------------------------------------------------------

export const shifts = pgTable(
  "shifts",
  {
    id: text("id").primaryKey(),
    /** Insertion order, so reloaded tables keep the order rows were created in. */
    seq: serial("seq"),
    code: text("code").notNull(),
    name: text("name").notNull(),
    /** "HH:mm", local time. */
    start: text("start").notNull(),
    end: text("end").notNull(),
  },
  (t): PgTableExtraConfigValue[] => [uniqueIndex("shifts_code_key").on(t.code)]
);

export const roster = pgTable(
  "roster",
  {
    id: text("id").primaryKey(),
    /** Insertion order, so reloaded tables keep the order rows were created in. */
    seq: serial("seq"),
    staffId: text("staff_id").notNull(),
    date: day("date").notNull(),
    status: rosterStatusEnum("status").notNull(),
    /** Present when SCHEDULED. */
    shiftId: text("shift_id"),
    departmentId: text("department_id").notNull(),
    note: text("note"),
  },
  (t): PgTableExtraConfigValue[] => [
    uniqueIndex("roster_staff_id_date_key").on(t.staffId, t.date),
    index("roster_date_idx").on(t.date),
    foreignKey({
      name: "roster_staff_id_fkey",
      columns: [t.staffId],
      foreignColumns: [staff.id],
    }),
    foreignKey({
      name: "roster_shift_id_fkey",
      columns: [t.shiftId],
      foreignColumns: [shifts.id],
    }),
    foreignKey({
      name: "roster_department_id_fkey",
      columns: [t.departmentId],
      foreignColumns: [departments.id],
    }),
  ]
);

// ------------------------------------------------------------------
// Activity
// ------------------------------------------------------------------

/** Append-only activity trail; feeds timelines and the operations feed. */
export const activity = pgTable(
  "activity",
  {
    id: text("id").primaryKey(),
    /** Insertion order, so reloaded tables keep the order rows were created in. */
    seq: serial("seq"),
    at: instant("at").notNull(),
    actorId: text("actor_id").notNull(),
    entityType: entityTypeEnum("entity_type").notNull(),
    /** Polymorphic: the id of a row in the table named by entityType. */
    entityId: text("entity_id").notNull(),
    patientId: text("patient_id"),
    action: text("action").notNull(),
    summary: text("summary").notNull(),
  },
  (t): PgTableExtraConfigValue[] => [
    index("activity_at_idx").on(t.at),
    index("activity_patient_id_idx").on(t.patientId),
    index("activity_entity_type_entity_id_idx").on(t.entityType, t.entityId),
    foreignKey({
      name: "activity_actor_id_fkey",
      columns: [t.actorId],
      foreignColumns: [staff.id],
    }),
    foreignKey({
      name: "activity_patient_id_fkey",
      columns: [t.patientId],
      foreignColumns: [patients.id],
    }),
  ]
);
