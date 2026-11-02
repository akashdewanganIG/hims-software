import { matches, patientRef, staffName, getStaff } from "@/lib/api/lookup";
import type { Database, ID, RadiologyStatus } from "@/lib/sim/schema";
import { hoursBetween } from "@/lib/sim/time";

const completed = new Set<RadiologyStatus>(["FINAL", "AMENDED", "CANCELLED"]);

export function radiologyWorklistView(
  db: Database,
  now: Date,
  filters: {
    stage: "waiting" | "acquisition" | "reporting" | "completed" | "all";
    q?: string;
    modality?: string;
  }
) {
  return db.radiologyOrders
    .filter(order => {
      const procedure = db.radiologyProcedures.find(
        row => row.id === order.procedureId
      );
      if (filters.modality && procedure?.modality !== filters.modality)
        return false;
      if (
        filters.stage === "waiting" &&
        !["ORDERED", "SCHEDULED", "CHECKED_IN", "READY"].includes(order.status)
      )
        return false;
      if (filters.stage === "acquisition" && order.status !== "IN_PROGRESS")
        return false;
      if (
        filters.stage === "reporting" &&
        !["ACQUIRED", "REPORT_DRAFT", "PRELIMINARY"].includes(order.status)
      )
        return false;
      if (filters.stage === "completed" && !completed.has(order.status))
        return false;
      const patient = patientRef(db, order.patientId, now);
      return (
        !filters.q ||
        matches(
          filters.q,
          order.accessionNumber,
          patient?.name,
          patient?.uhid,
          procedure?.name
        )
      );
    })
    .map(order => {
      const procedure = db.radiologyProcedures.find(
        row => row.id === order.procedureId
      )!;
      const equipment = db.radiologyEquipment.find(
        row => row.id === order.equipmentId
      );
      const report = db.radiologyReports
        .filter(row => row.orderId === order.id)
        .sort((a, b) => b.version - a.version)[0];
      const communication = report
        ? db.radiologyCommunications.find(row => row.reportId === report.id)
        : undefined;
      return {
        id: order.id,
        accessionNumber: order.accessionNumber,
        patient: patientRef(db, order.patientId, now)!,
        procedure: procedure.name,
        modality: procedure.modality,
        priority: order.priority,
        status: order.status,
        source: order.source,
        orderedAt: order.orderedAt,
        scheduledAt: order.scheduledAt,
        equipment: equipment?.name,
        clinicalIndication: order.clinicalIndication,
        turnaroundHours: hoursBetween(
          order.orderedAt,
          report?.finalisedAt ?? now
        ),
        criticality: report?.criticality,
        acknowledgementPending: Boolean(
          communication && !communication.acknowledgedAt
        ),
      };
    })
    .sort((a, b) => b.orderedAt.localeCompare(a.orderedAt));
}

export function radiologySummaryView(db: Database, now: Date) {
  const today = now.toISOString().slice(0, 10);
  const active = db.radiologyOrders.filter(row => row.status !== "CANCELLED");
  const final = db.radiologyReports.filter(
    row => row.status === "FINAL" || row.status === "AMENDED"
  );
  return {
    waiting: active.filter(row =>
      ["ORDERED", "SCHEDULED", "CHECKED_IN", "READY"].includes(row.status)
    ).length,
    reporting: active.filter(row =>
      ["ACQUIRED", "REPORT_DRAFT", "PRELIMINARY"].includes(row.status)
    ).length,
    completedToday: final.filter(row => row.finalisedAt?.startsWith(today))
      .length,
    criticalUnacknowledged: db.radiologyCommunications.filter(
      row => !row.acknowledgedAt
    ).length,
    equipmentUnavailable: db.radiologyEquipment.filter(
      row => row.status !== "ACTIVE"
    ).length,
  };
}

export function radiologyOrderView(
  db: Database,
  now: Date,
  { id }: { id: ID | null }
) {
  const order = db.radiologyOrders.find(row => row.id === id);
  if (!order) return null;
  const procedure = db.radiologyProcedures.find(
    row => row.id === order.procedureId
  )!;
  const equipment = db.radiologyEquipment.find(
    row => row.id === order.equipmentId
  );
  const studies = db.radiologyStudies
    .filter(row => row.orderId === order.id)
    .sort((a, b) => a.attempt - b.attempt);
  const reports = db.radiologyReports
    .filter(row => row.orderId === order.id)
    .sort((a, b) => b.version - a.version);
  return {
    order,
    patient: patientRef(db, order.patientId, now)!,
    procedure,
    equipment,
    orderedBy: staffName(getStaff(db, order.orderedById)),
    safety: db.radiologySafetyAssessments.find(row => row.orderId === order.id),
    studies: studies.map(study => ({
      ...study,
      performedBy: staffName(getStaff(db, study.performedById)),
    })),
    reports: reports.map(report => ({
      ...report,
      radiologist: staffName(getStaff(db, report.radiologistId)),
      communications: db.radiologyCommunications
        .filter(row => row.reportId === report.id)
        .map(row => ({
          ...row,
          recipient: staffName(getStaff(db, row.recipientId)),
          communicatedBy: staffName(getStaff(db, row.communicatedById)),
        })),
    })),
    clinicians: db.staff
      .filter(row => row.role === "DOCTOR")
      .map(row => ({ id: row.id, name: staffName(row) })),
  };
}

export function radiologyScheduleView(
  db: Database,
  now: Date,
  { date }: { date: string }
) {
  return db.radiologyEquipment.map(equipment => ({
    equipment,
    orders: db.radiologyOrders
      .filter(
        order =>
          order.equipmentId === equipment.id &&
          order.scheduledAt?.startsWith(date) &&
          order.status !== "CANCELLED"
      )
      .map(order => ({
        id: order.id,
        accessionNumber: order.accessionNumber,
        scheduledAt: order.scheduledAt!,
        status: order.status,
        patient: patientRef(db, order.patientId, now)!,
        procedure: db.radiologyProcedures.find(
          row => row.id === order.procedureId
        )!.name,
      }))
      .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt)),
  }));
}

export function radiologyEquipmentView(db: Database) {
  return db.radiologyEquipment.map(equipment => ({
    ...equipment,
    events: db.radiologyEquipmentEvents
      .filter(row => row.equipmentId === equipment.id)
      .sort((a, b) =>
        (b.completedAt ?? b.scheduledAt ?? "").localeCompare(
          a.completedAt ?? a.scheduledAt ?? ""
        )
      ),
    studies: db.radiologyStudies.filter(row => row.equipmentId === equipment.id)
      .length,
  }));
}

export function radiologyCatalogView(db: Database) {
  return {
    procedures: db.radiologyProcedures.filter(row => row.active),
    equipment: db.radiologyEquipment,
  };
}

export type RadiologyWorklistRow = ReturnType<
  typeof radiologyWorklistView
>[number];
export type RadiologyOrderDetail = NonNullable<
  ReturnType<typeof radiologyOrderView>
>;
