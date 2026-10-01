/**
 * View builders for patients: pure functions of the database, the clock and
 * the request's parameters. Registered in lib/views/registry.ts; the browser
 * sandbox runs them locally, the server runs them for signed-in users.
 */
import { allInvoiceTotals, invoiceTotals } from "@/lib/domain/billing";
import { isInHouse } from "@/lib/domain/ipd";
import {
  admissionBed,
  departmentName,
  getStaff,
  matches,
  patientRef,
  staffName,
  type PatientRef,
} from "@/lib/api/lookup";
import type { Admission, Database, ID, Patient } from "@/lib/sim/schema";
import { isSameDay, isoDate } from "@/lib/sim/time";
import { fileOf, summariseFile, type FileSummary } from "@/lib/domain/files";
import { documentChangeBlock } from "@/lib/domain/mrd";
import { patientRemovalBlock } from "@/lib/domain/patients";
import {
  labOrderView,
  prescriptionView,
  type LabOrderView,
  type PrescriptionView,
} from "@/features/opd/views";

export interface PatientRow {
  patient: PatientRef;
  bloodGroup?: string;
  city: string;
  registeredAt: string;
  lastVisit?: string;
  visits: number;
  inHouseAdmissionId?: ID;
  outstanding: number;
}
export type PatientFilter = "all" | "inhouse" | "today" | "new";
export function patientsView(
  db: Database,
  now: Date,
  filters: { q?: string; filter: PatientFilter }
) {
  const lastVisit = new Map<ID, string>();
  const visits = new Map<ID, number>();
  for (const e of db.encounters) {
    visits.set(e.patientId, (visits.get(e.patientId) ?? 0) + 1);
    if ((lastVisit.get(e.patientId) ?? "") < e.startedAt)
      lastVisit.set(e.patientId, e.startedAt);
  }
  const inHouse = new Map(
    db.admissions.filter(isInHouse).map(a => [a.patientId, a.id])
  );
  const totals = allInvoiceTotals(db);
  const outstanding = new Map<ID, number>();
  for (const inv of db.invoices) {
    if (inv.status === "CANCELLED" || inv.status === "DRAFT") continue;
    const balance = totals.get(inv.id)?.balance ?? 0;
    if (balance > 0)
      outstanding.set(
        inv.patientId,
        (outstanding.get(inv.patientId) ?? 0) + balance
      );
  }
  const monthAgo = new Date(now.getTime() - 30 * 86_400_000).toISOString();
  return db.patients
    .filter(p => {
      if (filters.filter === "inhouse" && !inHouse.has(p.id)) return false;
      if (
        filters.filter === "today" &&
        !(lastVisit.get(p.id) && isSameDay(lastVisit.get(p.id)!, now))
      )
        return false;
      if (filters.filter === "new" && p.registeredAt < monthAgo) return false;
      return (
        !filters.q ||
        matches(filters.q, `${p.firstName} ${p.lastName}`, p.uhid, p.phone)
      );
    })
    .map<PatientRow>(p => ({
      patient: patientRef(db, p.id, now)!,
      bloodGroup: p.bloodGroup,
      city: p.city,
      registeredAt: p.registeredAt,
      lastVisit: lastVisit.get(p.id),
      visits: visits.get(p.id) ?? 0,
      inHouseAdmissionId: inHouse.get(p.id),
      outstanding: outstanding.get(p.id) ?? 0,
    }));
}

export interface EncounterSummary {
  id: ID;
  code: string;
  type: "OPD" | "IPD";
  startedAt: string;
  closedAt?: string;
  status: string;
  doctor: string;
  department: string;
  chiefComplaint: string;
  diagnoses: Array<{ code?: string; description: string; type: string }>;
  disposition?: string;
  admissionId?: ID;
  href: string;
}
export interface PatientRecord {
  patient: Patient & { age: number; photoFileId?: ID };
  /** Why the registration cannot be deleted; absent when it was made in error and can be. */
  removeBlock?: string;
  activeAdmission?: {
    id: ID;
    code: string;
    bed?: string;
    status: string;
    doctor: string;
  };
  upcoming: Array<{
    id: ID;
    code: string;
    scheduledAt: string;
    doctor: string;
    department: string;
    status: string;
  }>;
  encounters: EncounterSummary[];
  admissions: Array<{
    id: ID;
    code: string;
    admittedAt: string;
    dischargedAt?: string;
    status: string;
    diagnosis: string;
    doctor: string;
    bed?: string;
  }>;
  diagnoses: Array<{
    description: string;
    code?: string;
    lastSeen: string;
    count: number;
    source: string;
  }>;
  prescriptions: PrescriptionView[];
  labOrders: LabOrderView[];
  bills: Array<{
    id: ID;
    code: string;
    createdAt: string;
    status: string;
    total: number;
    paid: number;
    balance: number;
    context: string;
  }>;
  documents: Array<{
    id: ID;
    title: string;
    kind: string;
    fileName: string;
    sizeKb: number;
    uploadedAt: string;
    uploadedBy: string;
    context?: string;
    href?: string;
    /** The uploaded content, when a copy is stored. */
    file?: FileSummary;
    /** Why it cannot be edited or removed, when it cannot. */
    changeBlock?: string;
  }>;
  dischargeSummaries: Array<{
    admissionId: ID;
    admissionCode: string;
    finalDiagnosis: string;
    status: string;
    finalisedAt?: string;
  }>;
  notes: Array<{
    id: ID;
    at: string;
    type: string;
    author: string;
    text: string;
    context: string;
  }>;
  timeline: Array<{
    id: string;
    at: string;
    kind: string;
    title: string;
    detail?: string;
    href?: string;
    tone: "neutral" | "info" | "success" | "warning" | "danger";
  }>;
  outstanding: number;
  medicalRecords: Array<{
    id: ID;
    code: string;
    status: string;
    type: string;
    context: string;
  }>;
}
function encounterSummary(
  db: Database,
  e: Database["encounters"][number]
): EncounterSummary {
  return {
    id: e.id,
    code: e.code,
    type: e.type,
    startedAt: e.startedAt,
    closedAt: e.closedAt,
    status: e.status,
    doctor: staffName(getStaff(db, e.doctorId)),
    department: departmentName(db, e.departmentId),
    chiefComplaint: e.chiefComplaint,
    diagnoses: e.diagnoses.map(d => ({
      code: d.code,
      description: d.description,
      type: d.type,
    })),
    disposition: e.disposition,
    admissionId: e.admissionId,
    href: e.type === "OPD" ? `/opd/visits/${e.id}` : `/ipd/${e.admissionId}`,
  };
}
export function patientRecordView(
  db: Database,
  now: Date,
  { id }: { id: ID }
): PatientRecord | null {
  const patient = db.patients.find(p => p.id === id);
  if (!patient) return null;
  const encounters = db.encounters
    .filter(e => e.patientId === id)
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  const admissions = db.admissions
    .filter(a => a.patientId === id)
    .sort((a, b) => b.admittedAt.localeCompare(a.admittedAt));
  const active = admissions.find(isInHouse);
  const bedLabel = (a: Admission) => {
    const b = admissionBed(db, a);
    return b ? `${b.ward} · ${b.code}` : undefined;
  };

  const diagMap = new Map<string, PatientRecord["diagnoses"][number]>();
  for (const e of [...encounters].reverse()) {
    for (const d of e.diagnoses) {
      if (d.type === "PROVISIONAL" && e.status === "CLOSED") continue;
      const key = d.description.toLowerCase();
      const prev = diagMap.get(key);
      diagMap.set(key, {
        description: d.description,
        code: d.code ?? prev?.code,
        lastSeen: e.startedAt,
        count: (prev?.count ?? 0) + 1,
        source: `${e.type} ${e.code}`,
      });
    }
  }

  const labOrders = db.labOrders
    .filter(o => o.patientId === id)
    .sort((a, b) => b.orderedAt.localeCompare(a.orderedAt))
    .map(o => labOrderView(db, o));
  const prescriptions = db.prescriptions
    .filter(p => p.patientId === id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map(p => prescriptionView(db, p.id));
  const bills = db.invoices
    .filter(i => i.patientId === id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map(i => {
      const t = invoiceTotals(db, i.id);
      const e = db.encounters.find(x => x.id === i.encounterId);
      const a = db.admissions.find(x => x.id === i.admissionId);
      return {
        id: i.id,
        code: i.code,
        createdAt: i.createdAt,
        status: i.status,
        total: t.total,
        paid: t.netPaid,
        balance: i.status === "DRAFT" ? 0 : t.balance,
        context: a ? a.code : e ? e.code : "—",
      };
    });

  const timeline: PatientRecord["timeline"] = [
    {
      id: "reg",
      at: patient.registeredAt,
      kind: "Registration",
      title: `Registered as ${patient.uhid}`,
      tone: "neutral" as const,
    },
    ...encounters
      .filter(e => e.type === "OPD")
      .map(e => ({
        id: `enc-${e.id}`,
        at: e.startedAt,
        kind: "OPD visit",
        title: `OPD · ${departmentName(db, e.departmentId)} with ${staffName(getStaff(db, e.doctorId))}`,
        detail:
          e.diagnoses.map(d => d.description).join("; ") || e.chiefComplaint,
        href: `/opd/visits/${e.id}`,
        tone: "info" as const,
      })),
    ...admissions.map(a => ({
      id: `adm-${a.id}`,
      at: a.admittedAt,
      kind: "Admission",
      title: `Admitted (${a.code}) under ${staffName(getStaff(db, a.doctorId))}`,
      detail: a.provisionalDiagnosis,
      href: `/ipd/${a.id}`,
      tone: "warning" as const,
    })),
    ...admissions
      .filter(a => a.dischargedAt)
      .map(a => ({
        id: `dis-${a.id}`,
        at: a.dischargedAt!,
        kind: "Discharge",
        title: `Discharged from ${a.code}`,
        href: `/ipd/${a.id}/summary`,
        tone: "success" as const,
      })),
    ...labOrders
      .filter(o => o.verifiedAt)
      .map(o => {
        const abnormal = o.tests
          .flatMap(t => t.results)
          .filter(r => r.flag !== "NORMAL").length;
        return {
          id: `lab-${o.id}`,
          at: o.verifiedAt!,
          kind: "Lab result",
          title: `${o.tests.map(t => t.name).join(", ")} reported`,
          detail: abnormal
            ? `${abnormal} value(s) outside the reference range`
            : "All values within range",
          tone: abnormal ? ("danger" as const) : ("success" as const),
        };
      }),
    ...db.documents
      .filter(d => d.patientId === id)
      .map(d => ({
        id: `doc-${d.id}`,
        at: d.uploadedAt,
        kind: "Document",
        title: d.title,
        tone: "neutral" as const,
      })),
  ].sort((a, b) => b.at.localeCompare(a.at));

  const notes: PatientRecord["notes"] = [
    ...db.clinicalNotes
      .filter(n => n.patientId === id)
      .map(n => ({
        id: n.id,
        at: n.at,
        type: n.type,
        author: staffName(getStaff(db, n.authorId)),
        text: n.text,
        context: db.admissions.find(a => a.id === n.admissionId)?.code ?? "IPD",
      })),
    ...encounters
      .filter(e => e.type === "OPD" && e.consultationNotes)
      .map(e => ({
        id: `opd-${e.id}`,
        at: e.closedAt ?? e.startedAt,
        type: "CONSULTATION",
        author: staffName(getStaff(db, e.doctorId)),
        text: [e.consultationNotes, e.advice && `Advice: ${e.advice}`]
          .filter(Boolean)
          .join("\n"),
        context: e.code,
      })),
  ].sort((a, b) => b.at.localeCompare(a.at));

  const today = isoDate(now);
  return {
    patient: {
      ...patient,
      age: patientRef(db, id, now)!.age,
      photoFileId: fileOf(db, "PATIENT_PHOTO", id)?.id,
    },
    removeBlock: patientRemovalBlock(db, id),
    activeAdmission: active
      ? {
          id: active.id,
          code: active.code,
          bed: bedLabel(active),
          status: active.status,
          doctor: staffName(getStaff(db, active.doctorId)),
        }
      : undefined,
    upcoming: db.appointments
      .filter(
        a =>
          a.patientId === id &&
          a.status === "SCHEDULED" &&
          isoDate(a.scheduledAt) >= today
      )
      .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt))
      .map(a => ({
        id: a.id,
        code: a.code,
        scheduledAt: a.scheduledAt,
        doctor: staffName(getStaff(db, a.doctorId)),
        department: departmentName(db, a.departmentId),
        status: a.status,
      })),
    encounters: encounters.map(e => encounterSummary(db, e)),
    admissions: admissions.map(a => ({
      id: a.id,
      code: a.code,
      admittedAt: a.admittedAt,
      dischargedAt: a.dischargedAt,
      status: a.status,
      diagnosis:
        db.encounters.find(e => e.id === a.encounterId)?.diagnoses[0]
          ?.description ?? a.provisionalDiagnosis,
      doctor: staffName(getStaff(db, a.doctorId)),
      bed: bedLabel(a),
    })),
    diagnoses: [...diagMap.values()].sort((a, b) =>
      b.lastSeen.localeCompare(a.lastSeen)
    ),
    prescriptions,
    labOrders,
    bills,
    documents: db.documents
      .filter(d => d.patientId === id)
      .sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt))
      .map(d => ({
        id: d.id,
        title: d.title,
        kind: d.kind,
        fileName: d.fileName,
        sizeKb: d.sizeKb,
        uploadedAt: d.uploadedAt,
        uploadedBy: staffName(getStaff(db, d.uploadedById)),
        context:
          db.admissions.find(a => a.id === d.admissionId)?.code ??
          db.encounters.find(e => e.id === d.encounterId)?.code,
        href:
          d.kind === "DISCHARGE_SUMMARY" && d.admissionId
            ? `/ipd/${d.admissionId}/summary`
            : undefined,
        file: summariseFile(fileOf(db, "DOCUMENT", d.id)),
        changeBlock: documentChangeBlock(db, d),
      })),
    dischargeSummaries: db.dischargeSummaries
      .filter(s => s.patientId === id)
      .map(s => ({
        admissionId: s.admissionId,
        admissionCode:
          db.admissions.find(a => a.id === s.admissionId)?.code ?? "—",
        finalDiagnosis: s.finalDiagnosis,
        status: s.status,
        finalisedAt: s.finalisedAt,
      })),
    notes,
    timeline,
    outstanding: bills.reduce((s, b) => s + b.balance, 0),
    medicalRecords: db.medicalRecords
      .filter(r => r.patientId === id)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map(r => ({
        id: r.id,
        code: r.code,
        status: r.status,
        type: r.recordType,
        context: db.encounters.find(e => e.id === r.encounterId)?.code ?? "—",
      })),
  };
}
