import type { BloodGroup, Database, Gender, ID, Patient } from "../sim/schema";
import {
  DomainError,
  assert,
  log,
  must,
  newId,
  nowIso,
  requireText,
  touch,
  type Tx,
} from "../sim/tx";
import { IMAGE_TYPES, removeFilesOf, storeFile, type FileInput } from "./files";

export interface PatientInput {
  firstName: string;
  lastName: string;
  gender: Gender;
  dateOfBirth: string;
  bloodGroup?: BloodGroup;
  phone: string;
  email?: string;
  address: string;
  city: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
  allergies?: string[];
  chronicConditions?: string[];
}

export function normalisePhone(phone: string) {
  const digits = phone.replace(/\D/g, "");
  return digits.length > 10 ? digits.slice(-10) : digits;
}

function validPhone(phone: string, label: string) {
  const digits = normalisePhone(phone);
  if (digits.length !== 10)
    throw new DomainError(`${label} must be a 10-digit mobile number.`);
  return digits;
}

function cleanList(values: string[] | undefined) {
  return [...new Set((values ?? []).map(v => v.trim()).filter(Boolean))];
}

/** One person, one UHID: same mobile, first name and date of birth is the same patient. */
function refuseDuplicate(
  tx: Tx,
  person: { phone: string; firstName: string; dateOfBirth: string },
  exceptId?: ID
) {
  const duplicate = tx.db.patients.find(
    p =>
      p.id !== exceptId &&
      p.phone === person.phone &&
      p.firstName.toLowerCase() === person.firstName.toLowerCase() &&
      p.dateOfBirth === person.dateOfBirth
  );
  if (duplicate) {
    throw new DomainError(
      `${duplicate.firstName} ${duplicate.lastName} is already registered as ${duplicate.uhid}. Use the existing record.`
    );
  }
}

export function registerPatient(
  tx: Tx,
  input: PatientInput,
  photo?: FileInput
): Patient {
  const phone = validPhone(input.phone, "Mobile number");
  const firstName = requireText(input.firstName, "First name");
  const lastName = requireText(input.lastName, "Last name");
  assert(
    input.dateOfBirth && new Date(input.dateOfBirth) <= tx.now,
    "Date of birth must be in the past."
  );

  refuseDuplicate(tx, { phone, firstName, dateOfBirth: input.dateOfBirth });

  const seq = (tx.db.meta.counters["uhid"] ?? 0) + 1;
  tx.db.meta.counters["uhid"] = seq;
  const patient: Patient = {
    id: newId(tx, "pat"),
    uhid: `HMS-${String(tx.now.getFullYear()).slice(2)}-${String(seq).padStart(6, "0")}`,
    firstName,
    lastName,
    gender: input.gender,
    dateOfBirth: input.dateOfBirth,
    bloodGroup: input.bloodGroup,
    phone,
    email: input.email?.trim() || undefined,
    address: requireText(input.address, "Address"),
    city: requireText(input.city, "City"),
    emergencyContactName: requireText(
      input.emergencyContactName,
      "Emergency contact name"
    ),
    emergencyContactPhone: validPhone(
      input.emergencyContactPhone,
      "Emergency contact number"
    ),
    allergies: cleanList(input.allergies),
    chronicConditions: cleanList(input.chronicConditions),
    registeredAt: nowIso(tx),
    createdAt: nowIso(tx),
    updatedAt: nowIso(tx),
  };
  tx.db.patients.push(patient);
  if (photo)
    storeFile(
      tx,
      { type: "PATIENT_PHOTO", id: patient.id },
      photo,
      IMAGE_TYPES
    );
  log(tx, {
    entityType: "patient",
    entityId: patient.id,
    patientId: patient.id,
    action: "registered",
    summary: `${patient.firstName} ${patient.lastName} registered as ${patient.uhid}`,
  });
  return patient;
}

/** Sets (or replaces) the patient's identification photo. */
export function setPatientPhoto(tx: Tx, patientId: ID, photo: FileInput) {
  const patient = must(tx.db.patients, patientId, "Patient");
  removeFilesOf(tx, "PATIENT_PHOTO", patient.id);
  const file = storeFile(
    tx,
    { type: "PATIENT_PHOTO", id: patient.id },
    photo,
    IMAGE_TYPES
  );
  touch(tx, patient);
  log(tx, {
    entityType: "patient",
    entityId: patient.id,
    patientId: patient.id,
    action: "photo",
    summary: `Photo updated for ${patient.uhid}`,
  });
  return { fileId: file.id };
}

export function removePatientPhoto(tx: Tx, patientId: ID) {
  const patient = must(tx.db.patients, patientId, "Patient");
  assert(
    removeFilesOf(tx, "PATIENT_PHOTO", patient.id) > 0,
    `${patient.firstName} ${patient.lastName} has no photo on file.`
  );
  touch(tx, patient);
  log(tx, {
    entityType: "patient",
    entityId: patient.id,
    patientId: patient.id,
    action: "photo",
    summary: `Photo removed from ${patient.uhid}`,
  });
  return patient;
}

/**
 * Why a registration cannot be deleted, or undefined when it can: only a
 * patient registered in error — nothing booked, seen, billed, filed or
 * raised against them yet — may be removed; anyone with history stays.
 */
export function patientRemovalBlock(db: Database, patientId: ID) {
  const own = (row: { patientId?: ID }) => row.patientId === patientId;
  const history = (
    [
      ["appointments", db.appointments.some(own)],
      ["visits", db.encounters.some(own)],
      ["admissions", db.admissions.some(own)],
      ["prescriptions", db.prescriptions.some(own)],
      ["lab orders", db.labOrders.some(own)],
      ["bills", db.invoices.some(own)],
      ["pharmacy sales", db.pharmacyTransactions.some(own)],
      ["documents", db.documents.some(own)],
      ["enquiries", db.enquiries.some(own)],
      ["complaints", db.complaints.some(own)],
      ["feedback", db.feedback.some(own)],
    ] as const
  )
    .filter(([, found]) => found)
    .map(([label]) => label);
  return history.length
    ? `The patient has ${history.join(", ")} on record, so the registration stays.`
    : undefined;
}

/** Deletes a registration made in error (see `patientRemovalBlock`). */
export function removePatient(tx: Tx, patientId: ID) {
  const patient = must(tx.db.patients, patientId, "Patient");
  const block = patientRemovalBlock(tx.db, patient.id);
  assert(!block, block ?? "");
  removeFilesOf(tx, "PATIENT_PHOTO", patient.id);
  tx.db.patients = tx.db.patients.filter(p => p.id !== patient.id);
  // Earlier activity keeps its text but no longer points at the patient.
  for (const event of tx.db.activity)
    if (event.patientId === patient.id) delete event.patientId;
  log(tx, {
    entityType: "patient",
    entityId: patient.id,
    action: "deleted",
    summary: `Registration ${patient.uhid} (${patient.firstName} ${patient.lastName}) deleted — registered in error`,
  });
  return patient;
}

export function updatePatient(
  tx: Tx,
  patientId: ID,
  input: PatientInput
): Patient {
  const patient = must(tx.db.patients, patientId, "Patient");
  assert(
    input.dateOfBirth && new Date(input.dateOfBirth) <= tx.now,
    "Date of birth must be in the past."
  );
  const phone = validPhone(input.phone, "Mobile number");
  const firstName = requireText(input.firstName, "First name");
  refuseDuplicate(
    tx,
    { phone, firstName, dateOfBirth: input.dateOfBirth },
    patient.id
  );
  patient.firstName = firstName;
  patient.lastName = requireText(input.lastName, "Last name");
  patient.gender = input.gender;
  patient.dateOfBirth = input.dateOfBirth;
  patient.bloodGroup = input.bloodGroup;
  patient.phone = phone;
  patient.email = input.email?.trim() || undefined;
  patient.address = requireText(input.address, "Address");
  patient.city = requireText(input.city, "City");
  patient.emergencyContactName = requireText(
    input.emergencyContactName,
    "Emergency contact name"
  );
  patient.emergencyContactPhone = validPhone(
    input.emergencyContactPhone,
    "Emergency contact number"
  );
  patient.allergies = cleanList(input.allergies);
  patient.chronicConditions = cleanList(input.chronicConditions);
  touch(tx, patient);
  log(tx, {
    entityType: "patient",
    entityId: patient.id,
    patientId: patient.id,
    action: "updated",
    summary: `Demographics updated for ${patient.uhid}`,
  });
  return patient;
}

/** Stamps the patient's registration fee on their very first OPD visit only. */
export function isFirstVisit(tx: Tx, patientId: ID) {
  const invoiceIds = new Set(
    tx.db.invoices.filter(inv => inv.patientId === patientId).map(inv => inv.id)
  );
  return !tx.db.invoiceItems.some(
    item => item.sourceType === "REGISTRATION" && invoiceIds.has(item.invoiceId)
  );
}

export const REGISTRATION_FEE = 150;
