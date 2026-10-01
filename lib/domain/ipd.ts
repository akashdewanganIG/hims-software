import type {
  Admission,
  AdmissionSource,
  Bed,
  BedAssignment,
  CareOrderType,
  ClinicalNoteType,
  Database,
  DischargeSummary,
  Encounter,
  ID,
  Ward,
} from "../sim/schema";
import { ageInYears, bedDays, isSameDay, isoDate } from "../sim/time";
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
  round2,
  touch,
  type Tx,
} from "../sim/tx";
import {
  finaliseInvoice,
  invoiceTotals,
  openInvoiceFor,
  postCharge,
} from "./billing";
import { activateAdmission } from "./encounters";
import { closeUncollected } from "./pharmacy";
import { addDocument, createMedicalRecord, refreshRecordFor } from "./mrd";

export const ADMISSION_FEE = 1000;
export const NURSING_CHARGE_PER_DAY = 600;

const IN_HOUSE: Admission["status"][] = [
  "ADMITTED",
  "ACTIVE",
  "TRANSFER_PENDING",
  "DISCHARGE_PENDING",
];

export function isInHouse(admission: Admission) {
  return IN_HOUSE.includes(admission.status);
}

export function wardOfBed(db: Database, bed: Bed): Ward {
  const room = must(db.rooms, bed.roomId, "Room");
  return must(db.wards, room.wardId, "Ward");
}

export function currentAssignment(db: Database, admissionId: ID) {
  return db.bedAssignments.find(a => a.admissionId === admissionId && !a.toAt);
}

function setBed(
  tx: Tx,
  bed: Bed,
  status: Bed["status"],
  admissionId?: ID,
  note?: string
) {
  bed.status = status;
  bed.admissionId = admissionId;
  bed.note = note;
  bed.statusChangedAt = nowIso(tx);
  touch(tx, bed);
}

/** Why a patient may not go to a bed (single-gender or paediatric ward), if at all. */
export function bedRestrictionReason(
  db: Database,
  bed: Bed,
  patient: { gender: string; dateOfBirth: string },
  at: Date
) {
  const ward = wardOfBed(db, bed);
  const r = ward.restriction;
  if (!r) return undefined;
  if (r.gender && patient.gender !== r.gender)
    return `${ward.name} is for ${r.gender.toLowerCase()} patients only.`;
  if (r.maxAge !== undefined && ageInYears(patient.dateOfBirth, at) > r.maxAge)
    return `${ward.name} is for children up to ${r.maxAge} years.`;
  return undefined;
}

function assertBedSuitsPatient(tx: Tx, bed: Bed, patientId: ID) {
  const patient = must(tx.db.patients, patientId, "Patient");
  const reason = bedRestrictionReason(tx.db, bed, patient, tx.now);
  if (reason) throw new DomainError(`Bed ${bed.code}: ${reason}`);
}

function assertBedTakeable(bed: Bed, forAdmissionId?: ID) {
  if (bed.status === "AVAILABLE") return;
  if (
    bed.status === "RESERVED" &&
    (!bed.admissionId || bed.admissionId === forAdmissionId)
  )
    return;
  throw new DomainError(
    `Bed ${bed.code} is ${bed.status.toLowerCase()} and cannot take a patient.`
  );
}

/* ------------------------------------------------------------------ */
/* Admission                                                           */
/* ------------------------------------------------------------------ */

export function admitPatient(
  tx: Tx,
  input: {
    patientId: ID;
    doctorId: ID;
    bedId: ID;
    reason: string;
    provisionalDiagnosis: string;
    source: AdmissionSource;
    sourceEncounterId?: ID;
    expectedDischargeDate?: string;
  }
): Admission {
  const patient = must(tx.db.patients, input.patientId, "Patient");
  const doctor = must(tx.db.staff, input.doctorId, "Admitting doctor");
  assert(doctor.role === "DOCTOR", "The admitting clinician must be a doctor.");
  const already = tx.db.admissions.find(
    a => a.patientId === patient.id && isInHouse(a)
  );
  if (already) {
    throw new DomainError(
      `${patient.firstName} ${patient.lastName} is already admitted (${already.code}).`
    );
  }
  const bed = must(tx.db.beds, input.bedId, "Bed");
  assertBedTakeable(bed);
  assertBedSuitsPatient(tx, bed, patient.id);
  if (input.sourceEncounterId) {
    const source = must(
      tx.db.encounters,
      input.sourceEncounterId,
      "Source OPD visit"
    );
    assert(
      source.patientId === patient.id,
      "The source visit belongs to another patient."
    );
  }
  if (input.expectedDischargeDate) {
    assert(
      input.expectedDischargeDate >= isoDate(tx.now),
      "The expected discharge date cannot be in the past."
    );
  }

  const encounter: Encounter = {
    id: newId(tx, "enc"),
    code: nextCode(tx, "IPD"),
    patientId: patient.id,
    type: "IPD",
    departmentId: doctor.departmentId,
    doctorId: doctor.id,
    status: "OPEN",
    startedAt: nowIso(tx),
    chiefComplaint: requireText(input.reason, "Admission reason"),
    history: "",
    examination: "",
    diagnoses: [
      {
        description: requireText(
          input.provisionalDiagnosis,
          "Provisional diagnosis"
        ),
        type: "PROVISIONAL",
      },
    ],
    consultationNotes: "",
    advice: "",
    createdAt: nowIso(tx),
    updatedAt: nowIso(tx),
  };
  tx.db.encounters.push(encounter);

  const admission: Admission = {
    id: newId(tx, "adm"),
    code: nextCode(tx, "ADM"),
    patientId: patient.id,
    encounterId: encounter.id,
    doctorId: doctor.id,
    departmentId: doctor.departmentId,
    source: input.source,
    sourceEncounterId: input.sourceEncounterId,
    admittedAt: nowIso(tx),
    reason: encounter.chiefComplaint,
    provisionalDiagnosis: input.provisionalDiagnosis.trim(),
    status: "ADMITTED",
    expectedDischargeDate: input.expectedDischargeDate || undefined,
    createdAt: nowIso(tx),
    updatedAt: nowIso(tx),
  };
  tx.db.admissions.push(admission);
  encounter.admissionId = admission.id;

  const assignment: BedAssignment = {
    id: newId(tx, "bas"),
    admissionId: admission.id,
    bedId: bed.id,
    fromAt: nowIso(tx),
    reason: "Admission",
    byId: tx.actorId,
  };
  tx.db.bedAssignments.push(assignment);
  setBed(tx, bed, "OCCUPIED", admission.id);

  postCharge(
    tx,
    {
      patientId: patient.id,
      encounterId: encounter.id,
      admissionId: admission.id,
    },
    {
      category: "OTHER",
      description: "Admission & IP registration",
      quantity: 1,
      unitPrice: ADMISSION_FEE,
      sourceType: "ADMISSION",
      sourceId: admission.id,
    }
  );

  createMedicalRecord(tx, {
    encounterId: encounter.id,
    admissionId: admission.id,
  });
  log(tx, {
    entityType: "admission",
    entityId: admission.id,
    patientId: patient.id,
    action: "admitted",
    summary: `Admitted as ${admission.code} to bed ${bed.code} under Dr ${doctor.firstName} ${doctor.lastName}`,
  });
  return admission;
}

/* ------------------------------------------------------------------ */
/* Inpatient care                                                      */
/* ------------------------------------------------------------------ */

function liveAdmission(tx: Tx, admissionId: ID) {
  const admission = must(tx.db.admissions, admissionId, "Admission");
  assert(isInHouse(admission), `Admission ${admission.code} is discharged.`);
  return admission;
}

export function addClinicalNote(
  tx: Tx,
  admissionId: ID,
  input: { type: ClinicalNoteType; text: string }
) {
  const admission = liveAdmission(tx, admissionId);
  const author = must(tx.db.staff, tx.actorId, "Author");
  const note = {
    id: newId(tx, "cn"),
    patientId: admission.patientId,
    encounterId: admission.encounterId,
    admissionId: admission.id,
    type: input.type,
    authorId: author.id,
    at: nowIso(tx),
    text: requireText(input.text, "Note"),
  };
  tx.db.clinicalNotes.push(note);

  // A doctor's progress note is a billable consultant visit, once per day.
  if (input.type === "PROGRESS" && author.role === "DOCTOR") {
    const alreadyToday = tx.db.clinicalNotes.some(
      n =>
        n.id !== note.id &&
        n.admissionId === admission.id &&
        n.type === "PROGRESS" &&
        n.authorId === author.id &&
        isSameDay(n.at, tx.now)
    );
    if (!alreadyToday) {
      postCharge(
        tx,
        {
          patientId: admission.patientId,
          encounterId: admission.encounterId,
          admissionId: admission.id,
        },
        {
          category: "CONSULTATION",
          description: `Consultant visit · Dr ${author.firstName} ${author.lastName}`,
          quantity: 1,
          unitPrice: author.consultationFee ?? 600,
          sourceType: "MANUAL",
          sourceId: note.id,
        }
      );
    }
  }
  if (input.type !== "ADMISSION") activateAdmission(tx, admission.id);
  refreshRecordFor(tx, { admissionId: admission.id });
  log(tx, {
    entityType: "admission",
    entityId: admission.id,
    patientId: admission.patientId,
    action: "note",
    summary: `${input.type.charAt(0)}${input.type.slice(1).toLowerCase()} note added to ${admission.code}`,
  });
  return note;
}

export function addCareOrder(
  tx: Tx,
  admissionId: ID,
  input: { type: CareOrderType; instruction: string }
) {
  const admission = liveAdmission(tx, admissionId);
  const order = {
    id: newId(tx, "co"),
    admissionId: admission.id,
    type: input.type,
    instruction: requireText(input.instruction, "Instruction"),
    orderedById: tx.actorId,
    orderedAt: nowIso(tx),
    status: "ACTIVE" as const,
    createdAt: nowIso(tx),
    updatedAt: nowIso(tx),
  };
  tx.db.careOrders.push(order);
  activateAdmission(tx, admission.id);
  log(tx, {
    entityType: "admission",
    entityId: admission.id,
    patientId: admission.patientId,
    action: "order",
    summary: `${input.type.toLowerCase()} order: ${order.instruction}`,
  });
  return order;
}

export function endCareOrder(
  tx: Tx,
  orderId: ID,
  status: "COMPLETED" | "DISCONTINUED"
) {
  const order = must(tx.db.careOrders, orderId, "Care order");
  assert(order.status === "ACTIVE", "This order is no longer active.");
  const admission = must(tx.db.admissions, order.admissionId, "Admission");
  order.status = status;
  order.endedAt = nowIso(tx);
  touch(tx, order);
  log(tx, {
    entityType: "admission",
    entityId: admission.id,
    patientId: admission.patientId,
    action: "order_ended",
    summary: `${order.type.toLowerCase()} order ${status.toLowerCase()}: ${order.instruction}`,
  });
  return order;
}

/* ------------------------------------------------------------------ */
/* Bed movement                                                        */
/* ------------------------------------------------------------------ */

/**
 * Closing a stay in a bed posts its room and nursing charges for the
 * bed-days used, so the running bill always reflects completed stays.
 */
function closeAssignment(
  tx: Tx,
  assignment: BedAssignment,
  admission: Admission
) {
  assignment.toAt = nowIso(tx);
  const bed = must(tx.db.beds, assignment.bedId, "Bed");
  const ward = wardOfBed(tx.db, bed);
  const days = bedDays(assignment.fromAt, assignment.toAt);
  const target = {
    patientId: admission.patientId,
    encounterId: admission.encounterId,
    admissionId: admission.id,
  };
  postCharge(tx, target, {
    category: "ROOM",
    description: `${ward.name} · bed ${bed.code} (${days} day${days === 1 ? "" : "s"})`,
    quantity: days,
    unitPrice: ward.dailyRate,
    sourceType: "BED_ASSIGNMENT",
    sourceId: assignment.id,
    serviceDate: assignment.fromAt,
  });
  postCharge(tx, target, {
    category: "NURSING",
    description: `Nursing care · ${ward.name} (${days} day${days === 1 ? "" : "s"})`,
    quantity: days,
    unitPrice: NURSING_CHARGE_PER_DAY,
    sourceType: "BED_ASSIGNMENT",
    sourceId: assignment.id,
    serviceDate: assignment.fromAt,
  });
  return bed;
}

/** Charges accrued in the current bed but not yet posted to the bill. */
export function unpostedBedCharges(db: Database, admissionId: ID, now: Date) {
  const assignment = currentAssignment(db, admissionId);
  if (!assignment) return 0;
  const bed = find(db.beds, assignment.bedId);
  if (!bed) return 0;
  const ward = wardOfBed(db, bed);
  const days = bedDays(assignment.fromAt, now.toISOString());
  return round2(days * (ward.dailyRate + NURSING_CHARGE_PER_DAY));
}

export function requestTransfer(
  tx: Tx,
  admissionId: ID,
  input: { toBedId: ID; reason: string }
) {
  const admission = liveAdmission(tx, admissionId);
  assert(
    admission.status === "ADMITTED" || admission.status === "ACTIVE",
    "A transfer can only be requested for an admitted patient who is not already moving or being discharged."
  );
  const current = currentAssignment(tx.db, admission.id);
  assert(current, "This admission has no current bed.");
  assert(current.bedId !== input.toBedId, "Choose a different bed.");
  const target = must(tx.db.beds, input.toBedId, "Target bed");
  assertBedTakeable(target);
  assertBedSuitsPatient(tx, target, admission.patientId);
  setBed(
    tx,
    target,
    "RESERVED",
    admission.id,
    `Held for transfer of ${admission.code}`
  );
  admission.pendingTransfer = {
    toBedId: target.id,
    reason: requireText(input.reason, "Transfer reason"),
    requestedAt: nowIso(tx),
    requestedById: tx.actorId,
  };
  admission.status = "TRANSFER_PENDING";
  touch(tx, admission);
  log(tx, {
    entityType: "admission",
    entityId: admission.id,
    patientId: admission.patientId,
    action: "transfer_requested",
    summary: `Transfer requested for ${admission.code} to bed ${target.code}`,
  });
  return admission;
}

export function completeTransfer(tx: Tx, admissionId: ID) {
  const admission = must(tx.db.admissions, admissionId, "Admission");
  assert(
    admission.status === "TRANSFER_PENDING" && admission.pendingTransfer,
    "There is no pending transfer for this admission."
  );
  const current = currentAssignment(tx.db, admission.id);
  assert(current, "This admission has no current bed.");
  const target = must(
    tx.db.beds,
    admission.pendingTransfer.toBedId,
    "Target bed"
  );
  assertBedTakeable(target, admission.id);

  const oldBed = closeAssignment(tx, current, admission);
  setBed(tx, oldBed, "CLEANING", undefined, `Vacated by ${admission.code}`);

  tx.db.bedAssignments.push({
    id: newId(tx, "bas"),
    admissionId: admission.id,
    bedId: target.id,
    fromAt: nowIso(tx),
    reason: `Transfer: ${admission.pendingTransfer.reason}`,
    byId: tx.actorId,
  });
  setBed(tx, target, "OCCUPIED", admission.id);
  admission.pendingTransfer = undefined;
  admission.status = "ACTIVE";
  touch(tx, admission);
  log(tx, {
    entityType: "admission",
    entityId: admission.id,
    patientId: admission.patientId,
    action: "transferred",
    summary: `${admission.code} moved from bed ${oldBed.code} to ${target.code}`,
  });
  return admission;
}

export function cancelTransfer(tx: Tx, admissionId: ID) {
  const admission = must(tx.db.admissions, admissionId, "Admission");
  assert(
    admission.status === "TRANSFER_PENDING" && admission.pendingTransfer,
    "There is no pending transfer."
  );
  const target = find(tx.db.beds, admission.pendingTransfer.toBedId);
  if (target?.status === "RESERVED" && target.admissionId === admission.id) {
    setBed(tx, target, "AVAILABLE");
  }
  admission.pendingTransfer = undefined;
  admission.status = "ACTIVE";
  touch(tx, admission);
  log(tx, {
    entityType: "admission",
    entityId: admission.id,
    patientId: admission.patientId,
    action: "transfer_cancelled",
    summary: `Transfer cancelled for ${admission.code}${target ? `; bed ${target.code} released` : ""}`,
  });
  return admission;
}

/* ------------------------------------------------------------------ */
/* Discharge                                                           */
/* ------------------------------------------------------------------ */

export function initiateDischarge(tx: Tx, admissionId: ID) {
  const admission = liveAdmission(tx, admissionId);
  assert(
    admission.status === "ADMITTED" || admission.status === "ACTIVE",
    admission.status === "TRANSFER_PENDING"
      ? "Complete or cancel the pending transfer first."
      : "Discharge has already been initiated."
  );
  admission.status = "DISCHARGE_PENDING";
  admission.dischargeInitiatedAt = nowIso(tx);
  touch(tx, admission);
  if (!tx.db.dischargeSummaries.some(s => s.admissionId === admission.id)) {
    const encounter = must(
      tx.db.encounters,
      admission.encounterId,
      "Encounter"
    );
    tx.db.dischargeSummaries.push({
      id: newId(tx, "dsc"),
      admissionId: admission.id,
      patientId: admission.patientId,
      preparedById: tx.actorId,
      finalDiagnosis:
        encounter.diagnoses.map(d => d.description).join("; ") ||
        admission.provisionalDiagnosis,
      courseInHospital: "",
      proceduresDone: "",
      conditionAtDischarge: "",
      dischargeMedications: "",
      followUpInstructions: "",
      status: "DRAFT",
      createdAt: nowIso(tx),
      updatedAt: nowIso(tx),
    });
  }
  log(tx, {
    entityType: "admission",
    entityId: admission.id,
    patientId: admission.patientId,
    action: "discharge_initiated",
    summary: `Discharge initiated for ${admission.code}`,
  });
  return admission;
}

/**
 * What stands between a discharge in progress and the patient leaving —
 * the clearances enterprise HIMS track: the clinical summary, the billing
 * desk's financial clearance, and items the wards and lab still hold.
 */
export function dischargeClearance(
  db: Database,
  admission: Admission,
  now: Date
) {
  const bill = db.invoices.find(
    i => i.admissionId === admission.id && i.status !== "CANCELLED"
  );
  // Signed: deposits beyond the posted charges pay for today's room too.
  const totals = bill ? invoiceTotals(db, bill.id) : undefined;
  const posted = totals ? totals.total - totals.netPaid : 0;
  const summary = db.dischargeSummaries.find(
    s => s.admissionId === admission.id
  );
  return {
    summaryFinal: summary?.status === "FINAL",
    /** The final bill's balance, with today's room and nursing included. */
    balance: round2(
      posted +
        (isInHouse(admission) ? unpostedBedCharges(db, admission.id, now) : 0)
    ),
    billingCleared: Boolean(admission.billingClearedAt),
    pendingLab: db.labOrders.filter(
      o =>
        o.admissionId === admission.id &&
        o.status !== "VERIFIED" &&
        o.status !== "CANCELLED"
    ).length,
    openMedication: db.prescriptions.filter(
      p =>
        p.admissionId === admission.id &&
        !p.isDischargeMedication &&
        (p.status === "PENDING" || p.status === "PARTIALLY_DISPENSED")
    ).length,
  };
}

/**
 * Financial clearance: the billing desk confirms the final bill is settled
 * — or records who approved the patient leaving with dues (insurance,
 * corporate credit, management approval) — before the ward discharges.
 */
export function clearBilling(tx: Tx, admissionId: ID, note?: string) {
  const admission = must(tx.db.admissions, admissionId, "Admission");
  assert(
    admission.status === "DISCHARGE_PENDING",
    "Billing clears a discharge in progress. Initiate the discharge first."
  );
  assert(
    !admission.billingClearedAt,
    "Billing has already cleared this discharge."
  );
  const { balance } = dischargeClearance(tx.db, admission, tx.now);
  const reason = note?.trim() ?? "";
  assert(
    balance <= 0 || reason.length >= 5,
    `₹${balance.toLocaleString("en-IN")} is still due, including today's room and nursing charges. Collect it, or record who approved the patient leaving with dues.`
  );
  admission.billingClearedAt = nowIso(tx);
  admission.billingClearedById = tx.actorId;
  admission.clearanceNote = balance > 0 ? reason : undefined;
  touch(tx, admission);
  log(tx, {
    entityType: "admission",
    entityId: admission.id,
    patientId: admission.patientId,
    action: "billing_cleared",
    summary:
      balance > 0
        ? `Billing cleared ${admission.code} with ₹${balance.toLocaleString("en-IN")} due — ${reason}`
        : `Billing cleared ${admission.code} — no dues`,
  });
  return admission;
}

export function revertDischarge(tx: Tx, admissionId: ID) {
  const admission = must(tx.db.admissions, admissionId, "Admission");
  assert(admission.status === "DISCHARGE_PENDING", "Discharge is not pending.");
  admission.status = "ACTIVE";
  admission.dischargeInitiatedAt = undefined;
  // Treatment continues, so the bill will change: clear it again later.
  admission.billingClearedAt = undefined;
  admission.billingClearedById = undefined;
  admission.clearanceNote = undefined;
  touch(tx, admission);
  const summary = tx.db.dischargeSummaries.find(
    s => s.admissionId === admission.id
  );
  if (summary?.status === "FINAL") {
    summary.status = "DRAFT";
    summary.finalisedAt = undefined;
    touch(tx, summary);
  }
  log(tx, {
    entityType: "admission",
    entityId: admission.id,
    patientId: admission.patientId,
    action: "discharge_reverted",
    summary: `Discharge reverted for ${admission.code}; treatment continues`,
  });
  return admission;
}

export type DischargeSummaryInput = Pick<
  DischargeSummary,
  | "finalDiagnosis"
  | "courseInHospital"
  | "proceduresDone"
  | "conditionAtDischarge"
  | "dischargeMedications"
  | "followUpInstructions"
  | "followUpDate"
>;

export function saveDischargeSummary(
  tx: Tx,
  admissionId: ID,
  input: DischargeSummaryInput,
  finalise = false
) {
  const admission = must(tx.db.admissions, admissionId, "Admission");
  assert(
    admission.status === "DISCHARGE_PENDING",
    "Initiate discharge before preparing the summary."
  );
  const summary = tx.db.dischargeSummaries.find(
    s => s.admissionId === admission.id
  );
  assert(summary, "Discharge summary not found.");
  assert(
    summary.status === "DRAFT",
    "The summary is finalised. Revert the discharge to edit it."
  );
  Object.assign(summary, {
    finalDiagnosis: input.finalDiagnosis.trim(),
    courseInHospital: input.courseInHospital.trim(),
    proceduresDone: input.proceduresDone.trim(),
    conditionAtDischarge: input.conditionAtDischarge.trim(),
    dischargeMedications: input.dischargeMedications.trim(),
    followUpInstructions: input.followUpInstructions.trim(),
    followUpDate: input.followUpDate || undefined,
    preparedById: tx.actorId,
  });
  if (finalise) {
    requireText(summary.finalDiagnosis, "Final diagnosis");
    requireText(summary.courseInHospital, "Course in hospital");
    requireText(summary.conditionAtDischarge, "Condition at discharge");
    requireText(summary.followUpInstructions, "Follow-up instructions");
    summary.status = "FINAL";
    summary.finalisedAt = nowIso(tx);
    const encounter = must(
      tx.db.encounters,
      admission.encounterId,
      "Encounter"
    );
    encounter.diagnoses = [
      { description: summary.finalDiagnosis, type: "PRIMARY" },
    ];
    touch(tx, encounter);
  }
  touch(tx, summary);
  refreshRecordFor(tx, { admissionId: admission.id });
  return summary;
}

/**
 * Final discharge, after the clinical summary and the billing desk's
 * clearance: releases the bed (to cleaning), posts the last room charges,
 * closes the encounter, issues the final bill and files the discharge
 * summary with the IPD case file in MRD.
 */
export function dischargePatient(tx: Tx, admissionId: ID) {
  const admission = must(tx.db.admissions, admissionId, "Admission");
  assert(admission.status === "DISCHARGE_PENDING", "Initiate discharge first.");
  const summary = tx.db.dischargeSummaries.find(
    s => s.admissionId === admission.id
  );
  assert(
    summary?.status === "FINAL",
    "Finalise the discharge summary before discharging the patient."
  );
  assert(
    admission.billingClearedAt,
    "Billing has not cleared this discharge yet. The billing desk clears it once the final bill is settled."
  );

  const assignment = currentAssignment(tx.db, admission.id);
  assert(assignment, "This admission has no current bed.");
  const bed = closeAssignment(tx, assignment, admission);
  setBed(tx, bed, "CLEANING", undefined, `Vacated by ${admission.code}`);

  // Inpatient medication orders stop at discharge; take-home medicines are
  // on the separate discharge prescription.
  for (const rx of tx.db.prescriptions.filter(
    p =>
      p.admissionId === admission.id &&
      !p.isDischargeMedication &&
      (p.status === "PENDING" || p.status === "PARTIALLY_DISPENSED")
  )) {
    closeUncollected(tx, rx.id, "Inpatient order stopped at discharge");
  }

  for (const order of tx.db.careOrders.filter(
    o => o.admissionId === admission.id && o.status === "ACTIVE"
  )) {
    order.status = "COMPLETED";
    order.endedAt = nowIso(tx);
  }

  admission.status = "DISCHARGED";
  admission.dischargedAt = nowIso(tx);
  touch(tx, admission);

  const encounter = must(tx.db.encounters, admission.encounterId, "Encounter");
  encounter.status = "CLOSED";
  encounter.closedAt = nowIso(tx);
  touch(tx, encounter);

  const bill = openInvoiceFor(tx, {
    patientId: admission.patientId,
    encounterId: admission.encounterId,
    admissionId: admission.id,
  });
  finaliseInvoice(tx, bill.id);

  const patient = must(tx.db.patients, admission.patientId, "Patient");
  addDocument(tx, {
    patientId: patient.id,
    encounterId: encounter.id,
    admissionId: admission.id,
    title: `Discharge summary · ${admission.code}`,
    kind: "DISCHARGE_SUMMARY",
    fileName: `discharge-summary-${admission.code.toLowerCase()}.pdf`,
    sizeKb: 180,
    sourceId: summary.id,
  });
  refreshRecordFor(tx, { admissionId: admission.id });

  log(tx, {
    entityType: "admission",
    entityId: admission.id,
    patientId: admission.patientId,
    action: "discharged",
    summary: `${patient.firstName} ${patient.lastName} discharged; bed ${bed.code} released for cleaning`,
  });
  return admission;
}

/* ------------------------------------------------------------------ */
/* Bed housekeeping                                                    */
/* ------------------------------------------------------------------ */

export function setBedHousekeeping(
  tx: Tx,
  bedId: ID,
  status: "AVAILABLE" | "CLEANING" | "MAINTENANCE",
  note?: string
) {
  const bed = must(tx.db.beds, bedId, "Bed");
  if (bed.status === "OCCUPIED") {
    throw new DomainError(
      `Bed ${bed.code} is occupied. Transfer or discharge the patient to free it.`
    );
  }
  if (bed.status === "RESERVED" && bed.admissionId) {
    throw new DomainError(
      `Bed ${bed.code} is held for a pending transfer. Cancel the transfer first.`
    );
  }
  assert(
    bed.status !== status,
    `Bed ${bed.code} is already ${status.toLowerCase()}.`
  );
  if (status === "MAINTENANCE") requireText(note, "Maintenance note");
  const previous = bed.status;
  setBed(tx, bed, status, undefined, note?.trim() || undefined);
  log(tx, {
    entityType: "bed",
    entityId: bed.id,
    action: status.toLowerCase(),
    summary: `Bed ${bed.code}: ${previous.toLowerCase()} → ${status.toLowerCase()}`,
  });
  return bed;
}

export function reserveBed(tx: Tx, bedId: ID, note: string) {
  const bed = must(tx.db.beds, bedId, "Bed");
  assert(
    bed.status === "AVAILABLE",
    `Bed ${bed.code} is not available to reserve.`
  );
  setBed(tx, bed, "RESERVED", undefined, requireText(note, "Reservation note"));
  log(tx, {
    entityType: "bed",
    entityId: bed.id,
    action: "reserved",
    summary: `Bed ${bed.code} reserved: ${bed.note}`,
  });
  return bed;
}
