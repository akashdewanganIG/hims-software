/**
 * View builders for ipd: pure functions of the database, the clock and
 * the request's parameters. Registered in lib/views/registry.ts; the browser
 * sandbox runs them locally, the server runs them for signed-in users.
 */
import { invoiceTotals, lineTotal } from "@/lib/domain/billing";
import {
  dischargeClearance,
  isInHouse,
  unpostedBedCharges,
} from "@/lib/domain/ipd";
import { recordChecklist } from "@/lib/domain/mrd";
import {
  admissionBed,
  bedRef,
  departmentName,
  getStaff,
  matches,
  patientRef,
  staffName,
  type BedRef,
  type PatientRef,
} from "@/lib/api/lookup";
import type {
  Admission,
  CareOrder,
  ClinicalNote,
  Database,
  DischargeSummary,
  ID,
  InvoiceItem,
  Patient,
} from "@/lib/sim/schema";
import { bedDays } from "@/lib/sim/time";
import { fileOf } from "@/lib/domain/files";
import {
  labOrderView,
  prescriptionView,
  type LabOrderView,
  type PrescriptionView,
} from "@/features/opd/views";

export interface AdmissionRow {
  id: ID;
  code: string;
  status: Admission["status"];
  source: Admission["source"];
  patient: PatientRef;
  doctor: string;
  department: string;
  bed?: BedRef;
  admittedAt: string;
  dischargedAt?: string;
  expectedDischargeDate?: string;
  lengthOfStay: number;
  reason: string;
  diagnosis: string;
  charges: number;
  pendingLabs: number;
  pendingRx: number;
}
function runningCharges(db: Database, admission: Admission, now: Date) {
  const bills = db.invoices.filter(
    i => i.admissionId === admission.id && i.status !== "CANCELLED"
  );
  const posted = bills.reduce(
    (sum, bill) => sum + invoiceTotals(db, bill.id).total,
    0
  );
  return (
    posted +
    (isInHouse(admission) ? unpostedBedCharges(db, admission.id, now) : 0)
  );
}
export function admissionRow(
  db: Database,
  a: Admission,
  now: Date
): AdmissionRow {
  return {
    id: a.id,
    code: a.code,
    status: a.status,
    source: a.source,
    patient: patientRef(db, a.patientId, now)!,
    doctor: staffName(getStaff(db, a.doctorId)),
    department: departmentName(db, a.departmentId),
    bed: admissionBed(db, a),
    admittedAt: a.admittedAt,
    dischargedAt: a.dischargedAt,
    expectedDischargeDate: a.expectedDischargeDate,
    lengthOfStay: bedDays(a.admittedAt, a.dischargedAt ?? now.toISOString()),
    reason: a.reason,
    diagnosis: a.provisionalDiagnosis,
    charges: runningCharges(db, a, now),
    pendingLabs: db.labOrders.filter(
      o =>
        o.admissionId === a.id &&
        o.status !== "VERIFIED" &&
        o.status !== "CANCELLED"
    ).length,
    pendingRx: db.prescriptions.filter(
      p =>
        p.admissionId === a.id &&
        (p.status === "PENDING" || p.status === "PARTIALLY_DISPENSED")
    ).length,
  };
}
export function admissionsView(
  db: Database,
  now: Date,
  filters: {
    scope: "inhouse" | "discharged" | "all";
    q?: string;
    wardCode?: string;
    doctorId?: ID;
  }
) {
  return db.admissions
    .filter(a => {
      if (filters.scope === "inhouse" && !isInHouse(a)) return false;
      if (filters.scope === "discharged" && a.status !== "DISCHARGED")
        return false;
      if (filters.doctorId && a.doctorId !== filters.doctorId) return false;
      if (filters.q) {
        const p = db.patients.find(x => x.id === a.patientId);
        if (
          !matches(
            filters.q,
            a.code,
            p && `${p.firstName} ${p.lastName}`,
            p?.uhid,
            p?.phone
          )
        )
          return false;
      }
      return true;
    })
    .map(a => admissionRow(db, a, now))
    .filter(row => !filters.wardCode || row.bed?.wardCode === filters.wardCode)
    .sort((a, b) => b.admittedAt.localeCompare(a.admittedAt));
}

export interface AdmissionDetail {
  row: AdmissionRow;
  admission: Admission;
  patient: Patient & { age: number; photoFileId?: ID };
  encounterId: ID;
  diagnoses: string[];
  bedHistory: Array<{
    id: ID;
    bed: BedRef;
    fromAt: string;
    toAt?: string;
    reason: string;
    days: number;
  }>;
  pendingTransferBed?: BedRef;
  notes: Array<ClinicalNote & { author: string; authorRole: string }>;
  careOrders: Array<CareOrder & { orderedBy: string }>;
  prescriptions: PrescriptionView[];
  labOrders: LabOrderView[];
  bills: Array<{
    id: ID;
    code: string;
    status: string;
    total: number;
    paid: number;
    balance: number;
    refundDue: number;
    items: Array<InvoiceItem & { amount: number }>;
  }>;
  unposted: number;
  /** Where the discharge stands: summary, billing clearance, open items. */
  clearance: ReturnType<typeof dischargeClearance> & { clearedBy?: string };
  summary?: DischargeSummary & { preparedBy: string };
  medicalRecord?: {
    id: ID;
    code: string;
    status: string;
    checklist: Array<{ key: string; label: string; done: boolean }>;
  };
  documents: Array<{
    id: ID;
    title: string;
    kind: string;
    uploadedAt: string;
    uploadedBy: string;
    fileName: string;
  }>;
  sourceVisit?: { id: ID; code: string };
}
export function admissionView(
  db: Database,
  now: Date,
  { id }: { id: ID }
): AdmissionDetail | null {
  const admission = db.admissions.find(a => a.id === id);
  if (!admission) return null;
  const patient = db.patients.find(p => p.id === admission.patientId)!;
  const encounter = db.encounters.find(e => e.id === admission.encounterId)!;
  const summary = db.dischargeSummaries.find(s => s.admissionId === id);
  const record = db.medicalRecords.find(r => r.admissionId === id);
  const target = admission.pendingTransfer
    ? db.beds.find(b => b.id === admission.pendingTransfer!.toBedId)
    : undefined;
  const source = admission.sourceEncounterId
    ? db.encounters.find(e => e.id === admission.sourceEncounterId)
    : undefined;
  return {
    row: admissionRow(db, admission, now),
    admission,
    patient: {
      ...patient,
      age: patientRef(db, patient.id, now)!.age,
      photoFileId: fileOf(db, "PATIENT_PHOTO", patient.id)?.id,
    },
    encounterId: encounter.id,
    diagnoses: encounter.diagnoses.map(d => d.description),
    bedHistory: db.bedAssignments
      .filter(a => a.admissionId === id)
      .sort((a, b) => b.fromAt.localeCompare(a.fromAt))
      .map(a => ({
        id: a.id,
        bed: bedRef(
          db,
          db.beds.find(b => b.id === a.bedId)
        )!,
        fromAt: a.fromAt,
        toAt: a.toAt,
        reason: a.reason,
        days: bedDays(a.fromAt, a.toAt ?? now.toISOString()),
      })),
    pendingTransferBed: bedRef(db, target),
    notes: db.clinicalNotes
      .filter(n => n.admissionId === id)
      .sort((a, b) => b.at.localeCompare(a.at))
      .map(n => {
        const author = getStaff(db, n.authorId);
        return {
          ...n,
          author: staffName(author),
          authorRole: author?.role ?? "",
        };
      }),
    careOrders: db.careOrders
      .filter(o => o.admissionId === id)
      .sort((a, b) => b.orderedAt.localeCompare(a.orderedAt))
      .map(o => ({
        ...o,
        orderedBy: staffName(getStaff(db, o.orderedById)),
      })),
    prescriptions: db.prescriptions
      .filter(p => p.admissionId === id)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map(p => prescriptionView(db, p.id)),
    labOrders: db.labOrders
      .filter(o => o.admissionId === id)
      .sort((a, b) => b.orderedAt.localeCompare(a.orderedAt))
      .map(o => labOrderView(db, o)),
    bills: db.invoices
      .filter(
        i =>
          i.admissionId === id ||
          (i.encounterId === encounter.id && !i.admissionId)
      )
      .map(i => {
        const t = invoiceTotals(db, i.id);
        return {
          id: i.id,
          code: i.code,
          status: i.status,
          total: t.total,
          paid: t.netPaid,
          balance: t.balance,
          refundDue: t.refundDue,
          items: db.invoiceItems
            .filter(x => x.invoiceId === i.id)
            .map(x => ({ ...x, amount: lineTotal(x) })),
        };
      }),
    unposted: isInHouse(admission) ? unpostedBedCharges(db, id, now) : 0,
    clearance: {
      ...dischargeClearance(db, admission, now),
      clearedBy: admission.billingClearedById
        ? staffName(getStaff(db, admission.billingClearedById))
        : undefined,
    },
    summary: summary
      ? {
          ...summary,
          preparedBy: staffName(getStaff(db, summary.preparedById)),
        }
      : undefined,
    medicalRecord: record
      ? {
          id: record.id,
          code: record.code,
          status: record.status,
          checklist: recordChecklist(db, record),
        }
      : undefined,
    documents: db.documents
      .filter(d => d.admissionId === id)
      .map(d => ({
        id: d.id,
        title: d.title,
        kind: d.kind,
        uploadedAt: d.uploadedAt,
        uploadedBy: staffName(getStaff(db, d.uploadedById)),
        fileName: d.fileName,
      })),
    sourceVisit: source ? { id: source.id, code: source.code } : undefined,
  };
}

export interface BedOption {
  id: ID;
  code: string;
  status: string;
  ward: string;
  wardCode: string;
  room: string;
  category: string;
  dailyRate: number;
  note?: string;
  restriction?: { gender?: string; maxAge?: number };
}
/** Beds a patient can be placed in now: available, or reserved with no hold. */
export function freeBedsView(db: Database) {
  return db.beds
    .filter(
      b =>
        b.status === "AVAILABLE" || (b.status === "RESERVED" && !b.admissionId)
    )
    .map<BedOption>(b => {
      const ref = bedRef(db, b)!;
      const ward = db.wards.find(w => w.code === ref.wardCode)!;
      return {
        id: b.id,
        code: b.code,
        status: b.status,
        ward: ref.ward,
        wardCode: ref.wardCode,
        room: ref.room,
        category: ward.category,
        dailyRate: ward.dailyRate,
        note: b.note,
        restriction: ward.restriction,
      };
    })
    .sort(
      (a, b) => a.ward.localeCompare(b.ward) || a.code.localeCompare(b.code)
    );
}

/** Beds whose ward restriction admits this patient. */
export function bedFits(
  bed: BedOption,
  patient?: { gender: string; age: number } | null
) {
  if (!patient || !bed.restriction) return true;
  if (bed.restriction.gender && bed.restriction.gender !== patient.gender)
    return false;
  if (
    bed.restriction.maxAge !== undefined &&
    patient.age > bed.restriction.maxAge
  )
    return false;
  return true;
}
