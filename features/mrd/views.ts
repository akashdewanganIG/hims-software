/**
 * View builders for mrd: pure functions of the database, the clock and
 * the request's parameters. Registered in lib/views/registry.ts; the browser
 * sandbox runs them locally, the server runs them for signed-in users.
 */
import { fileOf, summariseFile, type FileSummary } from "@/lib/domain/files";
import type { Database } from "@/lib/sim/schema";
import {
  recordChecklist,
  type ChecklistItem,
  documentChangeBlock,
} from "@/lib/domain/mrd";
import {
  departmentName,
  getStaff,
  matches,
  patientRef,
  staffName,
  type PatientRef,
} from "@/lib/api/lookup";
import type { ID, MedicalRecord } from "@/lib/sim/schema";
import { hoursBetween } from "@/lib/sim/time";

export type MrdView = "incomplete" | "review" | "complete" | "archived" | "all";
export interface MrdRow {
  id: ID;
  code: string;
  status: MedicalRecord["status"];
  type: MedicalRecord["recordType"];
  patient: PatientRef;
  encounterCode: string;
  department: string;
  doctor: string;
  createdAt: string;
  ageDays: number;
  checklistDone: number;
  checklistTotal: number;
  missing: string[];
  location?: string;
}
const STATUS_FOR: Record<Exclude<MrdView, "all">, MedicalRecord["status"]> = {
  incomplete: "INCOMPLETE",
  review: "PENDING_REVIEW",
  complete: "COMPLETE",
  archived: "ARCHIVED",
};
export function medicalRecordsView(
  db: Database,
  now: Date,
  filters: {
    view: MrdView;
    q?: string;
    type?: string;
  }
) {
  return db.medicalRecords
    .filter(
      r =>
        (filters.view === "all" || r.status === STATUS_FOR[filters.view]) &&
        (!filters.type || r.recordType === filters.type)
    )
    .map<MrdRow>(r => {
      const checklist = recordChecklist(db, r);
      const encounter = db.encounters.find(e => e.id === r.encounterId);
      const admission = r.admissionId
        ? db.admissions.find(a => a.id === r.admissionId)
        : undefined;
      return {
        id: r.id,
        code: r.code,
        status: r.status,
        type: r.recordType,
        patient: patientRef(db, r.patientId, now)!,
        encounterCode: admission?.code ?? encounter?.code ?? "—",
        department: departmentName(db, r.departmentId),
        doctor: staffName(getStaff(db, r.attendingDoctorId)),
        createdAt: r.createdAt,
        ageDays: Math.floor(hoursBetween(r.createdAt, now) / 24),
        checklistDone: checklist.filter(c => c.done).length,
        checklistTotal: checklist.length,
        missing: checklist.filter(c => !c.done).map(c => c.label),
        location: r.location,
      };
    })
    .filter(
      r =>
        !filters.q ||
        matches(
          filters.q,
          r.code,
          r.patient.name,
          r.patient.uhid,
          r.encounterCode
        )
    );
}

export function mrdSummaryView(db: Database, now: Date) {
  const count = (status: MedicalRecord["status"]) =>
    db.medicalRecords.filter(r => r.status === status).length;
  const weekAgo = new Date(now.getTime() - 7 * 86_400_000).toISOString();
  const incompleteIpd = db.medicalRecords.filter(
    r =>
      r.status === "INCOMPLETE" &&
      r.recordType === "IPD_CASE_FILE" &&
      db.admissions.find(a => a.id === r.admissionId)?.status === "DISCHARGED"
  );
  return {
    incomplete: count("INCOMPLETE"),
    review: count("PENDING_REVIEW"),
    complete: count("COMPLETE"),
    archived: count("ARCHIVED"),
    reviewedThisWeek: db.medicalRecords.filter(
      r => r.reviewedAt && r.reviewedAt >= weekAgo
    ).length,
    dischargedIncomplete: incompleteIpd.length,
    total: db.medicalRecords.length,
  };
}

export interface MrdDetail {
  record: MedicalRecord;
  checklist: ChecklistItem[];
  patient: PatientRef;
  department: string;
  doctor: string;
  encounter: {
    id: ID;
    code: string;
    type: string;
    startedAt: string;
    closedAt?: string;
    diagnoses: string[];
  };
  admission?: {
    id: ID;
    code: string;
    admittedAt: string;
    dischargedAt?: string;
  };
  documents: Array<{
    id: ID;
    title: string;
    kind: string;
    fileName: string;
    uploadedAt: string;
    uploadedBy: string;
    /** The scanned copy, when one is stored. */
    file?: FileSummary;
    /** Why it cannot be edited or removed, when it cannot. */
    changeBlock?: string;
  }>;
  hasSummary: boolean;
  access: Array<{
    id: ID;
    at: string;
    by: string;
    action: string;
    note?: string;
  }>;
  reviewedBy?: string;
}
export function medicalRecordView(
  db: Database,
  now: Date,
  { id }: { id: ID | null }
): MrdDetail | null {
  const record = db.medicalRecords.find(r => r.id === id);
  if (!record) return null;
  const encounter = db.encounters.find(e => e.id === record.encounterId)!;
  const admission = record.admissionId
    ? db.admissions.find(a => a.id === record.admissionId)
    : undefined;
  return {
    record,
    checklist: recordChecklist(db, record),
    patient: patientRef(db, record.patientId, now)!,
    department: departmentName(db, record.departmentId),
    doctor: staffName(getStaff(db, record.attendingDoctorId)),
    encounter: {
      id: encounter.id,
      code: encounter.code,
      type: encounter.type,
      startedAt: encounter.startedAt,
      closedAt: encounter.closedAt,
      diagnoses: encounter.diagnoses.map(d => d.description),
    },
    admission: admission
      ? {
          id: admission.id,
          code: admission.code,
          admittedAt: admission.admittedAt,
          dischargedAt: admission.dischargedAt,
        }
      : undefined,
    documents: db.documents
      .filter(
        d =>
          (record.admissionId && d.admissionId === record.admissionId) ||
          d.encounterId === record.encounterId
      )
      .map(d => ({
        id: d.id,
        title: d.title,
        kind: d.kind,
        fileName: d.fileName,
        uploadedAt: d.uploadedAt,
        uploadedBy: staffName(getStaff(db, d.uploadedById)),
        file: summariseFile(fileOf(db, "DOCUMENT", d.id)),
        changeBlock: documentChangeBlock(db, d),
      })),
    hasSummary: Boolean(
      admission &&
      db.dischargeSummaries.some(s => s.admissionId === admission.id)
    ),
    access: db.recordAccessLogs
      .filter(l => l.medicalRecordId === record.id)
      .sort((a, b) => b.at.localeCompare(a.at))
      .slice(0, 20)
      .map(l => ({
        id: l.id,
        at: l.at,
        by: staffName(getStaff(db, l.byId)),
        action: l.action,
        note: l.note,
      })),
    reviewedBy: record.reviewedById
      ? staffName(getStaff(db, record.reviewedById))
      : undefined,
  };
}
