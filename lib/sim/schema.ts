/**
 * HIMS simulation — relational schema.
 *
 * Every table is a flat array of rows keyed by a string `id`. Rows reference
 * each other by id only (never by copied names), so a patient, a staff member
 * or a bed exists exactly once and every module reads the same record.
 *
 * Values that can be derived (invoice totals, bed occupancy, stock on hand per
 * medicine, MRD completeness) are computed from the rows rather than stored,
 * so they can never disagree with the data they summarise.
 *
 * Timestamps are ISO-8601 strings. Calendar-only values (date of birth, roster
 * date) are `YYYY-MM-DD`.
 */

export type ID = string;
export type ISODateTime = string;
export type ISODate = string;

interface Timestamps {
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

/* ------------------------------------------------------------------ */
/* Controlled values                                                   */
/* ------------------------------------------------------------------ */

/**
 * The access roles every hospital starts with — the ids of the seeded
 * `roles` rows. Administrators can edit them and add more; what a role may
 * open and do is data (see lib/rbac.ts), not code.
 */
export const SYSTEM_ROLES = [
  "ADMINISTRATOR",
  "RECEPTIONIST",
  "DOCTOR",
  "NURSE",
  "PHARMACIST",
  "LAB_TECHNICIAN",
  "BILLING_EXECUTIVE",
  "MRD_STAFF",
  "OPERATIONS_MANAGER",
] as const;
export type SystemRole = (typeof SYSTEM_ROLES)[number];

/**
 * A staff member's job — what they are (a doctor, a nurse…), which decides
 * clinical duties such as who can consult. What a login may do comes from
 * its access role instead.
 */
export const STAFF_ROLES = [...SYSTEM_ROLES, "SUPPORT"] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

export const USER_STATUSES = ["ACTIVE", "DISABLED"] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

export const STAFF_STATUSES = ["ACTIVE", "ON_LEAVE", "INACTIVE"] as const;
export type StaffStatus = (typeof STAFF_STATUSES)[number];

export const DEPARTMENT_KINDS = [
  "CLINICAL",
  "DIAGNOSTIC",
  "SUPPORT",
  "ADMINISTRATIVE",
] as const;
export type DepartmentKind = (typeof DEPARTMENT_KINDS)[number];

export const GENDERS = ["MALE", "FEMALE", "OTHER"] as const;
export type Gender = (typeof GENDERS)[number];

export const BLOOD_GROUPS = [
  "A+",
  "A-",
  "B+",
  "B-",
  "AB+",
  "AB-",
  "O+",
  "O-",
] as const;
export type BloodGroup = (typeof BLOOD_GROUPS)[number];

export const ENQUIRY_STATUSES = [
  "NEW",
  "FOLLOW_UP_REQUIRED",
  "APPOINTMENT_SCHEDULED",
  "CONVERTED",
  "CANCELLED",
  "CLOSED",
] as const;
export type EnquiryStatus = (typeof ENQUIRY_STATUSES)[number];

export const ENQUIRY_TYPES = ["INTERNAL", "EXTERNAL"] as const;
export type EnquiryType = (typeof ENQUIRY_TYPES)[number];

export const ENQUIRY_SOURCES = [
  "WALK_IN",
  "PHONE",
  "WEBSITE",
  "WHATSAPP",
  "REFERRAL",
  "DEPARTMENT_REFERRAL",
  "HEALTH_CAMP",
] as const;
export type EnquirySource = (typeof ENQUIRY_SOURCES)[number];

export const FOLLOW_UP_CHANNELS = [
  "CALL",
  "WHATSAPP",
  "EMAIL",
  "IN_PERSON",
] as const;
export type FollowUpChannel = (typeof FOLLOW_UP_CHANNELS)[number];

export const APPOINTMENT_STATUSES = [
  "SCHEDULED",
  "CHECKED_IN",
  "IN_CONSULTATION",
  "COMPLETED",
  "CANCELLED",
  "NO_SHOW",
] as const;
export type AppointmentStatus = (typeof APPOINTMENT_STATUSES)[number];

export const APPOINTMENT_TYPES = ["NEW", "FOLLOW_UP", "REFERRAL"] as const;
export type AppointmentType = (typeof APPOINTMENT_TYPES)[number];

export const BOOKING_SOURCES = [
  "ENQUIRY",
  "WALK_IN",
  "PHONE",
  "ONLINE",
  "FOLLOW_UP",
] as const;
export type BookingSource = (typeof BOOKING_SOURCES)[number];

export const ENCOUNTER_TYPES = ["OPD", "IPD"] as const;
export type EncounterType = (typeof ENCOUNTER_TYPES)[number];

export const ENCOUNTER_STATUSES = ["OPEN", "CLOSED"] as const;
export type EncounterStatus = (typeof ENCOUNTER_STATUSES)[number];

export const OPD_DISPOSITIONS = [
  "SENT_HOME",
  "FOLLOW_UP",
  "REFERRED",
  "ADMISSION_ADVISED",
] as const;
export type OpdDisposition = (typeof OPD_DISPOSITIONS)[number];

export const ADMISSION_STATUSES = [
  "ADMITTED",
  "ACTIVE",
  "TRANSFER_PENDING",
  "DISCHARGE_PENDING",
  "DISCHARGED",
] as const;
export type AdmissionStatus = (typeof ADMISSION_STATUSES)[number];

export const ADMISSION_SOURCES = ["OPD", "DIRECT", "REFERRAL"] as const;
export type AdmissionSource = (typeof ADMISSION_SOURCES)[number];

export const BED_STATUSES = [
  "AVAILABLE",
  "OCCUPIED",
  "RESERVED",
  "CLEANING",
  "MAINTENANCE",
] as const;
export type BedStatus = (typeof BED_STATUSES)[number];

export const WARD_CATEGORIES = [
  "GENERAL",
  "SEMI_PRIVATE",
  "PRIVATE",
  "HDU",
] as const;
export type WardCategory = (typeof WARD_CATEGORIES)[number];

export const NOTE_TYPES = [
  "ADMISSION",
  "PROGRESS",
  "NURSING",
  "PROCEDURE",
] as const;
export type ClinicalNoteType = (typeof NOTE_TYPES)[number];

export const CARE_ORDER_TYPES = [
  "DIET",
  "NURSING",
  "MONITORING",
  "PROCEDURE",
  "ACTIVITY",
] as const;
export type CareOrderType = (typeof CARE_ORDER_TYPES)[number];

export const CARE_ORDER_STATUSES = [
  "ACTIVE",
  "COMPLETED",
  "DISCONTINUED",
] as const;
export type CareOrderStatus = (typeof CARE_ORDER_STATUSES)[number];

export const MEDICINE_FORMS = [
  "TABLET",
  "CAPSULE",
  "SYRUP",
  "INJECTION",
  "INFUSION",
  "OINTMENT",
  "INHALER",
  "DROPS",
] as const;
export type MedicineForm = (typeof MEDICINE_FORMS)[number];

export const FREQUENCIES = [
  "OD",
  "BD",
  "TDS",
  "QID",
  "HS",
  "SOS",
  "STAT",
] as const;
export type Frequency = (typeof FREQUENCIES)[number];

export const ROUTES = [
  "ORAL",
  "IV",
  "IM",
  "SC",
  "TOPICAL",
  "INHALED",
  "OPHTHALMIC",
] as const;
export type Route = (typeof ROUTES)[number];

export const PRESCRIPTION_STATUSES = [
  "PENDING",
  "PARTIALLY_DISPENSED",
  "DISPENSED",
  "CANCELLED",
] as const;
export type PrescriptionStatus = (typeof PRESCRIPTION_STATUSES)[number];

export const PRESCRIPTION_ITEM_STATUSES = [
  "PENDING",
  "PARTIAL",
  "DISPENSED",
  "CANCELLED",
] as const;
export type PrescriptionItemStatus =
  (typeof PRESCRIPTION_ITEM_STATUSES)[number];

export const PHARMACY_TXN_TYPES = [
  "DISPENSE",
  "RETURN",
  "RECEIPT",
  "WRITE_OFF",
  /** Over-the-counter sale without a prescription. */
  "SALE",
] as const;
export type PharmacyTxnType = (typeof PHARMACY_TXN_TYPES)[number];

export const LAB_STATUSES = [
  "ORDERED",
  "SAMPLE_PENDING",
  "COLLECTED",
  "PROCESSING",
  "RESULT_READY",
  "VERIFIED",
  "CANCELLED",
] as const;
export type LabStatus = (typeof LAB_STATUSES)[number];

export const LAB_PRIORITIES = ["ROUTINE", "URGENT", "STAT"] as const;
export type LabPriority = (typeof LAB_PRIORITIES)[number];

export const SAMPLE_TYPES = [
  "BLOOD",
  "SERUM",
  "URINE",
  "STOOL",
  "SWAB",
  "SPUTUM",
] as const;
export type SampleType = (typeof SAMPLE_TYPES)[number];

export const RESULT_FLAGS = [
  "NORMAL",
  "LOW",
  "HIGH",
  "CRITICAL_LOW",
  "CRITICAL_HIGH",
  "ABNORMAL",
] as const;
export type ResultFlag = (typeof RESULT_FLAGS)[number];

export const INVOICE_STATUSES = [
  "DRAFT",
  "PENDING",
  "PARTIALLY_PAID",
  "PAID",
  "REFUNDED",
  "CANCELLED",
] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

export const CHARGE_CATEGORIES = [
  "REGISTRATION",
  "CONSULTATION",
  "LAB",
  "PHARMACY",
  "ROOM",
  "NURSING",
  "PROCEDURE",
  "OTHER",
] as const;
export type ChargeCategory = (typeof CHARGE_CATEGORIES)[number];

export const CHARGE_SOURCES = [
  "APPOINTMENT",
  "REGISTRATION",
  "LAB_ORDER_ITEM",
  "PHARMACY_TXN",
  "BED_ASSIGNMENT",
  "ADMISSION",
  "MANUAL",
] as const;
export type ChargeSource = (typeof CHARGE_SOURCES)[number];

export const PAYMENT_METHODS = ["CASH", "CARD", "UPI", "NET_BANKING"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const MRD_RECORD_TYPES = ["OPD_CASE_SHEET", "IPD_CASE_FILE"] as const;
export type MrdRecordType = (typeof MRD_RECORD_TYPES)[number];

export const MRD_STATUSES = [
  "INCOMPLETE",
  "PENDING_REVIEW",
  "COMPLETE",
  "ARCHIVED",
] as const;
export type MrdStatus = (typeof MRD_STATUSES)[number];

export const DOCUMENT_KINDS = [
  "CONSENT_FORM",
  "DISCHARGE_SUMMARY",
  "LAB_REPORT",
  "REFERRAL_LETTER",
  "EXTERNAL_REPORT",
  "ID_PROOF",
  "PRESCRIPTION",
  "OTHER",
] as const;
export type DocumentKind = (typeof DOCUMENT_KINDS)[number];

/** What an uploaded file belongs to (its `ownerId` points at that row). */
export const FILE_OWNERS = [
  "PATIENT_PHOTO",
  "STAFF_PHOTO",
  "DOCUMENT",
  "COMPLAINT",
] as const;
export type FileOwner = (typeof FILE_OWNERS)[number];

export const COMPLAINT_STATUSES = [
  "OPEN",
  "ASSIGNED",
  "IN_PROGRESS",
  "RESOLVED",
  "CLOSED",
] as const;
export type ComplaintStatus = (typeof COMPLAINT_STATUSES)[number];

export const COMPLAINT_CATEGORIES = [
  "CLINICAL_CARE",
  "STAFF_BEHAVIOUR",
  "WAITING_TIME",
  "BILLING",
  "CLEANLINESS",
  "FOOD",
  "FACILITIES",
  "OTHER",
] as const;
export type ComplaintCategory = (typeof COMPLAINT_CATEGORIES)[number];

export const PRIORITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
export type Priority = (typeof PRIORITIES)[number];

export const COMPLAINANT_TYPES = [
  "PATIENT",
  "ATTENDANT",
  "VISITOR",
  "STAFF",
] as const;
export type ComplainantType = (typeof COMPLAINANT_TYPES)[number];

export const FEEDBACK_CATEGORIES = [
  "DOCTOR_CONSULTATION",
  "NURSING_CARE",
  "WAITING_TIME",
  "CLEANLINESS",
  "BILLING",
  "FOOD",
  "FRONT_DESK",
  "PHARMACY",
  "LAB",
] as const;
export type FeedbackCategory = (typeof FEEDBACK_CATEGORIES)[number];

export const FEEDBACK_CHANNELS = [
  "KIOSK",
  "SMS_LINK",
  "IN_PERSON",
  "EMAIL",
] as const;
export type FeedbackChannel = (typeof FEEDBACK_CHANNELS)[number];

export const FOLLOW_UP_STATUSES = [
  "NOT_REQUIRED",
  "PENDING",
  "IN_PROGRESS",
  "COMPLETED",
] as const;
export type FollowUpStatus = (typeof FOLLOW_UP_STATUSES)[number];

export const ROSTER_STATUSES = ["SCHEDULED", "OFF", "LEAVE"] as const;
export type RosterStatus = (typeof ROSTER_STATUSES)[number];

/* ------------------------------------------------------------------ */
/* Organisation & people                                               */
/* ------------------------------------------------------------------ */

export interface Department extends Timestamps {
  id: ID;
  code: string;
  name: string;
  kind: DepartmentKind;
  /** OPD consultation room or desk location shown on tokens. */
  location: string;
}

export interface Staff extends Timestamps {
  id: ID;
  staffCode: string;
  firstName: string;
  lastName: string;
  role: StaffRole;
  departmentId: ID;
  designation: string;
  specialisation?: string;
  qualification?: string;
  phone: string;
  email: string;
  status: StaffStatus;
  joinedOn: ISODate;
  /** Doctors only: OPD consultation fee in INR. */
  consultationFee?: number;
}

/**
 * An access role: the modules its members can open and the actions they can
 * take. Seeded roles use their SYSTEM_ROLES key as id and cannot be deleted;
 * the Administrator role always has full access.
 */
export interface Role extends Timestamps {
  id: ID;
  name: string;
  description: string;
  /** Module keys (lib/rbac.ts MODULES). */
  modules: string[];
  /** Action keys (lib/rbac.ts ACTIONS). */
  actions: string[];
  /** Where members land after signing in. */
  homePath: string;
  system: boolean;
}

/** A login. Every user is a staff member with one access role. */
export interface User extends Timestamps {
  id: ID;
  staffId: ID;
  roleId: ID;
  /** Login ID shown on the sign-in screen, e.g. "kavya.rao". */
  username: string;
  /** Disabled logins cannot sign in; their history stays attributed. */
  status: UserStatus;
  /**
   * When true, `modules` and `actions` replace the role's permissions for
   * this user alone (both are empty otherwise).
   */
  customAccess: boolean;
  modules: string[];
  actions: string[];
}

export interface Patient extends Timestamps {
  id: ID;
  /** Unique hospital ID, e.g. HMS-24-000123. */
  uhid: string;
  firstName: string;
  lastName: string;
  gender: Gender;
  dateOfBirth: ISODate;
  bloodGroup?: BloodGroup;
  phone: string;
  email?: string;
  address: string;
  city: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
  allergies: string[];
  chronicConditions: string[];
  registeredAt: ISODateTime;
}

/* ------------------------------------------------------------------ */
/* Front office                                                        */
/* ------------------------------------------------------------------ */

export interface Enquiry extends Timestamps {
  id: ID;
  code: string;
  type: EnquiryType;
  /** Set when the enquirer is (or becomes) a registered patient. */
  patientId?: ID;
  /** Prospect details, kept until the enquiry is linked to a patient. */
  prospectName: string;
  phone: string;
  email?: string;
  source: EnquirySource;
  reason: string;
  departmentId?: ID;
  preferredDoctorId?: ID;
  assignedToId: ID;
  /** Internal enquiries: who raised it on behalf of the patient. */
  referredById?: ID;
  notes: string;
  followUpDate?: ISODate;
  status: EnquiryStatus;
  appointmentId?: ID;
  cancelReason?: string;
}

export interface EnquiryFollowUp {
  id: ID;
  enquiryId: ID;
  at: ISODateTime;
  byId: ID;
  channel: FollowUpChannel;
  note: string;
  nextFollowUpDate?: ISODate;
}

export interface Appointment extends Timestamps {
  id: ID;
  code: string;
  patientId: ID;
  doctorId: ID;
  departmentId: ID;
  scheduledAt: ISODateTime;
  slotMinutes: number;
  type: AppointmentType;
  source: BookingSource;
  enquiryId?: ID;
  reason: string;
  status: AppointmentStatus;
  /** Queue token, issued at check-in (per doctor per day). */
  tokenNumber?: number;
  checkedInAt?: ISODateTime;
  consultationStartedAt?: ISODateTime;
  completedAt?: ISODateTime;
  cancelledAt?: ISODateTime;
  cancelReason?: string;
  /** The OPD encounter opened at check-in. */
  encounterId?: ID;
  rescheduledFrom?: ISODateTime;
}

/* ------------------------------------------------------------------ */
/* Clinical                                                            */
/* ------------------------------------------------------------------ */

export interface Vitals {
  temperatureC?: number;
  pulse?: number;
  systolic?: number;
  diastolic?: number;
  respiratoryRate?: number;
  spo2?: number;
  weightKg?: number;
  heightCm?: number;
  recordedAt: ISODateTime;
  recordedById: ID;
}

export interface Diagnosis {
  code?: string;
  description: string;
  type: "PRIMARY" | "SECONDARY" | "PROVISIONAL";
}

/**
 * One patient contact. OPD encounters open at check-in and close at visit
 * closure; IPD encounters span an admission. Clinical documentation for the
 * OPD visit lives on the encounter itself (the OPD record).
 */
export interface Encounter extends Timestamps {
  id: ID;
  code: string;
  patientId: ID;
  type: EncounterType;
  departmentId: ID;
  doctorId: ID;
  appointmentId?: ID;
  admissionId?: ID;
  status: EncounterStatus;
  startedAt: ISODateTime;
  closedAt?: ISODateTime;
  vitals?: Vitals;
  chiefComplaint: string;
  history: string;
  examination: string;
  diagnoses: Diagnosis[];
  consultationNotes: string;
  advice: string;
  followUpDate?: ISODate;
  referral?: { toDepartmentId?: ID; note: string };
  disposition?: OpdDisposition;
}

export interface Ward extends Timestamps {
  id: ID;
  code: string;
  name: string;
  floor: number;
  category: WardCategory;
  departmentId?: ID;
  /** Room charge per bed-day in INR. */
  dailyRate: number;
  /** Who the ward may take: single-gender wards, paediatric age limit. */
  restriction?: { gender?: Gender; maxAge?: number };
}

export interface Room {
  id: ID;
  wardId: ID;
  number: string;
}

export interface Bed extends Timestamps {
  id: ID;
  roomId: ID;
  code: string;
  status: BedStatus;
  /** Set only while OCCUPIED (the admission in the bed) or RESERVED for one. */
  admissionId?: ID;
  note?: string;
  statusChangedAt: ISODateTime;
}

export interface Admission extends Timestamps {
  id: ID;
  code: string;
  patientId: ID;
  /** The IPD encounter spanning this admission. */
  encounterId: ID;
  doctorId: ID;
  departmentId: ID;
  source: AdmissionSource;
  /** The OPD encounter that advised admission, when there was one. */
  sourceEncounterId?: ID;
  admittedAt: ISODateTime;
  reason: string;
  provisionalDiagnosis: string;
  status: AdmissionStatus;
  expectedDischargeDate?: ISODate;
  pendingTransfer?: {
    toBedId: ID;
    reason: string;
    requestedAt: ISODateTime;
    requestedById: ID;
  };
  dischargeInitiatedAt?: ISODateTime;
  /** Financial clearance from the billing desk before the patient leaves. */
  billingClearedAt?: ISODateTime;
  billingClearedById?: ID;
  /** Who approved leaving with a balance, when the bill was not settled. */
  clearanceNote?: string;
  dischargedAt?: ISODateTime;
}

export interface BedAssignment {
  id: ID;
  admissionId: ID;
  bedId: ID;
  fromAt: ISODateTime;
  toAt?: ISODateTime;
  reason: string;
  byId: ID;
}

export interface ClinicalNote {
  id: ID;
  patientId: ID;
  encounterId: ID;
  admissionId?: ID;
  type: ClinicalNoteType;
  authorId: ID;
  at: ISODateTime;
  text: string;
}

export interface CareOrder extends Timestamps {
  id: ID;
  admissionId: ID;
  type: CareOrderType;
  instruction: string;
  orderedById: ID;
  orderedAt: ISODateTime;
  status: CareOrderStatus;
  endedAt?: ISODateTime;
}

export interface DischargeSummary extends Timestamps {
  id: ID;
  admissionId: ID;
  patientId: ID;
  preparedById: ID;
  finalDiagnosis: string;
  courseInHospital: string;
  proceduresDone: string;
  conditionAtDischarge: string;
  dischargeMedications: string;
  followUpInstructions: string;
  followUpDate?: ISODate;
  status: "DRAFT" | "FINAL";
  finalisedAt?: ISODateTime;
}

/* ------------------------------------------------------------------ */
/* Pharmacy                                                            */
/* ------------------------------------------------------------------ */

export interface Medicine extends Timestamps {
  id: ID;
  code: string;
  name: string;
  genericName: string;
  form: MedicineForm;
  strength: string;
  /** Dispensing unit, e.g. tablet, bottle, vial. */
  unit: string;
  category: string;
  unitPrice: number;
  reorderLevel: number;
  manufacturer: string;
  /**
   * Schedule H / H1 / X: dispensed only against a prescription, never sold
   * over the counter.
   */
  prescriptionOnly: boolean;
}

/** Pharmacy inventory is held per batch so expiry can drive FEFO dispensing. */
export interface MedicineBatch {
  id: ID;
  medicineId: ID;
  batchNumber: string;
  expiryDate: ISODate;
  quantityOnHand: number;
  receivedAt: ISODateTime;
  costPrice: number;
}

export interface Prescription extends Timestamps {
  id: ID;
  code: string;
  patientId: ID;
  encounterId: ID;
  admissionId?: ID;
  prescriberId: ID;
  status: PrescriptionStatus;
  notes: string;
  /** Marks the discharge-medication prescription of an admission. */
  isDischargeMedication?: boolean;
}

export interface PrescriptionItem {
  id: ID;
  prescriptionId: ID;
  medicineId: ID;
  dose: string;
  frequency: Frequency;
  route: Route;
  durationDays: number;
  quantityPrescribed: number;
  quantityDispensed: number;
  quantityReturned: number;
  instructions: string;
  status: PrescriptionItemStatus;
}

export interface PharmacyTransaction {
  id: ID;
  code: string;
  type: PharmacyTxnType;
  medicineId: ID;
  batchId: ID;
  /** Always positive; `type` gives the direction. */
  quantity: number;
  prescriptionItemId?: ID;
  patientId?: ID;
  at: ISODateTime;
  byId: ID;
  note: string;
  /** Goods receipts (GRN): the supplier and their invoice number. */
  supplier?: string;
  reference?: string;
}

/* ------------------------------------------------------------------ */
/* Laboratory                                                          */
/* ------------------------------------------------------------------ */

export interface LabParameter {
  id: ID;
  name: string;
  unit: string;
  refLow?: number;
  refHigh?: number;
  criticalLow?: number;
  criticalHigh?: number;
  /** Qualitative reference, e.g. "Negative". */
  refText?: string;
  options?: string[];
}

export interface LabTest {
  id: ID;
  code: string;
  name: string;
  section: string;
  sampleType: SampleType;
  price: number;
  turnaroundHours: number;
  parameters: LabParameter[];
}

export interface LabOrder extends Timestamps {
  id: ID;
  code: string;
  patientId: ID;
  encounterId: ID;
  admissionId?: ID;
  orderedById: ID;
  orderedAt: ISODateTime;
  priority: LabPriority;
  clinicalNotes: string;
  status: LabStatus;
  sampleId?: string;
  sampleRequestedAt?: ISODateTime;
  sampleCollectedAt?: ISODateTime;
  collectedById?: ID;
  technicianId?: ID;
  processingStartedAt?: ISODateTime;
  resultEnteredAt?: ISODateTime;
  verifiedAt?: ISODateTime;
  verifiedById?: ID;
  cancelledAt?: ISODateTime;
  cancelReason?: string;
}

export interface LabOrderItem {
  id: ID;
  labOrderId: ID;
  testId: ID;
  price: number;
}

export interface LabResult {
  id: ID;
  labOrderItemId: ID;
  parameterId: ID;
  value: string;
  flag: ResultFlag;
  enteredAt: ISODateTime;
  enteredById: ID;
}

/* ------------------------------------------------------------------ */
/* Billing                                                             */
/* ------------------------------------------------------------------ */

/**
 * One bill. OPD visits bill against their encounter, admissions keep a DRAFT
 * running bill that is finalised at discharge. Totals are always computed from
 * the line items and payments — never stored.
 */
export interface Invoice extends Timestamps {
  id: ID;
  code: string;
  patientId: ID;
  encounterId?: ID;
  admissionId?: ID;
  status: InvoiceStatus;
  finalisedAt?: ISODateTime;
  cancelledAt?: ISODateTime;
  cancelReason?: string;
  notes: string;
}

export interface InvoiceItem {
  id: ID;
  invoiceId: ID;
  category: ChargeCategory;
  description: string;
  /** Negative for credits such as returned medicines. */
  quantity: number;
  unitPrice: number;
  /** Absolute discount amount for the line, in INR. */
  discount: number;
  sourceType: ChargeSource;
  sourceId?: ID;
  serviceDate: ISODateTime;
  createdAt: ISODateTime;
}

export interface Payment {
  id: ID;
  code: string;
  invoiceId: ID;
  kind: "PAYMENT" | "REFUND";
  /** Always positive; `kind` gives the direction. */
  amount: number;
  method: PaymentMethod;
  reference: string;
  receivedAt: ISODateTime;
  receivedById: ID;
  note: string;
}

/* ------------------------------------------------------------------ */
/* Medical records                                                     */
/* ------------------------------------------------------------------ */

export interface MedicalRecord extends Timestamps {
  id: ID;
  code: string;
  patientId: ID;
  encounterId: ID;
  admissionId?: ID;
  recordType: MrdRecordType;
  departmentId: ID;
  attendingDoctorId: ID;
  status: MrdStatus;
  /** Physical file location once archived, e.g. "Rack B · Shelf 3". */
  location?: string;
  submittedAt?: ISODateTime;
  reviewedAt?: ISODateTime;
  reviewedById?: ID;
  archivedAt?: ISODateTime;
  reviewNote?: string;
}

export interface RecordAccessLog {
  id: ID;
  medicalRecordId: ID;
  at: ISODateTime;
  byId: ID;
  action:
    | "CREATED"
    | "VIEWED"
    | "DOCUMENT_ADDED"
    | "DOCUMENT_REMOVED"
    | "SUBMITTED"
    | "RETURNED"
    | "REVIEWED"
    | "ARCHIVED";
  note?: string;
}

export interface PatientDocument {
  id: ID;
  patientId: ID;
  encounterId?: ID;
  admissionId?: ID;
  title: string;
  kind: DocumentKind;
  fileName: string;
  sizeKb: number;
  uploadedAt: ISODateTime;
  uploadedById: ID;
  /** Generated documents (discharge summary, lab report) point at their source. */
  sourceId?: ID;
}

/**
 * The content of an uploaded file — a patient or staff photo, a document's
 * scanned copy, a photo attached to a complaint — kept apart from the rows
 * that list it so lists stay light. Images are downscaled in the browser
 * before upload.
 */
export interface StoredFile {
  id: ID;
  ownerType: FileOwner;
  /** The patient, staff member, document or complaint it belongs to. */
  ownerId: ID;
  name: string;
  mimeType: string;
  sizeKb: number;
  /** The content, as a base64 `data:` URL. */
  data: string;
  uploadedAt: ISODateTime;
  uploadedById: ID;
}

/* ------------------------------------------------------------------ */
/* Service quality                                                     */
/* ------------------------------------------------------------------ */

export interface Complaint extends Timestamps {
  id: ID;
  code: string;
  patientId?: ID;
  complainantName: string;
  complainantType: ComplainantType;
  contact: string;
  encounterId?: ID;
  category: ComplaintCategory;
  departmentId: ID;
  title: string;
  description: string;
  priority: Priority;
  assignedToId?: ID;
  dueDate: ISODate;
  status: ComplaintStatus;
  resolution?: string;
  resolvedAt?: ISODateTime;
  closedAt?: ISODateTime;
  loggedById: ID;
}

export interface ComplaintNote {
  id: ID;
  complaintId: ID;
  at: ISODateTime;
  byId: ID;
  text: string;
  kind: "NOTE" | "STATUS";
}

export interface Feedback extends Timestamps {
  id: ID;
  code: string;
  /** Absent when the feedback was given anonymously. */
  patientId?: ID;
  encounterId?: ID;
  departmentId: ID;
  doctorId?: ID;
  rating: number;
  categories: FeedbackCategory[];
  comments: string;
  channel: FeedbackChannel;
  submittedAt: ISODateTime;
  followUpRequired: boolean;
  followUpStatus: FollowUpStatus;
  followUpNote?: string;
  followUpById?: ID;
}

/* ------------------------------------------------------------------ */
/* Workforce                                                           */
/* ------------------------------------------------------------------ */

export interface Shift {
  id: ID;
  code: string;
  name: string;
  /** "HH:mm", local time. */
  start: string;
  end: string;
}

export interface RosterAssignment {
  id: ID;
  staffId: ID;
  date: ISODate;
  status: RosterStatus;
  /** Present when SCHEDULED. */
  shiftId?: ID;
  departmentId: ID;
  note?: string;
}

/* ------------------------------------------------------------------ */
/* Activity                                                            */
/* ------------------------------------------------------------------ */

export type EntityType =
  | "patient"
  | "enquiry"
  | "appointment"
  | "encounter"
  | "admission"
  | "bed"
  | "prescription"
  | "pharmacy"
  | "lab"
  | "invoice"
  | "mrd"
  | "complaint"
  | "feedback"
  | "staff"
  | "roster"
  | "user"
  | "role";

/** Append-only audit trail; feeds timelines and the operations feed. */
export interface ActivityEvent {
  id: ID;
  at: ISODateTime;
  actorId: ID;
  entityType: EntityType;
  entityId: ID;
  patientId?: ID;
  action: string;
  summary: string;
}

/* ------------------------------------------------------------------ */
/* Database                                                            */
/* ------------------------------------------------------------------ */

export interface Database {
  meta: {
    schemaVersion: number;
    /** When the seed simulation ran (after any day re-anchoring). */
    anchoredAt: ISODateTime;
    counters: Record<string, number>;
  };
  departments: Department[];
  staff: Staff[];
  roles: Role[];
  users: User[];
  patients: Patient[];
  enquiries: Enquiry[];
  enquiryFollowUps: EnquiryFollowUp[];
  appointments: Appointment[];
  encounters: Encounter[];
  wards: Ward[];
  rooms: Room[];
  beds: Bed[];
  admissions: Admission[];
  bedAssignments: BedAssignment[];
  clinicalNotes: ClinicalNote[];
  careOrders: CareOrder[];
  dischargeSummaries: DischargeSummary[];
  medicines: Medicine[];
  medicineBatches: MedicineBatch[];
  prescriptions: Prescription[];
  prescriptionItems: PrescriptionItem[];
  pharmacyTransactions: PharmacyTransaction[];
  labTests: LabTest[];
  labOrders: LabOrder[];
  labOrderItems: LabOrderItem[];
  labResults: LabResult[];
  invoices: Invoice[];
  invoiceItems: InvoiceItem[];
  payments: Payment[];
  medicalRecords: MedicalRecord[];
  recordAccessLogs: RecordAccessLog[];
  documents: PatientDocument[];
  files: StoredFile[];
  complaints: Complaint[];
  complaintNotes: ComplaintNote[];
  feedback: Feedback[];
  shifts: Shift[];
  roster: RosterAssignment[];
  activity: ActivityEvent[];
}

export type TableName = Exclude<keyof Database, "meta">;

export const SCHEMA_VERSION = 6;

export function emptyDatabase(now: ISODateTime): Database {
  return {
    meta: { schemaVersion: SCHEMA_VERSION, anchoredAt: now, counters: {} },
    departments: [],
    staff: [],
    roles: [],
    users: [],
    patients: [],
    enquiries: [],
    enquiryFollowUps: [],
    appointments: [],
    encounters: [],
    wards: [],
    rooms: [],
    beds: [],
    admissions: [],
    bedAssignments: [],
    clinicalNotes: [],
    careOrders: [],
    dischargeSummaries: [],
    medicines: [],
    medicineBatches: [],
    prescriptions: [],
    prescriptionItems: [],
    pharmacyTransactions: [],
    labTests: [],
    labOrders: [],
    labOrderItems: [],
    labResults: [],
    invoices: [],
    invoiceItems: [],
    payments: [],
    medicalRecords: [],
    recordAccessLogs: [],
    documents: [],
    files: [],
    complaints: [],
    complaintNotes: [],
    feedback: [],
    shifts: [],
    roster: [],
    activity: [],
  };
}
