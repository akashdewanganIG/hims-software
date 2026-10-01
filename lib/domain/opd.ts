import type {
  Appointment,
  AppointmentType,
  BookingSource,
  Database,
  Diagnosis,
  Encounter,
  ID,
  OpdDisposition,
  Vitals,
} from "../sim/schema";
import { isSameDay, isoDate } from "../sim/time";
import {
  DomainError,
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
import { postCharge } from "./billing";
import { createMedicalRecord } from "./mrd";
import { REGISTRATION_FEE, isFirstVisit } from "./patients";
import { assertDoctorBookable } from "./wfm";

/**
 * Consultation validity: a paid consultation covers a review with the same
 * doctor for this many days, free of charge — the usual Indian OPD policy.
 */
export const CONSULTATION_VALIDITY_DAYS = 7;

/**
 * The paid visit that makes a consultation with `doctorId` at `at` a free
 * review (the latest one within the validity window), if any.
 */
export function coveringConsultation(
  db: Database,
  patientId: ID,
  doctorId: ID,
  at: Date,
  exceptAppointmentId?: ID
): Appointment | undefined {
  const since = at.getTime() - CONSULTATION_VALIDITY_DAYS * 86_400_000;
  return db.appointments
    .filter(a => {
      if (
        a.id === exceptAppointmentId ||
        a.patientId !== patientId ||
        a.doctorId !== doctorId ||
        !a.checkedInAt
      )
        return false;
      const when = Date.parse(a.checkedInAt);
      if (when < since || when > at.getTime()) return false;
      const line = db.invoiceItems.find(
        i =>
          i.sourceType === "APPOINTMENT" &&
          i.sourceId === a.id &&
          i.category === "CONSULTATION"
      );
      if (!line || line.unitPrice <= 0) return false;
      return (
        db.invoices.find(i => i.id === line.invoiceId)?.status !== "CANCELLED"
      );
    })
    .sort((a, b) => b.checkedInAt!.localeCompare(a.checkedInAt!))[0];
}

const ACTIVE_APPOINTMENT: Appointment["status"][] = [
  "SCHEDULED",
  "CHECKED_IN",
  "IN_CONSULTATION",
];

function doctorOf(tx: Tx, doctorId: ID) {
  const doctor = must(tx.db.staff, doctorId, "Doctor");
  assert(
    doctor.role === "DOCTOR",
    `${doctor.firstName} ${doctor.lastName} is not a doctor.`
  );
  return doctor;
}

function assertSlotFree(
  tx: Tx,
  doctorId: ID,
  scheduledAt: string,
  ignoreId?: ID
) {
  const clash = tx.db.appointments.find(
    a =>
      a.id !== ignoreId &&
      a.doctorId === doctorId &&
      a.scheduledAt === scheduledAt &&
      a.status !== "CANCELLED" &&
      a.status !== "NO_SHOW"
  );
  if (clash)
    throw new DomainError(
      "That slot is already booked for this doctor. Pick another time."
    );
}

/** One live appointment per patient per doctor per day. */
function assertNoSameDayBooking(
  tx: Tx,
  patientId: ID,
  doctorId: ID,
  when: Date,
  ignoreId?: ID
) {
  const sameDay = tx.db.appointments.find(
    a =>
      a.id !== ignoreId &&
      a.patientId === patientId &&
      a.doctorId === doctorId &&
      ACTIVE_APPOINTMENT.includes(a.status) &&
      isSameDay(a.scheduledAt, when)
  );
  if (sameDay) {
    const patient = must(tx.db.patients, patientId, "Patient");
    const doctor = must(tx.db.staff, doctorId, "Doctor");
    throw new DomainError(
      `${patient.firstName} already has ${sameDay.code} with Dr ${doctor.lastName} that day.`
    );
  }
}

export function bookAppointment(
  tx: Tx,
  input: {
    patientId: ID;
    doctorId: ID;
    scheduledAt: string;
    type: AppointmentType;
    source: BookingSource;
    reason: string;
    enquiryId?: ID;
    slotMinutes?: number;
    /** Walk-ins are booked into "now" and may share a slot. */
    allowOverbook?: boolean;
  }
): Appointment {
  const patient = must(tx.db.patients, input.patientId, "Patient");
  const doctor = doctorOf(tx, input.doctorId);
  const when = new Date(input.scheduledAt);
  assert(
    !Number.isNaN(when.getTime()),
    "Choose a valid appointment date and time."
  );
  assert(
    when.getTime() >= tx.now.getTime() - 10 * 60_000,
    "Appointments cannot be booked in the past."
  );
  assertDoctorBookable(tx.db, doctor, isoDate(when));
  if (!input.allowOverbook) assertSlotFree(tx, doctor.id, when.toISOString());
  assertNoSameDayBooking(tx, patient.id, doctor.id, when);

  const appointment: Appointment = {
    id: newId(tx, "apt"),
    code: nextCode(tx, "APT"),
    patientId: patient.id,
    doctorId: doctor.id,
    departmentId: doctor.departmentId,
    scheduledAt: when.toISOString(),
    slotMinutes: input.slotMinutes ?? 15,
    type: input.type,
    source: input.source,
    enquiryId: input.enquiryId,
    reason: requireText(input.reason, "Visit reason"),
    status: "SCHEDULED",
    createdAt: nowIso(tx),
    updatedAt: nowIso(tx),
  };
  tx.db.appointments.push(appointment);
  log(tx, {
    entityType: "appointment",
    entityId: appointment.id,
    patientId: patient.id,
    action: "booked",
    summary: `${appointment.code} booked with Dr ${doctor.firstName} ${doctor.lastName}`,
  });
  return appointment;
}

export function rescheduleAppointment(
  tx: Tx,
  appointmentId: ID,
  scheduledAt: string
) {
  const appointment = must(tx.db.appointments, appointmentId, "Appointment");
  assert(
    appointment.status === "SCHEDULED",
    "Only scheduled appointments can be rescheduled."
  );
  const when = new Date(scheduledAt);
  assert(
    !Number.isNaN(when.getTime()),
    "Choose a valid appointment date and time."
  );
  assert(
    when.getTime() >= tx.now.getTime() - 10 * 60_000,
    "Choose a time in the future."
  );
  assert(
    when.toISOString() !== appointment.scheduledAt,
    "Choose a different time to reschedule to."
  );
  const doctor = doctorOf(tx, appointment.doctorId);
  assertDoctorBookable(tx.db, doctor, isoDate(when));
  assertSlotFree(tx, doctor.id, when.toISOString(), appointment.id);
  assertNoSameDayBooking(
    tx,
    appointment.patientId,
    doctor.id,
    when,
    appointment.id
  );
  appointment.rescheduledFrom = appointment.scheduledAt;
  appointment.scheduledAt = when.toISOString();
  touch(tx, appointment);
  log(tx, {
    entityType: "appointment",
    entityId: appointment.id,
    patientId: appointment.patientId,
    action: "rescheduled",
    summary: `${appointment.code} rescheduled`,
  });
  return appointment;
}

/** A booked enquiry whose appointment falls through goes back to follow-up. */
function reopenEnquiry(tx: Tx, appointment: Appointment, why: string) {
  const enquiry = find(tx.db.enquiries, appointment.enquiryId);
  if (!enquiry || enquiry.status !== "APPOINTMENT_SCHEDULED") return;
  enquiry.status = "FOLLOW_UP_REQUIRED";
  enquiry.followUpDate = isoDate(tx.now);
  enquiry.appointmentId = undefined;
  touch(tx, enquiry);
  log(tx, {
    entityType: "enquiry",
    entityId: enquiry.id,
    patientId: enquiry.patientId,
    action: "reopened",
    summary: `Enquiry ${enquiry.code} needs follow-up: ${appointment.code} ${why}`,
  });
}

export function cancelAppointment(tx: Tx, appointmentId: ID, reason: string) {
  const appointment = must(tx.db.appointments, appointmentId, "Appointment");
  assert(
    appointment.status === "SCHEDULED",
    "Only appointments that have not been checked in can be cancelled."
  );
  appointment.status = "CANCELLED";
  appointment.cancelledAt = nowIso(tx);
  appointment.cancelReason = requireText(reason, "Cancellation reason");
  touch(tx, appointment);
  reopenEnquiry(tx, appointment, "was cancelled");
  log(tx, {
    entityType: "appointment",
    entityId: appointment.id,
    patientId: appointment.patientId,
    action: "cancelled",
    summary: `${appointment.code} cancelled: ${appointment.cancelReason}`,
  });
  return appointment;
}

export function markNoShow(tx: Tx, appointmentId: ID) {
  const appointment = must(tx.db.appointments, appointmentId, "Appointment");
  assert(
    appointment.status === "SCHEDULED",
    "Only scheduled appointments can be marked as no-show."
  );
  assert(
    new Date(appointment.scheduledAt) <= tx.now,
    "The appointment time has not passed yet."
  );
  appointment.status = "NO_SHOW";
  touch(tx, appointment);
  reopenEnquiry(tx, appointment, "was a no-show");
  log(tx, {
    entityType: "appointment",
    entityId: appointment.id,
    patientId: appointment.patientId,
    action: "no_show",
    summary: `${appointment.code} marked no-show`,
  });
  return appointment;
}

/**
 * Arrival at the front desk: issues the queue token, opens the OPD encounter
 * and raises the consultation bill (plus registration on a first visit).
 */
export function checkIn(tx: Tx, appointmentId: ID): Encounter {
  const appointment = must(tx.db.appointments, appointmentId, "Appointment");
  assert(
    appointment.status === "SCHEDULED",
    `${appointment.code} is not awaiting check-in.`
  );
  assert(
    isSameDay(appointment.scheduledAt, tx.now),
    "Patients can only be checked in on the day of their appointment."
  );
  const doctor = doctorOf(tx, appointment.doctorId);

  const today = isoDate(tx.now);
  const tokens = tx.db.appointments.filter(
    a =>
      a.doctorId === doctor.id &&
      a.tokenNumber &&
      isoDate(a.scheduledAt) === today
  ).length;

  const encounter: Encounter = {
    id: newId(tx, "enc"),
    code: nextCode(tx, "OPD"),
    patientId: appointment.patientId,
    type: "OPD",
    departmentId: appointment.departmentId,
    doctorId: doctor.id,
    appointmentId: appointment.id,
    status: "OPEN",
    startedAt: nowIso(tx),
    chiefComplaint: appointment.reason,
    history: "",
    examination: "",
    diagnoses: [],
    consultationNotes: "",
    advice: "",
    createdAt: nowIso(tx),
    updatedAt: nowIso(tx),
  };
  tx.db.encounters.push(encounter);

  appointment.status = "CHECKED_IN";
  appointment.tokenNumber = tokens + 1;
  appointment.checkedInAt = nowIso(tx);
  appointment.encounterId = encounter.id;
  touch(tx, appointment);

  const target = { patientId: encounter.patientId, encounterId: encounter.id };
  if (isFirstVisit(tx, encounter.patientId)) {
    postCharge(tx, target, {
      category: "REGISTRATION",
      description: "New patient registration",
      quantity: 1,
      unitPrice: REGISTRATION_FEE,
      sourceType: "REGISTRATION",
      sourceId: encounter.patientId,
    });
  }
  const fee = doctor.consultationFee ?? 500;
  const followUp = appointment.type === "FOLLOW_UP";
  // A review within the validity of a paid consultation is free; other
  // follow-ups are charged at half the fee.
  const covering = coveringConsultation(
    tx.db,
    appointment.patientId,
    doctor.id,
    tx.now,
    appointment.id
  );
  postCharge(tx, target, {
    category: "CONSULTATION",
    description: covering
      ? `Review consultation · Dr ${doctor.firstName} ${doctor.lastName} — free within ${CONSULTATION_VALIDITY_DAYS} days of the visit on ${isoDate(new Date(covering.checkedInAt!))}`
      : `${followUp ? "Follow-up consultation" : "Consultation"} · Dr ${doctor.firstName} ${doctor.lastName}`,
    quantity: 1,
    unitPrice: covering ? 0 : followUp ? Math.round(fee / 2) : fee,
    sourceType: "APPOINTMENT",
    sourceId: appointment.id,
  });

  log(tx, {
    entityType: "appointment",
    entityId: appointment.id,
    patientId: appointment.patientId,
    action: "checked_in",
    summary: `Checked in for Dr ${doctor.lastName} — token ${appointment.tokenNumber}`,
  });
  return encounter;
}

export function recordVitals(
  tx: Tx,
  encounterId: ID,
  vitals: Omit<Vitals, "recordedAt" | "recordedById">
) {
  const encounter = must(tx.db.encounters, encounterId, "Encounter");
  assert(
    encounter.status === "OPEN",
    "Vitals can only be recorded on an open encounter."
  );
  const checks: Array<[number | undefined, number, number, string]> = [
    [vitals.temperatureC, 30, 45, "Temperature"],
    [vitals.pulse, 20, 250, "Pulse"],
    [vitals.systolic, 50, 260, "Systolic BP"],
    [vitals.diastolic, 30, 160, "Diastolic BP"],
    [vitals.respiratoryRate, 5, 60, "Respiratory rate"],
    [vitals.spo2, 50, 100, "SpO₂"],
    [vitals.weightKg, 1, 300, "Weight"],
    [vitals.heightCm, 30, 230, "Height"],
  ];
  for (const [value, min, max, label] of checks) {
    if (value === undefined) continue;
    assert(
      Number.isFinite(value) && value >= min && value <= max,
      `${label} must be between ${min} and ${max}.`
    );
  }
  encounter.vitals = {
    ...vitals,
    recordedAt: nowIso(tx),
    recordedById: tx.actorId,
  };
  touch(tx, encounter);
  log(tx, {
    entityType: "encounter",
    entityId: encounter.id,
    patientId: encounter.patientId,
    action: "vitals",
    summary: `Vitals recorded for ${encounter.code}`,
  });
  return encounter;
}

export function startConsultation(tx: Tx, appointmentId: ID) {
  const appointment = must(tx.db.appointments, appointmentId, "Appointment");
  assert(
    appointment.status === "CHECKED_IN",
    "The patient must be checked in before the consultation starts."
  );
  appointment.status = "IN_CONSULTATION";
  appointment.consultationStartedAt = nowIso(tx);
  touch(tx, appointment);
  log(tx, {
    entityType: "appointment",
    entityId: appointment.id,
    patientId: appointment.patientId,
    action: "consultation",
    summary: `Consultation started (${appointment.code})`,
  });
  return appointment;
}

export interface ConsultationInput {
  chiefComplaint: string;
  history: string;
  examination: string;
  diagnoses: Diagnosis[];
  consultationNotes: string;
  advice: string;
  followUpDate?: string;
  referral?: { toDepartmentId?: ID; note: string };
}

export function saveConsultation(
  tx: Tx,
  encounterId: ID,
  input: ConsultationInput
) {
  const encounter = must(tx.db.encounters, encounterId, "Encounter");
  assert(
    encounter.status === "OPEN",
    "This visit is closed; its notes are locked."
  );
  encounter.chiefComplaint = input.chiefComplaint.trim();
  encounter.history = input.history.trim();
  encounter.examination = input.examination.trim();
  encounter.diagnoses = input.diagnoses
    .map(d => ({
      ...d,
      description: d.description.trim(),
      code: d.code?.trim() || undefined,
    }))
    .filter(d => d.description);
  encounter.consultationNotes = input.consultationNotes.trim();
  encounter.advice = input.advice.trim();
  encounter.followUpDate = input.followUpDate || undefined;
  encounter.referral = input.referral?.note.trim()
    ? {
        toDepartmentId: input.referral.toDepartmentId,
        note: input.referral.note.trim(),
      }
    : undefined;
  touch(tx, encounter);
  return encounter;
}

/**
 * Visit closure. Locks the OPD record, completes the appointment, converts the
 * originating enquiry and opens the case sheet in MRD.
 */
export function completeVisit(
  tx: Tx,
  encounterId: ID,
  disposition: OpdDisposition
) {
  const encounter = must(tx.db.encounters, encounterId, "Encounter");
  assert(
    encounter.type === "OPD" && encounter.status === "OPEN",
    "This visit is already closed."
  );
  const appointment = must(
    tx.db.appointments,
    encounter.appointmentId,
    "Appointment"
  );
  assert(
    appointment.status === "IN_CONSULTATION",
    "Start the consultation before closing the visit."
  );
  assert(
    encounter.diagnoses.length > 0,
    "Record at least one diagnosis before closing the visit."
  );
  assert(
    disposition !== "FOLLOW_UP" || encounter.followUpDate,
    "Set a follow-up date for a follow-up disposition."
  );
  assert(
    disposition !== "REFERRED" || encounter.referral,
    "Add referral notes for a referred patient."
  );

  encounter.disposition = disposition;
  encounter.status = "CLOSED";
  encounter.closedAt = nowIso(tx);
  touch(tx, encounter);

  appointment.status = "COMPLETED";
  appointment.completedAt = nowIso(tx);
  touch(tx, appointment);

  const enquiry = find(tx.db.enquiries, appointment.enquiryId);
  if (enquiry && enquiry.status === "APPOINTMENT_SCHEDULED") {
    enquiry.status = "CONVERTED";
    touch(tx, enquiry);
    log(tx, {
      entityType: "enquiry",
      entityId: enquiry.id,
      patientId: enquiry.patientId,
      action: "converted",
      summary: `Enquiry ${enquiry.code} converted — consultation completed`,
    });
  }

  createMedicalRecord(tx, { encounterId: encounter.id });
  log(tx, {
    entityType: "encounter",
    entityId: encounter.id,
    patientId: encounter.patientId,
    action: "closed",
    summary: `OPD visit ${encounter.code} closed (${disposition.replace(/_/g, " ").toLowerCase()})`,
  });
  return encounter;
}

/** Walk-in: book into the current slot and check in at once. */
export function registerWalkIn(
  tx: Tx,
  input: { patientId: ID; doctorId: ID; reason: string; type?: AppointmentType }
) {
  const appointment = bookAppointment(tx, {
    patientId: input.patientId,
    doctorId: input.doctorId,
    scheduledAt: nowIso(tx),
    type: input.type ?? "NEW",
    source: "WALK_IN",
    reason: input.reason,
    allowOverbook: true,
  });
  const encounter = checkIn(tx, appointment.id);
  return { appointment, encounter };
}
