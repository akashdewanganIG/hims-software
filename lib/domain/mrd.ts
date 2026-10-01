import type {
  Database,
  DocumentKind,
  ID,
  MedicalRecord,
  PatientDocument,
} from "../sim/schema";
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
  DOCUMENT_TYPES,
  describeDataUrl,
  removeFilesOf,
  storeFile,
  type FileInput,
} from "./files";

export interface ChecklistItem {
  key: string;
  label: string;
  done: boolean;
}

/**
 * What a complete record needs, read straight from the clinical data. The
 * checklist is never stored, so it cannot drift from what was documented.
 */
export function recordChecklist(
  db: Database,
  record: MedicalRecord
): ChecklistItem[] {
  const encounter = find(db.encounters, record.encounterId);
  if (record.recordType === "OPD_CASE_SHEET") {
    return [
      {
        key: "vitals",
        label: "Vitals recorded",
        done: Boolean(encounter?.vitals),
      },
      {
        key: "complaint",
        label: "Chief complaint documented",
        done: Boolean(encounter?.chiefComplaint.trim()),
      },
      {
        key: "diagnosis",
        label: "Diagnosis recorded",
        done: Boolean(encounter?.diagnoses.length),
      },
      {
        key: "notes",
        label: "Consultation notes written",
        done: Boolean(encounter?.consultationNotes.trim()),
      },
      {
        key: "closed",
        label: "Visit closed by doctor",
        done: encounter?.status === "CLOSED",
      },
    ];
  }

  const admission = find(db.admissions, record.admissionId);
  const notes = db.clinicalNotes.filter(
    note => note.admissionId === record.admissionId
  );
  const summary = db.dischargeSummaries.find(
    s => s.admissionId === record.admissionId
  );
  const consent = db.documents.some(
    doc => doc.admissionId === record.admissionId && doc.kind === "CONSENT_FORM"
  );
  const finalBill = db.invoices.some(
    invoice =>
      invoice.admissionId === record.admissionId &&
      invoice.status !== "DRAFT" &&
      invoice.status !== "CANCELLED"
  );
  return [
    {
      key: "admission-note",
      label: "Admission note",
      done: notes.some(n => n.type === "ADMISSION"),
    },
    { key: "consent", label: "Consent form on file", done: consent },
    {
      key: "progress",
      label: "Progress notes",
      done: notes.some(n => n.type === "PROGRESS"),
    },
    {
      key: "summary",
      label: "Discharge summary finalised",
      done: summary?.status === "FINAL",
    },
    {
      key: "discharged",
      label: "Patient discharged",
      done: admission?.status === "DISCHARGED",
    },
    { key: "bill", label: "Final bill issued", done: finalBill },
  ];
}

export function checklistComplete(db: Database, record: MedicalRecord) {
  return recordChecklist(db, record).every(item => item.done);
}

function accessLog(
  tx: Tx,
  record: MedicalRecord,
  action: Parameters<typeof pushLog>[2],
  note?: string
) {
  pushLog(tx, record.id, action, note);
}

function pushLog(
  tx: Tx,
  medicalRecordId: ID,
  action:
    | "CREATED"
    | "VIEWED"
    | "DOCUMENT_ADDED"
    | "DOCUMENT_REMOVED"
    | "SUBMITTED"
    | "RETURNED"
    | "REVIEWED"
    | "ARCHIVED",
  note?: string
) {
  tx.db.recordAccessLogs.push({
    id: newId(tx, "ral"),
    medicalRecordId,
    at: nowIso(tx),
    byId: tx.actorId,
    action,
    note,
  });
}

export function createMedicalRecord(
  tx: Tx,
  input: { encounterId: ID; admissionId?: ID }
): MedicalRecord {
  const existing = tx.db.medicalRecords.find(
    r => r.encounterId === input.encounterId
  );
  if (existing) return existing;
  const encounter = must(tx.db.encounters, input.encounterId, "Encounter");
  const record: MedicalRecord = {
    id: newId(tx, "mr"),
    code: nextCode(tx, "MR"),
    patientId: encounter.patientId,
    encounterId: encounter.id,
    admissionId: input.admissionId,
    recordType: encounter.type === "IPD" ? "IPD_CASE_FILE" : "OPD_CASE_SHEET",
    departmentId: encounter.departmentId,
    attendingDoctorId: encounter.doctorId,
    status: "INCOMPLETE",
    createdAt: nowIso(tx),
    updatedAt: nowIso(tx),
  };
  tx.db.medicalRecords.push(record);
  refreshRecordStatus(tx, record.id);
  return record;
}

/** Moves a record into the review queue as soon as its checklist is met. */
export function refreshRecordStatus(tx: Tx, recordId: ID) {
  const record = must(tx.db.medicalRecords, recordId, "Medical record");
  if (record.status !== "INCOMPLETE") return record;
  if (checklistComplete(tx.db, record)) {
    record.status = "PENDING_REVIEW";
    record.submittedAt = nowIso(tx);
    touch(tx, record);
    accessLog(
      tx,
      record,
      "SUBMITTED",
      "Checklist complete — queued for MRD review"
    );
  }
  return record;
}

export function refreshRecordFor(
  tx: Tx,
  where: { encounterId?: ID; admissionId?: ID }
) {
  const record = tx.db.medicalRecords.find(
    r =>
      (where.encounterId && r.encounterId === where.encounterId) ||
      (where.admissionId && r.admissionId === where.admissionId)
  );
  if (record) refreshRecordStatus(tx, record.id);
  return record;
}

export function reviewRecord(tx: Tx, recordId: ID, note?: string) {
  const record = must(tx.db.medicalRecords, recordId, "Medical record");
  assert(
    record.status === "PENDING_REVIEW",
    "Only records pending review can be marked complete."
  );
  assert(
    checklistComplete(tx.db, record),
    "The record checklist is not complete."
  );
  record.status = "COMPLETE";
  record.reviewedAt = nowIso(tx);
  record.reviewedById = tx.actorId;
  record.reviewNote = note?.trim() || undefined;
  touch(tx, record);
  accessLog(tx, record, "REVIEWED", note);
  log(tx, {
    entityType: "mrd",
    entityId: record.id,
    patientId: record.patientId,
    action: "reviewed",
    summary: `Medical record ${record.code} reviewed and marked complete`,
  });
  return record;
}

export function returnRecord(tx: Tx, recordId: ID, note: string) {
  const record = must(tx.db.medicalRecords, recordId, "Medical record");
  assert(
    record.status === "PENDING_REVIEW",
    "Only records pending review can be returned."
  );
  record.status = "INCOMPLETE";
  record.reviewNote = requireText(note, "Reason for returning");
  touch(tx, record);
  accessLog(tx, record, "RETURNED", record.reviewNote);
  return record;
}

export function resubmitRecord(tx: Tx, recordId: ID) {
  const record = must(tx.db.medicalRecords, recordId, "Medical record");
  assert(
    record.status === "INCOMPLETE",
    "Only incomplete records can be submitted."
  );
  assert(
    checklistComplete(tx.db, record),
    "Complete every checklist item before submitting."
  );
  return refreshRecordStatus(tx, record.id);
}

export function archiveRecord(tx: Tx, recordId: ID, location: string) {
  const record = must(tx.db.medicalRecords, recordId, "Medical record");
  assert(
    record.status === "COMPLETE",
    "Only complete records can be archived."
  );
  record.status = "ARCHIVED";
  record.archivedAt = nowIso(tx);
  record.location = requireText(location, "Storage location");
  touch(tx, record);
  accessLog(tx, record, "ARCHIVED", record.location);
  return record;
}

export function logRecordView(tx: Tx, recordId: ID) {
  const record = must(tx.db.medicalRecords, recordId, "Medical record");
  accessLog(tx, record, "VIEWED");
  return record;
}

/** The case file a document counts towards, if it is filed against one. */
function recordOfDocument(db: Database, doc: PatientDocument) {
  return db.medicalRecords.find(
    r =>
      (doc.admissionId && r.admissionId === doc.admissionId) ||
      (doc.encounterId && r.encounterId === doc.encounterId)
  );
}

/**
 * Adds a document to the patient record. Uploads carry the file itself
 * (`file`); generated documents (discharge summary) and paper originals
 * are listed by name and size only.
 */
export function addDocument(
  tx: Tx,
  input: {
    patientId: ID;
    encounterId?: ID;
    admissionId?: ID;
    title: string;
    kind: DocumentKind;
    fileName?: string;
    sizeKb?: number;
    file?: FileInput;
    sourceId?: ID;
  }
): PatientDocument {
  must(tx.db.patients, input.patientId, "Patient");
  if (input.encounterId) {
    const encounter = must(tx.db.encounters, input.encounterId, "Visit");
    assert(
      encounter.patientId === input.patientId,
      "That visit belongs to another patient."
    );
  }
  if (input.admissionId) {
    const admission = must(tx.db.admissions, input.admissionId, "Admission");
    assert(
      admission.patientId === input.patientId,
      "That admission belongs to another patient."
    );
  }
  const upload = input.file ? describeDataUrl(input.file.data) : undefined;
  const doc: PatientDocument = {
    id: newId(tx, "doc"),
    patientId: input.patientId,
    encounterId: input.encounterId,
    admissionId: input.admissionId,
    title: requireText(input.title, "Document title"),
    kind: input.kind,
    fileName: requireText(input.file?.name ?? input.fileName, "File name"),
    sizeKb: upload?.sizeKb ?? Math.max(1, Math.round(input.sizeKb ?? 1)),
    uploadedAt: nowIso(tx),
    uploadedById: tx.actorId,
    sourceId: input.sourceId,
  };
  tx.db.documents.push(doc);
  if (input.file)
    storeFile(tx, { type: "DOCUMENT", id: doc.id }, input.file, DOCUMENT_TYPES);
  const record = recordOfDocument(tx.db, doc);
  if (record) {
    accessLog(tx, record, "DOCUMENT_ADDED", doc.title);
    refreshRecordStatus(tx, record.id);
  }
  log(tx, {
    entityType: "patient",
    entityId: doc.patientId,
    patientId: doc.patientId,
    action: "document",
    summary: `Document added: ${doc.title}`,
  });
  return doc;
}

/**
 * Why a document cannot be removed, or undefined when it can. Generated
 * documents follow their source, and a case file MRD has reviewed is
 * medico-legally closed.
 */
export function documentChangeBlock(db: Database, doc: PatientDocument) {
  if (doc.sourceId) return "It is generated from the clinical record.";
  const record = recordOfDocument(db, doc);
  if (record && (record.status === "COMPLETE" || record.status === "ARCHIVED"))
    return `Part of case file ${record.code}, which MRD has reviewed.`;
  return undefined;
}

export function removeDocument(tx: Tx, documentId: ID) {
  const doc = must(tx.db.documents, documentId, "Document");
  const blocked = documentChangeBlock(tx.db, doc);
  assert(!blocked, `${doc.title} cannot be removed. ${blocked ?? ""}`.trim());
  tx.db.documents = tx.db.documents.filter(d => d.id !== doc.id);
  removeFilesOf(tx, "DOCUMENT", doc.id);
  const record = recordOfDocument(tx.db, doc);
  if (record) {
    accessLog(tx, record, "DOCUMENT_REMOVED", doc.title);
    reopenIfIncomplete(tx, record);
  }
  log(tx, {
    entityType: "patient",
    entityId: doc.patientId,
    patientId: doc.patientId,
    action: "document",
    summary: `Document removed: ${doc.title}`,
  });
  return doc;
}

/** A queued file that no longer meets its checklist goes back to the ward. */
function reopenIfIncomplete(tx: Tx, record: MedicalRecord) {
  if (record.status === "PENDING_REVIEW" && !checklistComplete(tx.db, record)) {
    record.status = "INCOMPLETE";
    record.submittedAt = undefined;
    touch(tx, record);
  }
}

/** Corrects an uploaded document's title or type. */
export function updateDocument(
  tx: Tx,
  documentId: ID,
  input: { title: string; kind: Exclude<DocumentKind, "DISCHARGE_SUMMARY"> }
) {
  const doc = must(tx.db.documents, documentId, "Document");
  const blocked = documentChangeBlock(tx.db, doc);
  assert(!blocked, `${doc.title} cannot be changed. ${blocked ?? ""}`.trim());
  const title = requireText(input.title, "Document title");
  assert(
    title !== doc.title || input.kind !== doc.kind,
    "Nothing was changed."
  );
  doc.title = title;
  doc.kind = input.kind;
  const record = recordOfDocument(tx.db, doc);
  if (record) reopenIfIncomplete(tx, record);
  log(tx, {
    entityType: "patient",
    entityId: doc.patientId,
    patientId: doc.patientId,
    action: "document",
    summary: `Document updated: ${title}`,
  });
  return doc;
}
