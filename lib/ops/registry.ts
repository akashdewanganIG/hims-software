/**
 * Every write the application can make, by name.
 *
 * Each operation declares who may run it (the RBAC actions of `lib/rbac`), the
 * exact shape of its input (a zod schema — unknown keys are stripped, so a
 * client can never pass internal flags such as `allowOverbook`) and the domain
 * service call it performs. The browser sandbox and the PostgreSQL-backed
 * server both execute operations through `executeOperation`, so validation,
 * permissions and business rules are identical in both modes.
 */
import { z } from "zod";

import {
  createRole,
  createUser,
  deleteRole,
  deleteUser,
  updateRole,
  updateUser,
} from "../domain/admin";
import {
  addManualCharge,
  cancelInvoice,
  recordPayment,
  recordRefund,
  removeManualCharge,
  setLineDiscount,
} from "../domain/billing";
import { DOCUMENT_TYPES, IMAGE_TYPES } from "../domain/files";
import {
  addFollowUp,
  cancelEnquiry,
  closeEnquiry,
  convertToAppointment,
  createEnquiry,
  rescheduleEnquiry,
  updateEnquiry,
} from "../domain/enquiry";
import {
  addCareOrder,
  addClinicalNote,
  admitPatient,
  cancelTransfer,
  clearBilling,
  completeTransfer,
  dischargePatient,
  endCareOrder,
  initiateDischarge,
  requestTransfer,
  reserveBed,
  revertDischarge,
  saveDischargeSummary,
  setBedHousekeeping,
} from "../domain/ipd";
import {
  cancelLabOrder,
  collectSample,
  createLabOrder,
  enterResults,
  requestSample,
  startProcessing,
  verifyResults,
} from "../domain/lab";
import {
  addDocument,
  archiveRecord,
  logRecordView,
  removeDocument,
  updateDocument,
  resubmitRecord,
  returnRecord,
  reviewRecord,
} from "../domain/mrd";
import {
  bookAppointment,
  cancelAppointment,
  checkIn,
  completeVisit,
  markNoShow,
  recordVitals,
  registerWalkIn,
  rescheduleAppointment,
  saveConsultation,
  startConsultation,
} from "../domain/opd";
import {
  registerPatient,
  removePatient,
  removePatientPhoto,
  setPatientPhoto,
  updatePatient,
} from "../domain/patients";
import {
  cancelPrescription,
  closeUncollected,
  counterSale,
  createMedicine,
  createPrescription,
  deleteMedicine,
  dispense,
  receiveStock,
  returnMedicine,
  updateMedicine,
  writeOffBatch,
} from "../domain/pharmacy";
import {
  addComplaintNote,
  assignComplaint,
  attachComplaintPhoto,
  closeComplaint,
  logComplaint,
  removeComplaintPhoto,
  reopenComplaint,
  resolveComplaint,
  startComplaint,
  submitFeedback,
  updateComplaint,
  updateFeedbackFollowUp,
} from "../domain/quality";
import {
  copyWeek,
  createStaff,
  removeStaffPhoto,
  setRoster,
  setStaffPhoto,
  setStaffStatus,
  updateStaff,
} from "../domain/wfm";
import type { Action } from "../rbac";
import {
  ADMISSION_SOURCES,
  APPOINTMENT_TYPES,
  BLOOD_GROUPS,
  CARE_ORDER_TYPES,
  CHARGE_CATEGORIES,
  COMPLAINANT_TYPES,
  COMPLAINT_CATEGORIES,
  DOCUMENT_KINDS,
  ENQUIRY_SOURCES,
  ENQUIRY_TYPES,
  FEEDBACK_CATEGORIES,
  FEEDBACK_CHANNELS,
  FOLLOW_UP_CHANNELS,
  FOLLOW_UP_STATUSES,
  FREQUENCIES,
  GENDERS,
  LAB_PRIORITIES,
  MEDICINE_FORMS,
  NOTE_TYPES,
  OPD_DISPOSITIONS,
  PAYMENT_METHODS,
  PRIORITIES,
  ROSTER_STATUSES,
  ROUTES,
  STAFF_ROLES,
  STAFF_STATUSES,
  USER_STATUSES,
} from "../sim/schema";
import type { Tx } from "../sim/tx";

/* ------------------------------------------------------------------ */
/* Field shapes                                                        */
/* ------------------------------------------------------------------ */

const id = z.string().trim().min(1, "is required").max(80);
/** Optional reference that forms send as "" when nothing is chosen. */
const optionalId = z.union([id, z.literal("")]).optional();
const dateTime = z.iso.datetime({ offset: true });
const date = z.iso.date();
const optionalDate = z.union([date, z.literal("")]).optional();
const line = (max = 300) => z.string().max(max);
const text = (max = 4000) => z.string().max(max);
const money = z.number().finite().min(0).max(10_000_000);
const optionalEmail = z.union([z.literal(""), z.email().max(120)]).optional();
/** Module or action keys; the domain rejects unknown ones by name. */
const grants = z.array(z.string().max(40)).max(64);

/** An upload: the file's name and its content as a base64 `data:` URL. */
const upload = (types: readonly string[], label: string) =>
  z.object({
    name: line(200),
    data: z
      .string()
      .max(7_200_000, "Files can be up to 5 MB.")
      .refine(
        data => types.some(type => data.startsWith(`data:${type};base64,`)),
        `Upload ${label}.`
      ),
  });
const imageUpload = upload(IMAGE_TYPES, "a JPG, PNG or WebP image");
const documentUpload = upload(
  DOCUMENT_TYPES,
  "a PDF or a JPG, PNG or WebP image"
);

const patientInput = z.object({
  firstName: line(80),
  lastName: line(80),
  gender: z.enum(GENDERS),
  dateOfBirth: date,
  bloodGroup: z.enum(BLOOD_GROUPS).optional(),
  phone: line(20),
  email: optionalEmail,
  address: line(300),
  city: line(80),
  emergencyContactName: line(120),
  emergencyContactPhone: line(20),
  allergies: z.array(line(80)).max(30).optional(),
  chronicConditions: z.array(line(80)).max(30).optional(),
});

const staffInput = z.object({
  firstName: line(80),
  lastName: line(80),
  departmentId: id,
  designation: line(120),
  specialisation: line(120).optional(),
  qualification: line(120).optional(),
  phone: line(20),
  email: line(120),
  consultationFee: money.optional(),
});

const medicineInput = z.object({
  name: line(120),
  genericName: line(120),
  form: z.enum(MEDICINE_FORMS),
  strength: line(40),
  unit: line(40),
  category: line(120),
  unitPrice: money,
  reorderLevel: z.number().int().min(0).max(1_000_000),
  manufacturer: line(120),
  prescriptionOnly: z.boolean(),
});

const enquiryRouting = {
  departmentId: optionalId,
  preferredDoctorId: optionalId,
};

const consultationInput = z.object({
  chiefComplaint: text(1000),
  history: text(),
  examination: text(),
  diagnoses: z
    .array(
      z.object({
        code: line(20).optional(),
        description: line(300),
        type: z.enum(["PRIMARY", "SECONDARY", "PROVISIONAL"]),
      })
    )
    .max(20),
  consultationNotes: text(),
  advice: text(),
  followUpDate: optionalDate,
  referral: z
    .object({ toDepartmentId: optionalId, note: text(1000) })
    .optional(),
});

const vitalsInput = z.object({
  temperatureC: z.number().finite().optional(),
  pulse: z.number().finite().optional(),
  systolic: z.number().finite().optional(),
  diastolic: z.number().finite().optional(),
  respiratoryRate: z.number().finite().optional(),
  spo2: z.number().finite().optional(),
  weightKg: z.number().finite().optional(),
  heightCm: z.number().finite().optional(),
});

const dischargeSummaryInput = z.object({
  finalDiagnosis: text(1000),
  courseInHospital: text(),
  proceduresDone: text(),
  conditionAtDischarge: text(1000),
  dischargeMedications: text(),
  followUpInstructions: text(),
  followUpDate: optionalDate,
});

/* ------------------------------------------------------------------ */
/* Definitions                                                         */
/* ------------------------------------------------------------------ */

export interface OperationDef<S extends z.ZodType, R> {
  /** Short description, used in audit trails and permission messages. */
  label: string;
  /** RBAC actions, any of which allows the operation. */
  allow: readonly Action[];
  input: S;
  run: (tx: Tx, input: z.output<S>) => R;
  /** Audit-only writes: no UI refresh, not counted as a user change. */
  silent?: boolean;
}

function op<S extends z.ZodType, R>(def: OperationDef<S, R>) {
  return def;
}

export const OPERATIONS = {
  /* Patients ------------------------------------------------------- */
  "patient.register": op({
    label: "Register patient",
    allow: ["patient.register"],
    input: patientInput.extend({ photo: imageUpload.optional() }),
    run: (tx, { photo, ...i }) => registerPatient(tx, i, photo),
  }),
  "patient.update": op({
    label: "Edit patient details",
    allow: ["patient.edit"],
    input: z.object({ patientId: id, patient: patientInput }),
    run: (tx, i) => updatePatient(tx, i.patientId, i.patient),
  }),
  "patient.setPhoto": op({
    label: "Update patient photo",
    allow: ["patient.edit"],
    input: z.object({ patientId: id, photo: imageUpload }),
    run: (tx, i) => setPatientPhoto(tx, i.patientId, i.photo),
  }),
  "patient.removePhoto": op({
    label: "Remove patient photo",
    allow: ["patient.edit"],
    input: z.object({ patientId: id }),
    run: (tx, i) => removePatientPhoto(tx, i.patientId),
  }),
  "patient.remove": op({
    label: "Delete a registration made in error",
    allow: ["patient.register"],
    input: z.object({ patientId: id }),
    run: (tx, i) => removePatient(tx, i.patientId),
  }),

  /* Enquiry -------------------------------------------------------- */
  "enquiry.create": op({
    label: "Log enquiry",
    allow: ["enquiry.manage"],
    input: z.object({
      type: z.enum(ENQUIRY_TYPES),
      patientId: optionalId,
      prospectName: line(120),
      phone: line(20),
      email: optionalEmail,
      source: z.enum(ENQUIRY_SOURCES),
      reason: text(1000),
      ...enquiryRouting,
      assignedToId: id,
      referredById: optionalId,
      notes: text().optional(),
      followUpDate: optionalDate,
    }),
    run: (tx, i) => createEnquiry(tx, i),
  }),
  "enquiry.update": op({
    label: "Edit enquiry",
    allow: ["enquiry.manage"],
    input: z.object({
      enquiryId: id,
      reason: text(1000),
      ...enquiryRouting,
      assignedToId: id,
      notes: text().optional(),
      email: optionalEmail,
    }),
    run: (tx, { enquiryId, ...i }) => updateEnquiry(tx, enquiryId, i),
  }),
  "enquiry.followUp": op({
    label: "Record enquiry follow-up",
    allow: ["enquiry.manage"],
    input: z.object({
      enquiryId: id,
      channel: z.enum(FOLLOW_UP_CHANNELS),
      note: text(2000),
      nextFollowUpDate: optionalDate,
    }),
    run: (tx, { enquiryId, ...i }) => addFollowUp(tx, enquiryId, i),
  }),
  "enquiry.convert": op({
    label: "Convert enquiry to appointment",
    allow: ["appointment.book"],
    input: z.object({
      enquiryId: id,
      patientId: optionalId,
      newPatient: patientInput.optional(),
      doctorId: id,
      scheduledAt: dateTime,
      type: z.enum(APPOINTMENT_TYPES),
    }),
    run: (tx, { enquiryId, patientId, ...i }) =>
      convertToAppointment(tx, enquiryId, {
        ...i,
        patientId: patientId || undefined,
      }),
  }),
  "enquiry.reschedule": op({
    label: "Reschedule enquiry",
    allow: ["enquiry.manage"],
    input: z.object({
      enquiryId: id,
      scheduledAt: dateTime.optional(),
      followUpDate: optionalDate,
    }),
    run: (tx, { enquiryId, ...i }) =>
      rescheduleEnquiry(tx, enquiryId, {
        scheduledAt: i.scheduledAt,
        followUpDate: i.followUpDate || undefined,
      }),
  }),
  "enquiry.cancel": op({
    label: "Cancel enquiry",
    allow: ["enquiry.manage"],
    input: z.object({ enquiryId: id, reason: text(1000) }),
    run: (tx, i) => cancelEnquiry(tx, i.enquiryId, i.reason),
  }),
  "enquiry.close": op({
    label: "Close enquiry",
    allow: ["enquiry.manage"],
    input: z.object({ enquiryId: id, note: text(1000) }),
    run: (tx, i) => closeEnquiry(tx, i.enquiryId, i.note),
  }),

  /* Appointments & OPD --------------------------------------------- */
  "appointment.book": op({
    label: "Book appointment",
    allow: ["appointment.book"],
    input: z.object({
      patientId: id,
      doctorId: id,
      scheduledAt: dateTime,
      type: z.enum(APPOINTMENT_TYPES),
      source: z.enum(["PHONE", "ONLINE", "FOLLOW_UP"]),
      reason: text(1000),
    }),
    run: (tx, i) => bookAppointment(tx, i),
  }),
  "appointment.reschedule": op({
    label: "Reschedule appointment",
    allow: ["appointment.book"],
    input: z.object({ appointmentId: id, scheduledAt: dateTime }),
    run: (tx, i) => rescheduleAppointment(tx, i.appointmentId, i.scheduledAt),
  }),
  "appointment.cancel": op({
    label: "Cancel appointment",
    allow: ["appointment.book"],
    input: z.object({ appointmentId: id, reason: text(1000) }),
    run: (tx, i) => cancelAppointment(tx, i.appointmentId, i.reason),
  }),
  "appointment.noShow": op({
    label: "Mark appointment no-show",
    allow: ["appointment.checkin"],
    input: z.object({ appointmentId: id }),
    run: (tx, i) => markNoShow(tx, i.appointmentId),
  }),
  "appointment.checkIn": op({
    label: "Check in patient",
    allow: ["appointment.checkin"],
    input: z.object({ appointmentId: id }),
    run: (tx, i) => checkIn(tx, i.appointmentId),
  }),
  "appointment.walkIn": op({
    label: "Check in walk-in patient",
    allow: ["appointment.checkin"],
    input: z.object({
      patientId: id,
      doctorId: id,
      reason: text(1000),
      type: z.enum(APPOINTMENT_TYPES).optional(),
    }),
    run: (tx, i) => registerWalkIn(tx, i),
  }),
  "opd.recordVitals": op({
    label: "Record vitals",
    allow: ["opd.vitals"],
    input: z.object({ encounterId: id, vitals: vitalsInput }),
    run: (tx, i) => recordVitals(tx, i.encounterId, i.vitals),
  }),
  "opd.startConsultation": op({
    label: "Start consultation",
    allow: ["opd.consult"],
    input: z.object({ appointmentId: id }),
    run: (tx, i) => startConsultation(tx, i.appointmentId),
  }),
  "opd.saveConsultation": op({
    label: "Save consultation notes",
    allow: ["opd.consult"],
    input: z.object({ encounterId: id, consultation: consultationInput }),
    run: (tx, i) => saveConsultation(tx, i.encounterId, i.consultation),
  }),
  "opd.closeVisit": op({
    label: "Close OPD visit",
    allow: ["opd.consult"],
    input: z.object({
      encounterId: id,
      consultation: consultationInput,
      disposition: z.enum(OPD_DISPOSITIONS),
    }),
    // Notes and closure commit together, or not at all.
    run: (tx, i) => {
      saveConsultation(tx, i.encounterId, i.consultation);
      return completeVisit(tx, i.encounterId, i.disposition);
    },
  }),

  /* Orders --------------------------------------------------------- */
  "rx.create": op({
    label: "Prescribe medicines",
    allow: ["opd.consult", "ipd.order", "ipd.discharge"],
    input: z.object({
      encounterId: id,
      notes: text(1000).optional(),
      isDischargeMedication: z.boolean().optional(),
      items: z
        .array(
          z.object({
            medicineId: id,
            dose: line(80),
            frequency: z.enum(FREQUENCIES),
            route: z.enum(ROUTES),
            durationDays: z.number().int().min(1).max(365),
            quantity: z.number().int().min(1).max(10_000).optional(),
            instructions: line(300).optional(),
          })
        )
        .min(1, "Add at least one medicine.")
        .max(30),
    }),
    run: (tx, i) => createPrescription(tx, i),
  }),
  "rx.cancel": op({
    label: "Cancel prescription",
    allow: ["opd.consult", "ipd.order", "ipd.discharge"],
    input: z.object({ prescriptionId: id, reason: text(1000) }),
    run: (tx, i) => cancelPrescription(tx, i.prescriptionId, i.reason),
  }),
  "lab.order": op({
    label: "Order lab tests",
    allow: ["lab.order", "opd.consult"],
    input: z.object({
      encounterId: id,
      testIds: z.array(id).min(1, "Select at least one test.").max(30),
      priority: z.enum(LAB_PRIORITIES),
      clinicalNotes: text(1000).optional(),
    }),
    run: (tx, i) => createLabOrder(tx, i),
  }),

  /* Laboratory ----------------------------------------------------- */
  "lab.requestSample": op({
    label: "Request lab sample",
    allow: ["lab.collect"],
    input: z.object({ orderId: id }),
    run: (tx, i) => requestSample(tx, i.orderId),
  }),
  "lab.collectSample": op({
    label: "Collect lab sample",
    allow: ["lab.collect"],
    input: z.object({ orderId: id }),
    run: (tx, i) => collectSample(tx, i.orderId),
  }),
  "lab.startProcessing": op({
    label: "Start lab processing",
    allow: ["lab.result"],
    input: z.object({ orderId: id }),
    run: (tx, i) => startProcessing(tx, i.orderId),
  }),
  "lab.enterResults": op({
    label: "Enter lab results",
    allow: ["lab.result"],
    input: z.object({
      orderId: id,
      values: z.record(id, z.record(id, line(200))),
    }),
    run: (tx, i) => enterResults(tx, i.orderId, i.values),
  }),
  "lab.verify": op({
    label: "Verify lab results",
    allow: ["lab.verify"],
    input: z.object({ orderId: id }),
    run: (tx, i) => verifyResults(tx, i.orderId),
  }),
  "lab.cancel": op({
    label: "Cancel lab order",
    allow: ["lab.order", "lab.collect", "lab.result"],
    input: z.object({ orderId: id, reason: text(1000) }),
    run: (tx, i) => cancelLabOrder(tx, i.orderId, i.reason),
  }),

  /* Pharmacy ------------------------------------------------------- */
  "pharmacy.dispense": op({
    label: "Dispense prescription",
    allow: ["pharmacy.dispense"],
    input: z.object({
      prescriptionId: id,
      lines: z
        .array(
          z.object({
            itemId: id,
            quantity: z.number().int().min(0).max(10_000),
          })
        )
        .min(1)
        .max(30),
    }),
    run: (tx, i) => dispense(tx, i.prescriptionId, i.lines),
  }),
  "pharmacy.return": op({
    label: "Return medicine",
    allow: ["pharmacy.dispense"],
    input: z.object({
      itemId: id,
      quantity: z.number().int().min(1).max(10_000),
      reason: text(1000),
    }),
    run: (tx, i) => returnMedicine(tx, i.itemId, i.quantity, i.reason),
  }),
  "pharmacy.closeUncollected": op({
    label: "Close uncollected prescription",
    allow: ["pharmacy.dispense"],
    input: z.object({ prescriptionId: id, reason: text(1000) }),
    run: (tx, i) => closeUncollected(tx, i.prescriptionId, i.reason),
  }),
  "pharmacy.receiveStock": op({
    label: "Receive stock",
    allow: ["pharmacy.stock"],
    input: z.object({
      medicineId: id,
      batchNumber: line(40),
      expiryDate: date,
      quantity: z.number().int().min(1).max(1_000_000),
      costPrice: money,
      supplier: line(120),
      invoiceNumber: line(60),
    }),
    run: (tx, i) => receiveStock(tx, i),
  }),
  "pharmacy.counterSale": op({
    label: "Counter sale",
    allow: ["pharmacy.dispense"],
    input: z.object({
      patientId: id,
      lines: z
        .array(
          z.object({
            medicineId: id,
            quantity: z.number().int().min(0).max(10_000),
          })
        )
        .min(1)
        .max(30),
      payment: z
        .object({
          method: z.enum(PAYMENT_METHODS),
          reference: line(80).optional(),
        })
        .optional(),
    }),
    run: (tx, i) => counterSale(tx, i),
  }),
  "pharmacy.writeOff": op({
    label: "Write off batch",
    allow: ["pharmacy.stock"],
    input: z.object({ batchId: id, reason: text(1000) }),
    run: (tx, i) => writeOffBatch(tx, i.batchId, i.reason),
  }),
  "pharmacy.createMedicine": op({
    label: "Add medicine to formulary",
    allow: ["pharmacy.stock"],
    input: medicineInput,
    run: (tx, i) => createMedicine(tx, i),
  }),
  "pharmacy.updateMedicine": op({
    label: "Edit medicine",
    allow: ["pharmacy.stock"],
    input: z.object({ medicineId: id, medicine: medicineInput }),
    run: (tx, i) => updateMedicine(tx, i.medicineId, i.medicine),
  }),
  "pharmacy.deleteMedicine": op({
    label: "Remove medicine from formulary",
    allow: ["pharmacy.stock"],
    input: z.object({ medicineId: id }),
    run: (tx, i) => deleteMedicine(tx, i.medicineId),
  }),

  /* Inpatients & beds ---------------------------------------------- */
  "ipd.admit": op({
    label: "Admit patient",
    allow: ["ipd.admit"],
    input: z.object({
      patientId: id,
      doctorId: id,
      bedId: id,
      reason: text(1000),
      provisionalDiagnosis: text(1000),
      source: z.enum(ADMISSION_SOURCES),
      sourceEncounterId: optionalId,
      expectedDischargeDate: optionalDate,
    }),
    run: (tx, i) =>
      admitPatient(tx, {
        ...i,
        sourceEncounterId: i.sourceEncounterId || undefined,
        expectedDischargeDate: i.expectedDischargeDate || undefined,
      }),
  }),
  "ipd.addNote": op({
    label: "Add clinical note",
    allow: ["ipd.note"],
    input: z.object({
      admissionId: id,
      type: z.enum(NOTE_TYPES),
      text: text(8000),
    }),
    run: (tx, { admissionId, ...i }) => addClinicalNote(tx, admissionId, i),
  }),
  "ipd.addCareOrder": op({
    label: "Add care order",
    allow: ["ipd.order"],
    input: z.object({
      admissionId: id,
      type: z.enum(CARE_ORDER_TYPES),
      instruction: text(1000),
    }),
    run: (tx, { admissionId, ...i }) => addCareOrder(tx, admissionId, i),
  }),
  "ipd.endCareOrder": op({
    label: "End care order",
    allow: ["ipd.order"],
    input: z.object({
      orderId: id,
      status: z.enum(["COMPLETED", "DISCONTINUED"]),
    }),
    run: (tx, i) => endCareOrder(tx, i.orderId, i.status),
  }),
  "ipd.requestTransfer": op({
    label: "Request bed transfer",
    allow: ["ipd.transfer"],
    input: z.object({ admissionId: id, toBedId: id, reason: text(1000) }),
    run: (tx, { admissionId, ...i }) => requestTransfer(tx, admissionId, i),
  }),
  "ipd.completeTransfer": op({
    label: "Complete bed transfer",
    allow: ["ipd.transfer"],
    input: z.object({ admissionId: id }),
    run: (tx, i) => completeTransfer(tx, i.admissionId),
  }),
  "ipd.cancelTransfer": op({
    label: "Cancel bed transfer",
    allow: ["ipd.transfer"],
    input: z.object({ admissionId: id }),
    run: (tx, i) => cancelTransfer(tx, i.admissionId),
  }),
  "ipd.initiateDischarge": op({
    label: "Initiate discharge",
    allow: ["ipd.discharge"],
    input: z.object({ admissionId: id }),
    run: (tx, i) => initiateDischarge(tx, i.admissionId),
  }),
  "ipd.revertDischarge": op({
    label: "Revert discharge",
    allow: ["ipd.discharge"],
    input: z.object({ admissionId: id }),
    run: (tx, i) => revertDischarge(tx, i.admissionId),
  }),
  "ipd.saveDischargeSummary": op({
    label: "Save discharge summary",
    allow: ["ipd.discharge"],
    input: z.object({
      admissionId: id,
      summary: dischargeSummaryInput,
      finalise: z.boolean(),
    }),
    run: (tx, i) =>
      saveDischargeSummary(
        tx,
        i.admissionId,
        { ...i.summary, followUpDate: i.summary.followUpDate || undefined },
        i.finalise
      ),
  }),
  "ipd.clearBilling": op({
    label: "Clear billing for discharge",
    allow: ["billing.collect"],
    input: z.object({ admissionId: id, note: line(300).optional() }),
    run: (tx, i) => clearBilling(tx, i.admissionId, i.note),
  }),
  "ipd.discharge": op({
    label: "Discharge patient",
    allow: ["ipd.discharge"],
    input: z.object({ admissionId: id }),
    run: (tx, i) => dischargePatient(tx, i.admissionId),
  }),
  "beds.setHousekeeping": op({
    label: "Change bed status",
    allow: ["beds.housekeeping"],
    input: z.object({
      bedId: id,
      status: z.enum(["AVAILABLE", "CLEANING", "MAINTENANCE"]),
      note: line(300).optional(),
    }),
    run: (tx, i) => setBedHousekeeping(tx, i.bedId, i.status, i.note),
  }),
  "beds.reserve": op({
    label: "Reserve bed",
    allow: ["beds.housekeeping"],
    input: z.object({ bedId: id, note: line(300) }),
    run: (tx, i) => reserveBed(tx, i.bedId, i.note),
  }),

  /* Billing -------------------------------------------------------- */
  "billing.collect": op({
    label: "Collect payment",
    allow: ["billing.collect"],
    input: z.object({
      invoiceId: id,
      amount: money,
      method: z.enum(PAYMENT_METHODS),
      reference: line(80).optional(),
      note: line(300).optional(),
    }),
    run: (tx, { invoiceId, ...i }) => recordPayment(tx, invoiceId, i),
  }),
  "billing.refund": op({
    label: "Issue refund",
    allow: ["billing.refund"],
    input: z.object({
      invoiceId: id,
      amount: money,
      method: z.enum(PAYMENT_METHODS),
      reason: text(1000),
    }),
    run: (tx, { invoiceId, ...i }) => recordRefund(tx, invoiceId, i),
  }),
  "billing.addCharge": op({
    label: "Add bill charge",
    allow: ["billing.adjust"],
    input: z.object({
      invoiceId: id,
      category: z.enum(CHARGE_CATEGORIES).exclude(["REGISTRATION"]),
      description: line(300),
      quantity: z.number().int().min(1).max(10_000),
      unitPrice: money,
    }),
    run: (tx, { invoiceId, ...i }) => addManualCharge(tx, invoiceId, i),
  }),
  "billing.setDiscount": op({
    label: "Set line discount",
    allow: ["billing.adjust"],
    input: z.object({ itemId: id, discount: money }),
    run: (tx, i) => setLineDiscount(tx, i.itemId, i.discount),
  }),
  "billing.removeCharge": op({
    label: "Remove bill charge",
    allow: ["billing.adjust"],
    input: z.object({ itemId: id }),
    run: (tx, i) => removeManualCharge(tx, i.itemId),
  }),
  "billing.cancel": op({
    label: "Cancel bill",
    allow: ["billing.adjust"],
    input: z.object({ invoiceId: id, reason: text(1000) }),
    run: (tx, i) => cancelInvoice(tx, i.invoiceId, i.reason),
  }),

  /* Medical records ------------------------------------------------ */
  "mrd.review": op({
    label: "Review medical record",
    allow: ["mrd.manage"],
    input: z.object({ recordId: id, note: text(1000).optional() }),
    run: (tx, i) => reviewRecord(tx, i.recordId, i.note),
  }),
  "mrd.return": op({
    label: "Return medical record",
    allow: ["mrd.manage"],
    input: z.object({ recordId: id, note: text(1000) }),
    run: (tx, i) => returnRecord(tx, i.recordId, i.note),
  }),
  "mrd.resubmit": op({
    label: "Resubmit medical record",
    allow: ["mrd.manage"],
    input: z.object({ recordId: id }),
    run: (tx, i) => resubmitRecord(tx, i.recordId),
  }),
  "mrd.archive": op({
    label: "Archive medical record",
    allow: ["mrd.manage"],
    input: z.object({ recordId: id, location: line(120) }),
    run: (tx, i) => archiveRecord(tx, i.recordId, i.location),
  }),
  "mrd.logView": op({
    label: "View medical record",
    allow: [],
    input: z.object({ recordId: id }),
    run: (tx, i) => {
      logRecordView(tx, i.recordId);
    },
    silent: true,
  }),
  "document.add": op({
    label: "Upload document",
    allow: ["document.upload"],
    input: z.object({
      patientId: id,
      encounterId: optionalId,
      admissionId: optionalId,
      title: line(200),
      kind: z.enum(DOCUMENT_KINDS).exclude(["DISCHARGE_SUMMARY"]),
      file: documentUpload,
    }),
    run: (tx, i) =>
      addDocument(tx, {
        ...i,
        encounterId: i.encounterId || undefined,
        admissionId: i.admissionId || undefined,
      }),
  }),
  "document.update": op({
    label: "Edit document details",
    allow: ["document.upload"],
    input: z.object({
      documentId: id,
      title: line(200),
      kind: z.enum(DOCUMENT_KINDS).exclude(["DISCHARGE_SUMMARY"]),
    }),
    run: (tx, { documentId, ...i }) => updateDocument(tx, documentId, i),
  }),
  "document.remove": op({
    label: "Remove document",
    allow: ["document.upload"],
    input: z.object({ documentId: id }),
    run: (tx, i) => removeDocument(tx, i.documentId),
  }),

  /* Complaints & feedback ------------------------------------------ */
  "complaint.log": op({
    label: "Log complaint",
    allow: ["complaint.log"],
    input: z.object({
      patientId: optionalId,
      complainantName: line(120),
      complainantType: z.enum(COMPLAINANT_TYPES),
      contact: line(120),
      encounterId: optionalId,
      category: z.enum(COMPLAINT_CATEGORIES),
      departmentId: id,
      title: line(200),
      description: text(4000),
      priority: z.enum(PRIORITIES),
      assignedToId: optionalId,
    }),
    run: (tx, i) =>
      logComplaint(tx, {
        ...i,
        patientId: i.patientId || undefined,
        encounterId: i.encounterId || undefined,
        assignedToId: i.assignedToId || undefined,
      }),
  }),
  "complaint.assign": op({
    label: "Assign complaint",
    allow: ["complaint.manage"],
    input: z.object({ complaintId: id, staffId: id }),
    run: (tx, i) => assignComplaint(tx, i.complaintId, i.staffId),
  }),
  "complaint.start": op({
    label: "Start complaint investigation",
    allow: ["complaint.manage"],
    input: z.object({ complaintId: id }),
    run: (tx, i) => startComplaint(tx, i.complaintId),
  }),
  "complaint.addNote": op({
    label: "Add complaint note",
    allow: ["complaint.manage"],
    input: z.object({ complaintId: id, text: text(4000) }),
    run: (tx, i) => addComplaintNote(tx, i.complaintId, i.text),
  }),
  "complaint.resolve": op({
    label: "Resolve complaint",
    allow: ["complaint.manage"],
    input: z.object({ complaintId: id, resolution: text(4000) }),
    run: (tx, i) => resolveComplaint(tx, i.complaintId, i.resolution),
  }),
  "complaint.close": op({
    label: "Close complaint",
    allow: ["complaint.manage"],
    input: z.object({ complaintId: id }),
    run: (tx, i) => closeComplaint(tx, i.complaintId),
  }),
  "complaint.reopen": op({
    label: "Reopen complaint",
    allow: ["complaint.manage"],
    input: z.object({ complaintId: id, reason: text(1000) }),
    run: (tx, i) => reopenComplaint(tx, i.complaintId, i.reason),
  }),
  "complaint.update": op({
    label: "Edit complaint",
    allow: ["complaint.manage"],
    input: z.object({
      complaintId: id,
      complainantName: line(120),
      contact: line(120),
      category: z.enum(COMPLAINT_CATEGORIES),
      departmentId: id,
      title: line(200),
      description: text(4000),
      priority: z.enum(PRIORITIES),
    }),
    run: (tx, { complaintId, ...i }) => updateComplaint(tx, complaintId, i),
  }),
  "complaint.attachPhoto": op({
    label: "Attach photo to complaint",
    allow: ["complaint.log", "complaint.manage"],
    input: z.object({ complaintId: id, photo: imageUpload }),
    run: (tx, i) => attachComplaintPhoto(tx, i.complaintId, i.photo),
  }),
  "complaint.removePhoto": op({
    label: "Remove complaint photo",
    allow: ["complaint.manage"],
    input: z.object({ fileId: id }),
    run: (tx, i) => removeComplaintPhoto(tx, i.fileId),
  }),
  "feedback.submit": op({
    label: "Record feedback",
    allow: ["feedback.submit"],
    input: z.object({
      patientId: optionalId,
      anonymous: z.boolean(),
      encounterId: optionalId,
      departmentId: id,
      doctorId: optionalId,
      rating: z.number().int().min(1).max(5),
      categories: z.array(z.enum(FEEDBACK_CATEGORIES)).max(9),
      comments: text(4000),
      channel: z.enum(FEEDBACK_CHANNELS),
      followUpRequired: z.boolean().optional(),
    }),
    run: (tx, i) =>
      submitFeedback(tx, {
        ...i,
        patientId: i.patientId || undefined,
        encounterId: i.encounterId || undefined,
        doctorId: i.doctorId || undefined,
      }),
  }),
  "feedback.updateFollowUp": op({
    label: "Update feedback follow-up",
    allow: ["feedback.manage"],
    input: z.object({
      feedbackId: id,
      status: z.enum(FOLLOW_UP_STATUSES),
      note: text(2000).optional(),
    }),
    run: (tx, { feedbackId, ...i }) =>
      updateFeedbackFollowUp(tx, feedbackId, i),
  }),

  /* Workforce ------------------------------------------------------ */
  "wfm.setRoster": op({
    label: "Update roster",
    allow: ["wfm.manage"],
    input: z.object({
      staffId: id,
      date,
      status: z.enum(ROSTER_STATUSES),
      shiftId: optionalId,
      note: line(200).optional(),
    }),
    run: (tx, i) => setRoster(tx, { ...i, shiftId: i.shiftId || undefined }),
  }),
  "wfm.copyWeek": op({
    label: "Copy roster week",
    allow: ["wfm.manage"],
    input: z.object({ fromWeekStart: date, departmentId: optionalId }),
    run: (tx, i) =>
      copyWeek(tx, {
        fromWeekStart: i.fromWeekStart,
        departmentId: i.departmentId || undefined,
      }),
  }),
  "wfm.createStaff": op({
    label: "Add staff member",
    allow: ["wfm.manage"],
    input: staffInput.extend({ role: z.enum(STAFF_ROLES) }),
    run: (tx, i) => createStaff(tx, i),
  }),
  "wfm.setStaffStatus": op({
    label: "Change staff status",
    allow: ["wfm.manage"],
    input: z.object({ staffId: id, status: z.enum(STAFF_STATUSES) }),
    run: (tx, i) => setStaffStatus(tx, i.staffId, i.status),
  }),
  "wfm.updateStaff": op({
    label: "Edit staff details",
    allow: ["wfm.manage"],
    input: staffInput.extend({ staffId: id }),
    run: (tx, { staffId, ...i }) => updateStaff(tx, staffId, i),
  }),
  "wfm.setStaffPhoto": op({
    label: "Update staff photo",
    allow: ["wfm.manage"],
    input: z.object({ staffId: id, photo: imageUpload }),
    run: (tx, i) => setStaffPhoto(tx, i.staffId, i.photo),
  }),
  "wfm.removeStaffPhoto": op({
    label: "Remove staff photo",
    allow: ["wfm.manage"],
    input: z.object({ staffId: id }),
    run: (tx, i) => removeStaffPhoto(tx, i.staffId),
  }),

  /* Administration ------------------------------------------------- */
  "admin.createUser": op({
    label: "Create login",
    allow: ["users.manage"],
    input: z.object({
      staffId: id,
      roleId: id,
      username: line(32),
      status: z.enum(USER_STATUSES).optional(),
      customAccess: z.boolean().optional(),
      modules: grants.optional(),
      actions: grants.optional(),
    }),
    run: (tx, i) => createUser(tx, i),
  }),
  "admin.updateUser": op({
    label: "Update login",
    allow: ["users.manage"],
    input: z.object({
      userId: id,
      roleId: id.optional(),
      username: line(32).optional(),
      status: z.enum(USER_STATUSES).optional(),
      customAccess: z.boolean().optional(),
      modules: grants.optional(),
      actions: grants.optional(),
    }),
    run: (tx, i) => updateUser(tx, i),
  }),
  "admin.deleteUser": op({
    label: "Delete login",
    allow: ["users.manage"],
    input: z.object({ userId: id }),
    run: (tx, i) => deleteUser(tx, i.userId),
  }),
  "admin.createRole": op({
    label: "Create role",
    allow: ["users.manage"],
    input: z.object({
      name: line(48),
      description: line(300),
      modules: grants,
      actions: grants,
      homePath: line(80),
    }),
    run: (tx, i) => createRole(tx, i),
  }),
  "admin.updateRole": op({
    label: "Update role",
    allow: ["users.manage"],
    input: z.object({
      roleId: id,
      name: line(48).optional(),
      description: line(300).optional(),
      modules: grants.optional(),
      actions: grants.optional(),
      homePath: line(80).optional(),
    }),
    run: (tx, i) => updateRole(tx, i),
  }),
  "admin.deleteRole": op({
    label: "Delete role",
    allow: ["users.manage"],
    input: z.object({ roleId: id }),
    run: (tx, i) => deleteRole(tx, i.roleId),
  }),
} as const;

export type Operations = typeof OPERATIONS;
export type OperationName = keyof Operations;
export type OperationInput<N extends OperationName> = z.input<
  Operations[N]["input"]
>;
export type OperationResult<N extends OperationName> = ReturnType<
  Operations[N]["run"]
>;

export const OPERATION_NAMES = Object.keys(OPERATIONS) as OperationName[];

export function isOperationName(name: string): name is OperationName {
  return Object.prototype.hasOwnProperty.call(OPERATIONS, name);
}
