import type {
  AppointmentType,
  Enquiry,
  EnquirySource,
  EnquiryType,
  FollowUpChannel,
  ID,
} from "../sim/schema";
import { isoDate } from "../sim/time";
import {
  assert,
  find,
  log,
  must,
  newId,
  nextCode,
  nowIso,
  requireText,
  touch,
  type Tx,
} from "../sim/tx";
import {
  bookAppointment,
  cancelAppointment,
  rescheduleAppointment,
} from "./opd";
import { normalisePhone, registerPatient, type PatientInput } from "./patients";

const LIVE: Enquiry["status"][] = [
  "NEW",
  "FOLLOW_UP_REQUIRED",
  "APPOINTMENT_SCHEDULED",
];

export interface EnquiryInput {
  type: EnquiryType;
  patientId?: ID;
  prospectName: string;
  phone: string;
  email?: string;
  source: EnquirySource;
  reason: string;
  departmentId?: ID;
  preferredDoctorId?: ID;
  assignedToId: ID;
  referredById?: ID;
  notes?: string;
  followUpDate?: string;
}

/** Department and preferred doctor, when given, must exist (and be a doctor). */
function assertRouting(
  tx: Tx,
  input: Pick<EnquiryInput, "departmentId" | "preferredDoctorId">
) {
  if (input.departmentId)
    must(tx.db.departments, input.departmentId, "Department");
  if (input.preferredDoctorId) {
    const doctor = must(tx.db.staff, input.preferredDoctorId, "Doctor");
    assert(
      doctor.role === "DOCTOR",
      `${doctor.firstName} ${doctor.lastName} is not a doctor.`
    );
  }
}

export function createEnquiry(tx: Tx, input: EnquiryInput): Enquiry {
  const patient = input.patientId
    ? must(tx.db.patients, input.patientId, "Patient")
    : undefined;
  const phone = normalisePhone(patient?.phone ?? input.phone);
  assert(phone.length === 10, "Enter a 10-digit contact number.");
  must(tx.db.staff, input.assignedToId, "Assigned staff member");
  assertRouting(tx, input);
  if (input.type === "INTERNAL") {
    assert(
      input.referredById,
      "Internal enquiries need the referring staff member."
    );
    must(tx.db.staff, input.referredById, "Referring staff member");
  }
  if (input.followUpDate) {
    assert(
      input.followUpDate >= isoDate(tx.now),
      "The follow-up date cannot be in the past."
    );
  }
  const enquiry: Enquiry = {
    id: newId(tx, "enq"),
    code: nextCode(tx, "ENQ"),
    type: input.type,
    patientId: patient?.id,
    prospectName: patient
      ? `${patient.firstName} ${patient.lastName}`
      : requireText(input.prospectName, "Enquirer name"),
    phone,
    email: input.email?.trim() || patient?.email,
    source: input.source,
    reason: requireText(input.reason, "Enquiry reason"),
    departmentId: input.departmentId || undefined,
    preferredDoctorId: input.preferredDoctorId || undefined,
    assignedToId: input.assignedToId,
    referredById: input.type === "INTERNAL" ? input.referredById : undefined,
    notes: input.notes?.trim() ?? "",
    followUpDate: input.followUpDate || undefined,
    status: input.followUpDate ? "FOLLOW_UP_REQUIRED" : "NEW",
    createdAt: nowIso(tx),
    updatedAt: nowIso(tx),
  };
  tx.db.enquiries.push(enquiry);
  log(tx, {
    entityType: "enquiry",
    entityId: enquiry.id,
    patientId: enquiry.patientId,
    action: "created",
    summary: `Enquiry ${enquiry.code} logged (${enquiry.source.replace(/_/g, " ").toLowerCase()})`,
  });
  return enquiry;
}

export function updateEnquiry(
  tx: Tx,
  enquiryId: ID,
  input: Pick<
    EnquiryInput,
    | "reason"
    | "departmentId"
    | "preferredDoctorId"
    | "assignedToId"
    | "notes"
    | "email"
  >
) {
  const enquiry = must(tx.db.enquiries, enquiryId, "Enquiry");
  assert(LIVE.includes(enquiry.status), "Closed enquiries cannot be edited.");
  assertRouting(tx, input);
  enquiry.reason = requireText(input.reason, "Enquiry reason");
  enquiry.departmentId = input.departmentId || undefined;
  enquiry.preferredDoctorId = input.preferredDoctorId || undefined;
  enquiry.assignedToId = must(
    tx.db.staff,
    input.assignedToId,
    "Assigned staff member"
  ).id;
  enquiry.notes = input.notes?.trim() ?? "";
  enquiry.email = input.email?.trim() || undefined;
  touch(tx, enquiry);
  return enquiry;
}

export function addFollowUp(
  tx: Tx,
  enquiryId: ID,
  input: { channel: FollowUpChannel; note: string; nextFollowUpDate?: string }
) {
  const enquiry = must(tx.db.enquiries, enquiryId, "Enquiry");
  assert(LIVE.includes(enquiry.status), "This enquiry is closed.");
  if (input.nextFollowUpDate) {
    assert(
      input.nextFollowUpDate >= isoDate(tx.now),
      "The next follow-up date cannot be in the past."
    );
  }
  tx.db.enquiryFollowUps.push({
    id: newId(tx, "efu"),
    enquiryId,
    at: nowIso(tx),
    byId: tx.actorId,
    channel: input.channel,
    note: requireText(input.note, "Follow-up note"),
    nextFollowUpDate: input.nextFollowUpDate || undefined,
  });
  enquiry.followUpDate = input.nextFollowUpDate || undefined;
  if (enquiry.status !== "APPOINTMENT_SCHEDULED") {
    enquiry.status = input.nextFollowUpDate ? "FOLLOW_UP_REQUIRED" : "NEW";
  }
  touch(tx, enquiry);
  log(tx, {
    entityType: "enquiry",
    entityId: enquiry.id,
    patientId: enquiry.patientId,
    action: "follow_up",
    summary: `Follow-up on ${enquiry.code} (${input.channel.toLowerCase().replace("_", " ")})`,
  });
  return enquiry;
}

/**
 * Enquiry → appointment. Registers the prospect as a patient first when they
 * are not on file, so the appointment always points at a real patient record.
 */
export function convertToAppointment(
  tx: Tx,
  enquiryId: ID,
  input: {
    patientId?: ID;
    newPatient?: PatientInput;
    doctorId: ID;
    scheduledAt: string;
    type: AppointmentType;
  }
) {
  const enquiry = must(tx.db.enquiries, enquiryId, "Enquiry");
  assert(
    enquiry.status === "NEW" || enquiry.status === "FOLLOW_UP_REQUIRED",
    "Only open enquiries without an appointment can be converted."
  );
  let patientId = input.patientId ?? enquiry.patientId;
  if (!patientId) {
    assert(
      input.newPatient,
      "Select an existing patient or register the enquirer."
    );
    patientId = registerPatient(tx, input.newPatient).id;
  }
  const appointment = bookAppointment(tx, {
    patientId,
    doctorId: input.doctorId,
    scheduledAt: input.scheduledAt,
    type: input.type,
    source: "ENQUIRY",
    reason: enquiry.reason,
    enquiryId: enquiry.id,
  });
  const patient = must(tx.db.patients, patientId, "Patient");
  enquiry.patientId = patient.id;
  enquiry.prospectName = `${patient.firstName} ${patient.lastName}`;
  enquiry.appointmentId = appointment.id;
  enquiry.preferredDoctorId = input.doctorId;
  enquiry.departmentId = appointment.departmentId;
  enquiry.status = "APPOINTMENT_SCHEDULED";
  enquiry.followUpDate = undefined;
  touch(tx, enquiry);
  log(tx, {
    entityType: "enquiry",
    entityId: enquiry.id,
    patientId: patient.id,
    action: "appointment",
    summary: `Enquiry ${enquiry.code} converted to appointment ${appointment.code}`,
  });
  return appointment;
}

/** Moves the linked appointment, or the next follow-up when none is booked. */
export function rescheduleEnquiry(
  tx: Tx,
  enquiryId: ID,
  input: { scheduledAt?: string; followUpDate?: string }
) {
  const enquiry = must(tx.db.enquiries, enquiryId, "Enquiry");
  assert(LIVE.includes(enquiry.status), "This enquiry is closed.");
  if (enquiry.status === "APPOINTMENT_SCHEDULED") {
    assert(input.scheduledAt, "Choose a new appointment time.");
    rescheduleAppointment(
      tx,
      must(tx.db.appointments, enquiry.appointmentId, "Appointment").id,
      input.scheduledAt
    );
  } else {
    assert(
      input.followUpDate && input.followUpDate >= isoDate(tx.now),
      "Choose a follow-up date from today onwards."
    );
    enquiry.followUpDate = input.followUpDate;
    enquiry.status = "FOLLOW_UP_REQUIRED";
  }
  touch(tx, enquiry);
  return enquiry;
}

export function cancelEnquiry(tx: Tx, enquiryId: ID, reason: string) {
  const enquiry = must(tx.db.enquiries, enquiryId, "Enquiry");
  assert(LIVE.includes(enquiry.status), "This enquiry is already closed.");
  const why = requireText(reason, "Cancellation reason");
  const appointment = find(tx.db.appointments, enquiry.appointmentId);
  if (appointment?.status === "SCHEDULED")
    cancelAppointment(tx, appointment.id, `Enquiry cancelled: ${why}`);
  enquiry.status = "CANCELLED";
  enquiry.cancelReason = why;
  enquiry.followUpDate = undefined;
  touch(tx, enquiry);
  log(tx, {
    entityType: "enquiry",
    entityId: enquiry.id,
    patientId: enquiry.patientId,
    action: "cancelled",
    summary: `Enquiry ${enquiry.code} cancelled: ${why}`,
  });
  return enquiry;
}

export function closeEnquiry(tx: Tx, enquiryId: ID, note: string) {
  const enquiry = must(tx.db.enquiries, enquiryId, "Enquiry");
  assert(
    enquiry.status === "NEW" || enquiry.status === "FOLLOW_UP_REQUIRED",
    "Only enquiries without a booked appointment can be closed."
  );
  enquiry.status = "CLOSED";
  enquiry.followUpDate = undefined;
  enquiry.notes = [
    enquiry.notes,
    `Closed: ${requireText(note, "Closing note")}`,
  ]
    .filter(Boolean)
    .join("\n");
  touch(tx, enquiry);
  log(tx, {
    entityType: "enquiry",
    entityId: enquiry.id,
    patientId: enquiry.patientId,
    action: "closed",
    summary: `Enquiry ${enquiry.code} closed`,
  });
  return enquiry;
}
