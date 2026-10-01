/**
 * View builders for operations: pure functions of the database, the clock and
 * the request's parameters. Registered in lib/views/registry.ts; the browser
 * sandbox runs them locally, the server runs them for signed-in users.
 */
import { allInvoiceTotals } from "@/lib/domain/billing";
import { isInHouse } from "@/lib/domain/ipd";
import { isLabOverdue } from "@/lib/domain/lab";
import { stockOnHand } from "@/lib/domain/pharmacy";
import { isComplaintOverdue } from "@/lib/domain/quality";
import { isOnDuty } from "@/lib/domain/wfm";
import {
  bedRef,
  departmentName,
  getStaff,
  patientRef,
  staffName,
} from "@/lib/api/lookup";
import type { Database, ID } from "@/lib/sim/schema";
import {
  hoursBetween,
  isSameDay,
  isoDate,
  minutesBetween,
} from "@/lib/sim/time";
import { pluralize } from "@/lib/format";

export type AlertLevel = "critical" | "warning" | "info";
export interface OpsAlert {
  id: string;
  level: AlertLevel;
  area: string;
  title: string;
  detail: string;
  href: string;
}
function pushIf(list: OpsAlert[], condition: boolean, alert: OpsAlert) {
  if (condition) list.push(alert);
}
export function buildOperations(db: Database, now: Date) {
  const today = isoDate(now);
  const alerts: OpsAlert[] = [];

  /* OPD */
  const todays = db.appointments.filter(a => isoDate(a.scheduledAt) === today);
  const waiting = todays.filter(a => a.status === "CHECKED_IN");
  const waits = waiting.map(a => ({
    a,
    minutes: minutesBetween(a.checkedInAt!, now),
  }));
  const byDoctor = new Map<ID, number[]>();
  for (const w of waits)
    byDoctor.set(w.a.doctorId, [
      ...(byDoctor.get(w.a.doctorId) ?? []),
      w.minutes,
    ]);
  for (const [doctorId, list] of byDoctor) {
    const longest = Math.max(...list);
    pushIf(alerts, longest > 45, {
      id: `opd-wait-${doctorId}`,
      level: longest > 75 ? "critical" : "warning",
      area: "OPD",
      title: `${list.length} waiting for ${staffName(getStaff(db, doctorId))}`,
      detail: `Longest wait ${longest} min since check-in`,
      href: "/opd",
    });
  }

  const departments = db.departments
    .filter(d => d.kind === "CLINICAL")
    .map(d => {
      const mine = todays.filter(a => a.departmentId === d.id);
      const docs = db.staff.filter(
        s => s.role === "DOCTOR" && s.departmentId === d.id
      );
      const deptWaits = waits
        .filter(w => w.a.departmentId === d.id)
        .map(w => w.minutes);
      return {
        id: d.id,
        name: d.name,
        booked: mine.filter(a => a.status !== "CANCELLED").length,
        waiting: mine.filter(a => a.status === "CHECKED_IN").length,
        inConsultation: mine.filter(a => a.status === "IN_CONSULTATION").length,
        completed: mine.filter(a => a.status === "COMPLETED").length,
        doctorsOnDuty: docs.filter(s => isOnDuty(db, s, now)).length,
        longestWait: deptWaits.length ? Math.max(...deptWaits) : 0,
        inpatients: db.admissions.filter(
          a => isInHouse(a) && a.departmentId === d.id
        ).length,
      };
    });

  /* IPD & beds */
  const inHouse = db.admissions.filter(isInHouse);
  const bedsByStatus = {
    AVAILABLE: 0,
    OCCUPIED: 0,
    RESERVED: 0,
    CLEANING: 0,
    MAINTENANCE: 0,
  };
  for (const b of db.beds) bedsByStatus[b.status] += 1;
  const occupancy = db.beds.length
    ? (bedsByStatus.OCCUPIED / db.beds.length) * 100
    : 0;
  const wards = db.wards.map(w => {
    const beds = db.beds.filter(
      b => db.rooms.find(r => r.id === b.roomId)?.wardId === w.id
    );
    return {
      id: w.id,
      name: w.name,
      category: w.category,
      total: beds.length,
      free: beds.filter(b => b.status === "AVAILABLE").length,
      occupied: beds.filter(b => b.status === "OCCUPIED").length,
      cleaning: beds.filter(b => b.status === "CLEANING").length,
    };
  });
  pushIf(alerts, occupancy >= 85, {
    id: "beds-occupancy",
    level: occupancy >= 95 ? "critical" : "warning",
    area: "Beds",
    title: `Bed occupancy at ${occupancy.toFixed(0)}%`,
    detail: `${bedsByStatus.AVAILABLE} beds free for new admissions`,
    href: "/beds",
  });
  for (const w of wards) {
    pushIf(alerts, w.free === 0 && w.total > 0, {
      id: `ward-full-${w.id}`,
      level: "warning",
      area: "Beds",
      title: `${w.name} is full`,
      detail: `${w.occupied}/${w.total} occupied${w.cleaning ? `, ${w.cleaning} being cleaned` : ""}`,
      href: "/beds",
    });
  }
  for (const bed of db.beds.filter(
    b => b.status === "CLEANING" && hoursBetween(b.statusChangedAt, now) > 3
  )) {
    const ref = bedRef(db, bed)!;
    alerts.push({
      id: `bed-clean-${bed.id}`,
      level: "warning",
      area: "Beds",
      title: `Bed ${ref.code} in cleaning for ${Math.round(hoursBetween(bed.statusChangedAt, now))} h`,
      detail: `${ref.ward} — turnover is delaying admissions`,
      href: "/beds",
    });
  }
  for (const a of inHouse.filter(
    x =>
      x.status === "DISCHARGE_PENDING" &&
      x.dischargeInitiatedAt &&
      hoursBetween(x.dischargeInitiatedAt, now) > 4
  )) {
    alerts.push({
      id: `dis-${a.id}`,
      level: "warning",
      area: "IPD",
      title: `Discharge of ${patientRef(db, a.patientId, now)!.name} pending ${Math.round(hoursBetween(a.dischargeInitiatedAt!, now))} h`,
      detail: `${a.code} — summary or final steps outstanding`,
      href: `/ipd/${a.id}`,
    });
  }
  for (const a of inHouse.filter(
    x =>
      x.status === "TRANSFER_PENDING" &&
      x.pendingTransfer &&
      hoursBetween(x.pendingTransfer.requestedAt, now) > 2
  )) {
    alerts.push({
      id: `tr-${a.id}`,
      level: "info",
      area: "IPD",
      title: `Transfer for ${a.code} waiting ${Math.round(hoursBetween(a.pendingTransfer!.requestedAt, now))} h`,
      detail: "Target bed is being held",
      href: `/ipd/${a.id}`,
    });
  }

  /* Lab */
  const openLabs = db.labOrders.filter(
    o => o.status !== "VERIFIED" && o.status !== "CANCELLED"
  );
  const overdueLabs = openLabs.filter(o => isLabOverdue(db, o, now));
  pushIf(alerts, overdueLabs.length > 0, {
    id: "lab-tat",
    level: overdueLabs.length > 5 ? "critical" : "warning",
    area: "Lab",
    title: `${overdueLabs.length} lab order(s) past target turnaround`,
    detail: overdueLabs
      .slice(0, 3)
      .map(o => o.code)
      .join(", "),
    href: "/lab",
  });
  const statPending = openLabs.filter(o => o.priority === "STAT");
  pushIf(alerts, statPending.length > 0, {
    id: "lab-stat",
    level: "warning",
    area: "Lab",
    title: `${statPending.length} STAT order(s) in progress`,
    detail: "Prioritise collection and reporting",
    href: "/lab",
  });
  const criticalRecent = db.labOrders.filter(
    o =>
      o.verifiedAt &&
      hoursBetween(o.verifiedAt, now) < 12 &&
      db.labOrderItems.some(
        i =>
          i.labOrderId === o.id &&
          db.labResults.some(
            r => r.labOrderItemId === i.id && r.flag.startsWith("CRITICAL")
          )
      )
  );
  for (const o of criticalRecent.slice(0, 4)) {
    alerts.push({
      id: `crit-${o.id}`,
      level: "critical",
      area: "Lab",
      title: `Critical result for ${patientRef(db, o.patientId, now)!.name}`,
      detail: `${o.code} verified ${Math.round(hoursBetween(o.verifiedAt!, now))} h ago — inform the treating doctor`,
      href: `/lab?open=${o.id}`,
    });
  }

  /* Pharmacy */
  const openRx = db.prescriptions.filter(
    p => p.status === "PENDING" || p.status === "PARTIALLY_DISPENSED"
  );
  const oldRx = openRx.filter(
    p => minutesBetween(p.createdAt, now) > 60 && isSameDay(p.createdAt, now)
  );
  pushIf(alerts, oldRx.length > 0, {
    id: "rx-wait",
    level: "warning",
    area: "Pharmacy",
    title: `${oldRx.length} prescription(s) waiting over an hour`,
    detail: "Dispensing queue is backing up",
    href: "/pharmacy",
  });
  const lowStock = db.medicines.filter(
    m => stockOnHand(db, m.id, today) <= m.reorderLevel
  );
  pushIf(alerts, lowStock.length > 0, {
    id: "stock-low",
    level: lowStock.some(m => stockOnHand(db, m.id, today) === 0)
      ? "critical"
      : "warning",
    area: "Pharmacy",
    title: `${lowStock.length} medicine(s) at or below reorder level`,
    detail: lowStock
      .slice(0, 3)
      .map(m => m.name)
      .join(", "),
    href: "/pharmacy/inventory",
  });
  const expiredOnShelf = db.medicineBatches.filter(
    b => b.expiryDate <= today && b.quantityOnHand > 0
  );
  pushIf(alerts, expiredOnShelf.length > 0, {
    id: "stock-expired",
    level: "warning",
    area: "Pharmacy",
    title: `${expiredOnShelf.length} expired batch(es) still on the shelf`,
    detail: "Write off and segregate",
    href: "/pharmacy/inventory",
  });

  /* Billing */
  const totals = allInvoiceTotals(db);
  const unpaidFinal = db.invoices.filter(
    i =>
      i.admissionId &&
      i.finalisedAt &&
      isSameDay(i.finalisedAt, now) &&
      (totals.get(i.id)?.balance ?? 0) > 0
  );
  pushIf(alerts, unpaidFinal.length > 0, {
    id: "bill-final",
    level: "info",
    area: "Billing",
    title: `${unpaidFinal.length} final bill(s) from today not settled`,
    detail: `₹${Math.round(unpaidFinal.reduce((s, i) => s + (totals.get(i.id)?.balance ?? 0), 0)).toLocaleString("en-IN")} outstanding`,
    href: "/billing",
  });

  const awaitingClearance = db.admissions.filter(
    a =>
      a.status === "DISCHARGE_PENDING" &&
      !a.billingClearedAt &&
      a.dischargeInitiatedAt &&
      hoursBetween(a.dischargeInitiatedAt, now) >= 2
  );
  pushIf(alerts, awaitingClearance.length > 0, {
    id: "bill-clearance",
    level: "warning",
    area: "Billing",
    title: `${awaitingClearance.length} discharge(s) waiting on billing clearance for 2 h+`,
    detail: awaitingClearance
      .slice(0, 3)
      .map(a => a.code)
      .join(", "),
    href: "/ipd",
  });

  /* Complaints */
  const openComplaints = db.complaints.filter(
    c => c.status !== "RESOLVED" && c.status !== "CLOSED"
  );
  const overdueComplaints = openComplaints.filter(c =>
    isComplaintOverdue(c, now)
  );
  pushIf(alerts, overdueComplaints.length > 0, {
    id: "cmp-overdue",
    level: "critical",
    area: "Complaints",
    title: `${overdueComplaints.length} complaint(s) past response target`,
    detail: overdueComplaints
      .slice(0, 2)
      .map(c => c.title)
      .join("; "),
    href: "/complaints",
  });
  const unassigned = openComplaints.filter(c => !c.assignedToId);
  pushIf(alerts, unassigned.length > 0, {
    id: "cmp-unassigned",
    level: "warning",
    area: "Complaints",
    title: `${unassigned.length} complaint(s) without an owner`,
    detail: "Assign to the department in-charge",
    href: "/complaints",
  });

  /* Staffing */
  const active = db.staff.filter(s => s.status === "ACTIVE");
  const onDutyBy = (role: string) =>
    active.filter(s => s.role === role && isOnDuty(db, s, now)).length;
  const nursesOnDuty = onDutyBy("NURSE");
  pushIf(alerts, nursesOnDuty < 3, {
    id: "staff-nurses",
    level: "critical",
    area: "Staffing",
    title: `Only ${nursesOnDuty} nurse(s) on duty`,
    detail: `For ${pluralize(inHouse.length, "inpatient")} — check the roster`,
    href: "/wfm/roster",
  });

  /* MRD */
  const mrdIncomplete = db.medicalRecords.filter(
    r =>
      r.status === "INCOMPLETE" &&
      r.recordType === "IPD_CASE_FILE" &&
      db.admissions.find(a => a.id === r.admissionId)?.status === "DISCHARGED"
  );
  pushIf(alerts, mrdIncomplete.length > 0, {
    id: "mrd",
    level: "info",
    area: "MRD",
    title: `${mrdIncomplete.length} discharged case file(s) incomplete`,
    detail: "Usually a missing consent form",
    href: "/mrd",
  });

  const order: Record<AlertLevel, number> = {
    critical: 0,
    warning: 1,
    info: 2,
  };
  alerts.sort((a, b) => order[a.level] - order[b.level]);

  return {
    at: now.toISOString(),
    opd: {
      booked: todays.filter(a => a.status !== "CANCELLED").length,
      waiting: waiting.length,
      inConsultation: todays.filter(a => a.status === "IN_CONSULTATION").length,
      completed: todays.filter(a => a.status === "COMPLETED").length,
      upcoming: todays.filter(
        a => a.status === "SCHEDULED" && new Date(a.scheduledAt) > now
      ).length,
      avgWaitNow: waits.length
        ? Math.round(waits.reduce((s, w) => s + w.minutes, 0) / waits.length)
        : 0,
    },
    ipd: {
      inHouse: inHouse.length,
      admittedToday: db.admissions.filter(a => isSameDay(a.admittedAt, now))
        .length,
      dischargedToday: db.admissions.filter(
        a => a.dischargedAt && isSameDay(a.dischargedAt, now)
      ).length,
      dischargePending: inHouse.filter(a => a.status === "DISCHARGE_PENDING")
        .length,
      transferPending: inHouse.filter(a => a.status === "TRANSFER_PENDING")
        .length,
    },
    beds: { ...bedsByStatus, total: db.beds.length, occupancy },
    wards,
    lab: {
      collection: openLabs.filter(
        o => o.status === "ORDERED" || o.status === "SAMPLE_PENDING"
      ).length,
      processing: openLabs.filter(
        o => o.status === "COLLECTED" || o.status === "PROCESSING"
      ).length,
      verification: openLabs.filter(o => o.status === "RESULT_READY").length,
      overdue: overdueLabs.length,
    },
    pharmacy: { pending: openRx.length, lowStock: lowStock.length },
    complaints: {
      open: openComplaints.length,
      overdue: overdueComplaints.length,
    },
    staff: {
      doctors: onDutyBy("DOCTOR"),
      nurses: nursesOnDuty,
      pharmacists: onDutyBy("PHARMACIST"),
      lab: onDutyBy("LAB_TECHNICIAN"),
      frontOffice: onDutyBy("RECEPTIONIST"),
      billing: onDutyBy("BILLING_EXECUTIVE"),
    },
    departments,
    alerts,
    activity: [...db.activity]
      .sort((a, b) => b.at.localeCompare(a.at))
      .slice(0, 30)
      .map(e => ({
        id: e.id,
        at: e.at,
        summary: e.summary,
        entityType: e.entityType,
        actor: staffName(getStaff(db, e.actorId)),
        department: departmentName(db, getStaff(db, e.actorId)?.departmentId),
      })),
  };
}
export type OperationsSnapshot = ReturnType<typeof buildOperations>;
export function operationsView(db: Database, now: Date) {
  return buildOperations(db, now);
}
