/**
 * View builders for lab: pure functions of the database, the clock and
 * the request's parameters. Registered in lib/views/registry.ts; the browser
 * sandbox runs them locally, the server runs them for signed-in users.
 */
import type { Database } from "@/lib/sim/schema";
import {
  expectedTatHours,
  isLabOverdue,
  labOrderTests,
  turnaroundHours,
} from "@/lib/domain/lab";
import {
  admissionBed,
  departmentName,
  getStaff,
  matches,
  patientRef,
  staffName,
  type PatientRef,
} from "@/lib/api/lookup";
import type { Admission, ID, LabOrder, LabParameter } from "@/lib/sim/schema";
import { isSameDay } from "@/lib/sim/time";
import {
  labOrderView,
  orderContext,
  type LabOrderView,
  type OrderContext,
} from "@/features/opd/views";

export type LabStage =
  "collection" | "processing" | "reporting" | "completed" | "all";
const STAGE: Record<
  Exclude<LabStage, "all" | "completed">,
  LabOrder["status"][]
> = {
  collection: ["ORDERED", "SAMPLE_PENDING"],
  processing: ["COLLECTED", "PROCESSING"],
  reporting: ["RESULT_READY"],
};
export interface LabRow {
  id: ID;
  code: string;
  status: LabOrder["status"];
  priority: LabOrder["priority"];
  patient: PatientRef;
  tests: string[];
  sampleTypes: string[];
  sampleId?: string;
  orderedAt: string;
  orderedBy: string;
  setting: string;
  orderedFor?: OrderContext;
  elapsedHours: number;
  expectedHours: number;
  overdue: boolean;
  abnormal: number;
  critical: number;
}
export function labWorklistView(
  db: Database,
  now: Date,
  filters: {
    stage: LabStage;
    q?: string;
    priority?: string;
  }
) {
  const flags = new Map<ID, { abnormal: number; critical: number }>();
  for (const r of db.labResults) {
    const f = flags.get(r.labOrderItemId) ?? { abnormal: 0, critical: 0 };
    if (r.flag !== "NORMAL") f.abnormal += 1;
    if (r.flag.startsWith("CRITICAL")) f.critical += 1;
    flags.set(r.labOrderItemId, f);
  }
  return db.labOrders
    .filter(o => {
      if (filters.stage === "completed")
        return (
          o.status === "VERIFIED" &&
          o.verifiedAt &&
          isSameDay(o.verifiedAt, now)
        );
      if (filters.stage !== "all" && !STAGE[filters.stage].includes(o.status))
        return false;
      if (filters.priority && o.priority !== filters.priority) return false;
      if (filters.q) {
        const p = db.patients.find(x => x.id === o.patientId);
        if (
          !matches(
            filters.q,
            o.code,
            o.sampleId,
            p && `${p.firstName} ${p.lastName}`,
            p?.uhid
          )
        )
          return false;
      }
      return true;
    })
    .map<LabRow>(o => {
      const tests = labOrderTests(db, o.id);
      const admission = o.admissionId
        ? db.admissions.find(a => a.id === o.admissionId)
        : undefined;
      const bed = admission ? admissionBed(db, admission) : undefined;
      const f = tests.reduce(
        (acc, t) => {
          const x = flags.get(t.item.id);
          return {
            abnormal: acc.abnormal + (x?.abnormal ?? 0),
            critical: acc.critical + (x?.critical ?? 0),
          };
        },
        { abnormal: 0, critical: 0 }
      );
      return {
        id: o.id,
        code: o.code,
        status: o.status,
        priority: o.priority,
        patient: patientRef(db, o.patientId, now)!,
        tests: tests.map(t => t.test.name),
        sampleTypes: [...new Set(tests.map(t => t.test.sampleType))],
        sampleId: o.sampleId,
        orderedAt: o.orderedAt,
        orderedBy: staffName(getStaff(db, o.orderedById)),
        setting: bed ? `IPD · ${bed.ward} ${bed.code}` : "OPD",
        orderedFor: orderContext(db, o.encounterId, o.admissionId),
        elapsedHours: turnaroundHours(o, now),
        expectedHours: expectedTatHours(db, o),
        overdue: isLabOverdue(db, o, now),
        abnormal: f.abnormal,
        critical: f.critical,
      };
    });
}

export interface LabOrderDetail {
  view: LabOrderView;
  order: LabOrder;
  patient: PatientRef;
  setting: string;
  clinicalNotes: string;
  expectedHours: number;
  elapsedHours: number;
  timeline: Array<{ label: string; at?: string; by?: string }>;
  entry: Array<{
    itemId: ID;
    testName: string;
    sampleType: string;
    parameters: Array<LabParameter & { value: string }>;
  }>;
}
export function labOrderDetailView(
  db: Database,
  now: Date,
  { id }: { id: ID | null }
): LabOrderDetail | null {
  if (!id) return null;
  const order = db.labOrders.find(o => o.id === id);
  if (!order) return null;
  const admission = order.admissionId
    ? db.admissions.find(a => a.id === order.admissionId)
    : undefined;
  const bed = admission ? admissionBed(db, admission) : undefined;
  const by = (staffId?: ID) =>
    staffId ? staffName(getStaff(db, staffId)) : undefined;
  return {
    view: labOrderView(db, order),
    order,
    patient: patientRef(db, order.patientId, now)!,
    setting: bed ? `IPD · ${bed.ward} ${bed.code}` : "OPD",
    clinicalNotes: order.clinicalNotes,
    expectedHours: expectedTatHours(db, order),
    elapsedHours: turnaroundHours(order, now),
    timeline: [
      { label: "Ordered", at: order.orderedAt, by: by(order.orderedById) },
      { label: "Sample requested", at: order.sampleRequestedAt },
      {
        label: "Sample collected",
        at: order.sampleCollectedAt,
        by: by(order.collectedById),
      },
      {
        label: "Processing",
        at: order.processingStartedAt,
        by: by(order.technicianId),
      },
      { label: "Results entered", at: order.resultEnteredAt },
      {
        label: "Verified",
        at: order.verifiedAt,
        by: by(order.verifiedById),
      },
    ],
    entry: labOrderTests(db, order.id).map(({ item, test }) => ({
      itemId: item.id,
      testName: test.name,
      sampleType: test.sampleType,
      parameters: test.parameters.map(p => ({
        ...p,
        value:
          db.labResults.find(
            r => r.labOrderItemId === item.id && r.parameterId === p.id
          )?.value ?? "",
      })),
    })),
  };
}

/**
 * Where a new lab order for a patient can be filed: a live admission (its
 * IPD encounter) or an open OPD visit — the encounters that accept orders.
 * The order, its charges and its report then sit with that stay or visit.
 */
export interface LabOrderTarget {
  encounterId: ID;
  type: "IPD" | "OPD";
  code: string;
  /** Ward and bed for an admission; department for a visit. */
  where: string;
  doctor: string;
  since: string;
}
export function labOrderTargetsView(
  db: Database,
  _now: Date,
  { patientId }: { patientId: ID }
): LabOrderTarget[] {
  const live: Admission["status"][] = [
    "ADMITTED",
    "ACTIVE",
    "TRANSFER_PENDING",
  ];
  const admissions = db.admissions
    .filter(a => a.patientId === patientId && live.includes(a.status))
    .map<LabOrderTarget>(a => {
      const bed = admissionBed(db, a);
      return {
        encounterId: a.encounterId,
        type: "IPD",
        code: a.code,
        where: bed
          ? `${bed.ward} · bed ${bed.code}`
          : departmentName(db, a.departmentId),
        doctor: staffName(getStaff(db, a.doctorId)),
        since: a.admittedAt,
      };
    });
  const visits = db.encounters
    .filter(
      e => e.patientId === patientId && e.type === "OPD" && e.status === "OPEN"
    )
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
    .map<LabOrderTarget>(e => ({
      encounterId: e.id,
      type: "OPD",
      code: e.code,
      where: departmentName(db, e.departmentId),
      doctor: staffName(getStaff(db, e.doctorId)),
      since: e.startedAt,
    }));
  return [...admissions, ...visits];
}
