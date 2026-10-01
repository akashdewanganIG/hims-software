/**
 * View builders for the dashboard: pure functions of the database, the
 * clock and the signed-in login. Everything is cut to that login's access —
 * headline figures only for modules it can open, work queues for the actions
 * it takes (and, for doctors, their own patients), alerts from its areas —
 * so the server never sends one department's figures to another.
 */
import type { Database } from "@/lib/sim/schema";
import { allInvoiceTotals } from "@/lib/domain/billing";
import { dischargeClearance, isInHouse } from "@/lib/domain/ipd";
import { stockOnHand } from "@/lib/domain/pharmacy";
import { checklistComplete } from "@/lib/domain/mrd";
import { isComplaintOverdue } from "@/lib/domain/quality";
import {
  admissionBed,
  getStaff,
  patientRef,
  staffName,
  type PatientRef,
} from "@/lib/api/lookup";
import type { Actor } from "@/lib/ops/execute";
import {
  ACTION_MODULE,
  ADMINISTRATOR_ROLE,
  MODULES,
  STAFF_ROLE_LABEL,
  type Action,
  type Module,
} from "@/lib/rbac";
import { formatDuration, formatINRCompact, pluralize } from "@/lib/format";
import {
  hoursBetween,
  isSameDay,
  isoDate,
  minutesBetween,
} from "@/lib/sim/time";
import { buildAnalytics } from "@/features/analytics/views";
import { buildOperations } from "@/features/operations/views";

export interface WorkItem {
  id: string;
  title: string;
  detail: string;
  href: string;
  badge?: {
    label: string;
    tone: "neutral" | "active" | "progress" | "pending" | "danger";
  };
  patient?: PatientRef;
}
export interface WorkQueue {
  title: string;
  description: string;
  href: string;
  items: WorkItem[];
  empty: string;
}

export interface DashboardMetric {
  module: Module;
  label: string;
  value: string;
  hint: string;
  href: string;
  tone: "neutral" | "warning" | "critical";
}

/** Alert areas → the modules that make an alert relevant. */
const ALERT_MODULES: Record<string, Module[]> = {
  OPD: ["opd"],
  IPD: ["ipd"],
  Beds: ["beds", "ipd"],
  Lab: ["lab"],
  Pharmacy: ["pharmacy"],
  Billing: ["billing"],
  Complaints: ["complaints"],
  Staffing: ["wfm", "operations"],
  MRD: ["mrd"],
};

/** Queues an Administrator's overview shows (they could run every desk). */
const ADMINISTRATOR_QUEUES = new Set([
  "arrivals",
  "enquiries",
  "complaints",
  "logins",
]);

const time = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
  });

export function dashboardView(db: Database, now: Date, actor: Actor) {
  const ops = buildOperations(db, now);
  const today = isoDate(now);
  const opens = (m: Module) => actor.access.modules.has(m);
  const does = (a: Action) => actor.access.actions.has(a);
  const administrator = actor.role.id === ADMINISTRATOR_ROLE;
  const doctor = actor.staff.role === "DOCTOR";
  const staffId = actor.staff.id;
  const wants = (queue: string, condition: boolean) =>
    administrator ? ADMINISTRATOR_QUEUES.has(queue) : condition;
  const queues: WorkQueue[] = [];

  if (wants("my-opd", doctor && opens("opd"))) {
    const mine = db.appointments
      .filter(
        a =>
          a.doctorId === staffId &&
          isoDate(a.scheduledAt) === today &&
          (a.status === "CHECKED_IN" ||
            a.status === "IN_CONSULTATION" ||
            a.status === "SCHEDULED")
      )
      .sort((a, b) =>
        a.status === "IN_CONSULTATION"
          ? -1
          : b.status === "IN_CONSULTATION"
            ? 1
            : (a.tokenNumber ?? 99) - (b.tokenNumber ?? 99) ||
              a.scheduledAt.localeCompare(b.scheduledAt)
      );
    queues.push({
      title: "My OPD queue",
      description: "Patients checked in or booked with you today.",
      href: "/opd",
      empty: "No patients waiting for you.",
      items: mine.slice(0, 8).map(a => ({
        id: a.id,
        title: patientRef(db, a.patientId, now)!.name,
        detail:
          a.status === "CHECKED_IN"
            ? `Token ${a.tokenNumber} · waiting ${minutesBetween(a.checkedInAt!, now)} min · ${a.reason}`
            : a.status === "IN_CONSULTATION"
              ? `In consultation · ${a.reason}`
              : `Booked ${time(a.scheduledAt)} · ${a.reason}`,
        href: a.encounterId ? `/opd/visits/${a.encounterId}` : "/opd",
        badge:
          a.status === "CHECKED_IN"
            ? { label: "Waiting", tone: "pending" }
            : a.status === "IN_CONSULTATION"
              ? { label: "Consulting", tone: "progress" }
              : { label: "Booked", tone: "neutral" },
        patient: patientRef(db, a.patientId, now),
      })),
    });
  }

  if (wants("my-ipd", doctor && opens("ipd"))) {
    const inpatients = db.admissions.filter(
      a => a.doctorId === staffId && isInHouse(a)
    );
    queues.push({
      title: "My inpatients",
      description:
        "Admitted under you. Progress notes and discharges happen here.",
      href: "/ipd",
      empty: "No inpatients under your care.",
      items: inpatients.map(a => {
        const bed = admissionBed(db, a);
        const notedToday = db.clinicalNotes.some(
          n =>
            n.admissionId === a.id &&
            n.authorId === staffId &&
            n.type === "PROGRESS" &&
            isSameDay(n.at, now)
        );
        return {
          id: a.id,
          title: patientRef(db, a.patientId, now)!.name,
          detail: `${bed ? `${bed.ward} · ${bed.code}` : ""} · ${a.provisionalDiagnosis}`,
          href: `/ipd/${a.id}`,
          badge:
            a.status === "DISCHARGE_PENDING"
              ? { label: "Discharge pending", tone: "pending" }
              : notedToday
                ? { label: "Seen today", tone: "active" }
                : { label: "Round due", tone: "pending" },
        };
      }),
    });
  }

  if (wants("my-results", doctor && opens("lab"))) {
    const results = db.labOrders.filter(
      o =>
        o.orderedById === staffId &&
        o.verifiedAt &&
        hoursBetween(o.verifiedAt, now) < 24
    );
    queues.push({
      title: "New lab results",
      description: "Reports verified in the last 24 hours for your orders.",
      href: "/lab",
      empty: "No new results.",
      items: results.map(o => {
        const itemIds = new Set(
          db.labOrderItems.filter(i => i.labOrderId === o.id).map(i => i.id)
        );
        const abnormal = db.labResults.filter(
          r => itemIds.has(r.labOrderItemId) && r.flag !== "NORMAL"
        ).length;
        return {
          id: o.id,
          title: patientRef(db, o.patientId, now)!.name,
          detail: `${o.code} · ${db.labOrderItems
            .filter(i => i.labOrderId === o.id)
            .map(i => db.labTests.find(t => t.id === i.testId)?.name)
            .join(", ")}`,
          href: `/lab?open=${o.id}`,
          badge: abnormal
            ? { label: `${abnormal} abnormal`, tone: "danger" }
            : { label: "Normal", tone: "active" },
        };
      }),
    });
  }

  if (wants("vitals", !doctor && does("opd.vitals"))) {
    const needVitals = db.appointments.filter(
      a =>
        a.status === "CHECKED_IN" &&
        isoDate(a.scheduledAt) === today &&
        !db.encounters.find(e => e.id === a.encounterId)?.vitals
    );
    queues.push({
      title: "Vitals due (OPD)",
      description: "Checked-in patients without vitals yet.",
      href: "/opd",
      empty: "All checked-in patients have vitals.",
      items: needVitals.map(a => ({
        id: a.id,
        title: patientRef(db, a.patientId, now)!.name,
        detail: `Token ${a.tokenNumber} · ${staffName(getStaff(db, a.doctorId))} · waiting ${minutesBetween(a.checkedInAt!, now)} min`,
        href: `/opd/visits/${a.encounterId}`,
        badge: { label: "Vitals", tone: "pending" },
      })),
    });
  }

  if (wants("samples", does("lab.collect") && !does("lab.result"))) {
    const samples = db.labOrders.filter(
      o =>
        o.admissionId &&
        (o.status === "ORDERED" || o.status === "SAMPLE_PENDING")
    );
    queues.push({
      title: "Ward samples to collect",
      description: "Inpatient lab orders awaiting collection.",
      href: "/lab",
      empty: "No samples waiting on the wards.",
      items: samples.map(o => {
        const a = db.admissions.find(x => x.id === o.admissionId)!;
        const bed = admissionBed(db, a);
        return {
          id: o.id,
          title: patientRef(db, o.patientId, now)!.name,
          detail: `${o.code} · ${bed ? `${bed.ward} ${bed.code}` : ""}`,
          href: `/lab?open=${o.id}`,
          badge: {
            label: o.priority === "ROUTINE" ? "Routine" : o.priority,
            tone: o.priority === "ROUTINE" ? "neutral" : "danger",
          },
        };
      }),
    });
  }

  if (wants("turnover", does("beds.housekeeping"))) {
    const turnover = db.beds.filter(b => b.status === "CLEANING");
    queues.push({
      title: "Beds being turned over",
      description: "Mark available once cleaned.",
      href: "/beds",
      empty: "No beds in cleaning.",
      items: turnover.map(b => ({
        id: b.id,
        title: `Bed ${b.code}`,
        detail: `Cleaning for ${Math.round(hoursBetween(b.statusChangedAt, now) * 60)} min`,
        href: "/beds",
        badge: { label: "Cleaning", tone: "pending" },
      })),
    });
  }

  if (wants("arrivals", does("appointment.book"))) {
    const arrivals = db.appointments
      .filter(a => a.status === "SCHEDULED" && isoDate(a.scheduledAt) === today)
      .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
    queues.push({
      title: "Arrivals to check in",
      description: "Today's booked patients who have not arrived yet.",
      href: "/opd",
      empty: "Everyone booked today has arrived.",
      items: arrivals.slice(0, 8).map(a => ({
        id: a.id,
        title: patientRef(db, a.patientId, now)!.name,
        detail: `${time(a.scheduledAt)} · ${staffName(getStaff(db, a.doctorId))}`,
        href: "/opd",
        badge:
          new Date(a.scheduledAt) < now
            ? { label: "Late", tone: "danger" }
            : { label: "Booked", tone: "neutral" },
        patient: patientRef(db, a.patientId, now),
      })),
    });
  }

  if (wants("enquiries", does("enquiry.manage"))) {
    const followUps = db.enquiries.filter(
      e =>
        (e.status === "NEW" || e.status === "FOLLOW_UP_REQUIRED") &&
        e.followUpDate &&
        e.followUpDate <= today
    );
    queues.push({
      title: "Enquiry follow-ups due",
      description: "Call-backs promised for today or earlier.",
      href: "/enquiries",
      empty: "No follow-ups due.",
      items: followUps.map(e => ({
        id: e.id,
        title: e.prospectName,
        detail: `${e.code} · ${e.reason}`,
        href: `/enquiries?open=${e.id}`,
        badge:
          e.followUpDate! < today
            ? { label: "Overdue", tone: "danger" }
            : { label: "Today", tone: "pending" },
      })),
    });
  }

  if (wants("dispense", does("pharmacy.dispense"))) {
    const open = db.prescriptions
      .filter(p => p.status === "PENDING" || p.status === "PARTIALLY_DISPENSED")
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    queues.push({
      title: "Prescriptions to dispense",
      description: "Oldest first.",
      href: "/pharmacy",
      empty: "The queue is clear.",
      items: open.slice(0, 8).map(p => ({
        id: p.id,
        title: patientRef(db, p.patientId, now)!.name,
        detail: `${p.code} · ${p.admissionId ? "Ward" : "OPD"} · waiting ${minutesBetween(p.createdAt, now)} min`,
        href: `/pharmacy?open=${p.id}`,
        badge:
          p.status === "PARTIALLY_DISPENSED"
            ? { label: "Partly done", tone: "progress" }
            : { label: "New", tone: "pending" },
      })),
    });
  }

  if (wants("reorder", does("pharmacy.stock"))) {
    const low = db.medicines.filter(
      m => stockOnHand(db, m.id, today) <= m.reorderLevel
    );
    queues.push({
      title: "Stock to reorder",
      description: "At or below the reorder level.",
      href: "/pharmacy/inventory",
      empty: "Stock levels are healthy.",
      items: low.map(m => ({
        id: m.id,
        title: `${m.name} ${m.strength}`,
        detail: `${stockOnHand(db, m.id, today)} on hand · reorder at ${m.reorderLevel}`,
        href: "/pharmacy/inventory",
        badge:
          stockOnHand(db, m.id, today) === 0
            ? { label: "Out", tone: "danger" }
            : { label: "Low", tone: "pending" },
      })),
    });
  }

  if (wants("worklist", does("lab.result"))) {
    const open = db.labOrders
      .filter(o => o.status !== "VERIFIED" && o.status !== "CANCELLED")
      .sort(
        (a, b) =>
          (a.priority === "STAT" ? -1 : 0) - (b.priority === "STAT" ? -1 : 0) ||
          a.orderedAt.localeCompare(b.orderedAt)
      );
    queues.push({
      title: "Lab worklist",
      description: "STAT first, then oldest.",
      href: "/lab",
      empty: "Nothing pending in the lab.",
      items: open.slice(0, 10).map(o => ({
        id: o.id,
        title: patientRef(db, o.patientId, now)!.name,
        detail: `${o.code} · ${o.status.replace(/_/g, " ").toLowerCase()} · ordered ${minutesBetween(o.orderedAt, now)} min ago`,
        href: `/lab?open=${o.id}`,
        badge: {
          label: o.priority === "ROUTINE" ? "Routine" : o.priority,
          tone: o.priority === "ROUTINE" ? "neutral" : "danger",
        },
      })),
    });
  }

  if (wants("clearance", does("billing.collect"))) {
    const pending = db.admissions
      .filter(a => a.status === "DISCHARGE_PENDING" && !a.billingClearedAt)
      .sort((a, b) =>
        (a.dischargeInitiatedAt ?? "").localeCompare(
          b.dischargeInitiatedAt ?? ""
        )
      );
    queues.push({
      title: "Discharges awaiting billing clearance",
      description: "Settle the final bill (or record approved dues) and clear.",
      href: "/ipd",
      empty: "No discharge is waiting on billing.",
      items: pending.map(a => {
        const { balance, summaryFinal } = dischargeClearance(db, a, now);
        return {
          id: a.id,
          title: patientRef(db, a.patientId, now)!.name,
          detail: `${a.code} · ${balance > 0 ? `₹${Math.round(balance).toLocaleString("en-IN")} due` : "settled"}${summaryFinal ? "" : " · summary in progress"}`,
          href: `/ipd/${a.id}`,
          badge:
            balance > 0
              ? { label: "Collect", tone: "pending" as const }
              : { label: "Ready to clear", tone: "active" as const },
        };
      }),
    });
  }

  if (wants("billing", does("billing.adjust") || does("billing.refund"))) {
    const totals = allInvoiceTotals(db);
    const due = db.invoices
      .filter(
        i =>
          (i.status === "PENDING" || i.status === "PARTIALLY_PAID") &&
          (totals.get(i.id)?.balance ?? 0) > 0
      )
      .sort((a, b) => totals.get(b.id)!.balance - totals.get(a.id)!.balance);
    queues.push({
      title: "Largest outstanding bills",
      description: "Issued bills with a balance.",
      href: "/billing",
      empty: "No outstanding bills.",
      items: due.slice(0, 8).map(i => ({
        id: i.id,
        title: patientRef(db, i.patientId, now)!.name,
        detail: `${i.code} · ₹${Math.round(totals.get(i.id)!.balance).toLocaleString("en-IN")} due`,
        href: `/billing/${i.id}`,
        badge: i.admissionId
          ? { label: "IPD", tone: "progress" }
          : { label: "OPD", tone: "neutral" },
      })),
    });
    const refunds = db.invoices.filter(
      i => (totals.get(i.id)?.refundDue ?? 0) > 0
    );
    queues.push({
      title: "Refunds due",
      description: "Collected more than the bill total.",
      href: "/billing",
      empty: "No refunds due.",
      items: refunds.map(i => ({
        id: i.id,
        title: patientRef(db, i.patientId, now)!.name,
        detail: `${i.code} · ₹${Math.round(totals.get(i.id)!.refundDue).toLocaleString("en-IN")} to refund`,
        href: `/billing/${i.id}`,
        badge: { label: "Refund", tone: "pending" },
      })),
    });
  }

  if (wants("records", does("mrd.manage"))) {
    const review = db.medicalRecords
      .filter(r => r.status === "PENDING_REVIEW")
      .sort((a, b) => (a.submittedAt ?? "").localeCompare(b.submittedAt ?? ""));
    queues.push({
      title: "Records to review",
      description: "Checklist complete; awaiting MRD sign-off.",
      href: "/mrd",
      empty: "Nothing awaiting review.",
      items: review.slice(0, 8).map(r => ({
        id: r.id,
        title: patientRef(db, r.patientId, now)!.name,
        detail: `${r.code} · ${r.recordType === "IPD_CASE_FILE" ? "IPD case file" : "OPD case sheet"}`,
        href: `/mrd?open=${r.id}`,
        badge: { label: "Review", tone: "progress" },
      })),
    });
    const stuck = db.medicalRecords.filter(
      r =>
        r.status === "INCOMPLETE" &&
        !checklistComplete(db, r) &&
        db.admissions.find(a => a.id === r.admissionId)?.status === "DISCHARGED"
    );
    queues.push({
      title: "Discharged files incomplete",
      description: "Chase the ward for missing items.",
      href: "/mrd",
      empty: "All discharged files are complete.",
      items: stuck.slice(0, 8).map(r => ({
        id: r.id,
        title: patientRef(db, r.patientId, now)!.name,
        detail: r.code,
        href: `/mrd?open=${r.id}`,
        badge: { label: "Incomplete", tone: "pending" },
      })),
    });
  }

  if (wants("complaints", does("complaint.manage"))) {
    const open = db.complaints
      .filter(c => c.status !== "RESOLVED" && c.status !== "CLOSED")
      .map(c => ({ c, overdue: isComplaintOverdue(c, now) }))
      .sort(
        (a, b) =>
          Number(b.overdue) - Number(a.overdue) ||
          Number(!b.c.assignedToId) - Number(!a.c.assignedToId) ||
          a.c.dueDate.localeCompare(b.c.dueDate)
      );
    queues.push({
      title: "Complaints needing action",
      description: "Past their response target or without an owner first.",
      href: "/complaints",
      empty: "No open complaints.",
      items: open.slice(0, 8).map(({ c, overdue }) => ({
        id: c.id,
        title: c.title,
        detail: `${c.code} · ${c.complainantName} · due ${c.dueDate}`,
        href: `/complaints?open=${c.id}`,
        badge: overdue
          ? { label: "Overdue", tone: "danger" }
          : !c.assignedToId
            ? { label: "Unassigned", tone: "pending" }
            : {
                label: c.status.replace(/_/g, " ").toLowerCase(),
                tone: "progress",
              },
      })),
    });
  }

  if (wants("logins", does("users.manage"))) {
    const withLogin = new Set(db.users.map(u => u.staffId));
    const missing = db.staff.filter(
      s => s.status === "ACTIVE" && s.role !== "SUPPORT" && !withLogin.has(s.id)
    );
    const disabled = db.users.filter(u => u.status === "DISABLED");
    queues.push({
      title: "Logins to review",
      description: "Staff without a login, and disabled logins.",
      href: "/admin/users",
      empty: "Every member of staff who needs a login has one.",
      items: [
        ...missing.map(s => ({
          id: s.id,
          title: staffName(s),
          detail: `${s.designation} · no login yet`,
          href: `/admin/users?create=${s.id}`,
          badge: { label: "No login", tone: "pending" as const },
        })),
        ...disabled.map(u => {
          const s = getStaff(db, u.staffId);
          return {
            id: u.id,
            title: staffName(s),
            detail: `${u.username} · ${s ? STAFF_ROLE_LABEL[s.role] : ""}`,
            href: `/admin/users?open=${u.id}`,
            badge: { label: "Disabled", tone: "neutral" as const },
          };
        }),
      ],
    });
  }

  return {
    metrics: metricsFor(db, now, ops, opens, does),
    queues,
    alerts: ops.alerts.filter(a =>
      (ALERT_MODULES[a.area] ?? ["operations"]).some(opens)
    ),
    /** One-line hints for the module cards, only for modules it can open. */
    hints: moduleHints(ops, opens),
  };
}

type Snapshot = ReturnType<typeof buildOperations>;

/**
 * Headline figures for the modules this login can open — the ones it works
 * in (holds actions for) first — at most six.
 */
function metricsFor(
  db: Database,
  now: Date,
  ops: Snapshot,
  opens: (m: Module) => boolean,
  does: (a: Action) => boolean
): DashboardMetric[] {
  const all: DashboardMetric[] = [];
  if (opens("opd"))
    all.push({
      module: "opd",
      label: "OPD waiting",
      value: String(ops.opd.waiting),
      hint: `Avg wait ${formatDuration(ops.opd.avgWaitNow)} · ${ops.opd.completed} seen`,
      href: "/opd",
      tone: ops.opd.avgWaitNow > 30 ? "warning" : "neutral",
    });
  if (opens("ipd"))
    all.push({
      module: "ipd",
      label: "Inpatients",
      value: String(ops.ipd.inHouse),
      hint: `${ops.ipd.admittedToday} admitted · ${ops.ipd.dischargePending} awaiting discharge`,
      href: "/ipd",
      tone: "neutral",
    });
  if (opens("beds"))
    all.push({
      module: "beds",
      label: "Beds free",
      value: String(ops.beds.AVAILABLE),
      hint: `${ops.beds.occupancy.toFixed(0)}% occupancy · ${ops.beds.CLEANING} cleaning`,
      href: "/beds",
      tone: ops.beds.occupancy >= 85 ? "critical" : "neutral",
    });
  if (opens("lab"))
    all.push({
      module: "lab",
      label: "Lab in progress",
      value: String(
        ops.lab.collection + ops.lab.processing + ops.lab.verification
      ),
      hint: `${ops.lab.verification} to verify · ${ops.lab.overdue} past TAT`,
      href: "/lab",
      tone: ops.lab.overdue ? "warning" : "neutral",
    });
  if (opens("pharmacy"))
    all.push({
      module: "pharmacy",
      label: "Rx to dispense",
      value: String(ops.pharmacy.pending),
      hint: `${pluralize(ops.pharmacy.lowStock, "medicine")} low on stock`,
      href: "/pharmacy",
      tone: "neutral",
    });
  if (opens("billing")) {
    const collected = db.payments
      .filter(p => isSameDay(p.receivedAt, now))
      .reduce((s, p) => s + (p.kind === "REFUND" ? -p.amount : p.amount), 0);
    const totals = allInvoiceTotals(db);
    const open = db.invoices.filter(
      i =>
        (i.status === "PENDING" || i.status === "PARTIALLY_PAID") &&
        (totals.get(i.id)?.balance ?? 0) > 0
    ).length;
    all.push({
      module: "billing",
      label: "Collected today",
      value: formatINRCompact(collected),
      hint: `${pluralize(open, "bill")} with a balance`,
      href: "/billing",
      tone: "neutral",
    });
  }
  if (opens("enquiry")) {
    const today = isoDate(now);
    const open = db.enquiries.filter(
      e => e.status === "NEW" || e.status === "FOLLOW_UP_REQUIRED"
    );
    all.push({
      module: "enquiry",
      label: "Open enquiries",
      value: String(open.length),
      hint: `${pluralize(open.filter(e => e.followUpDate && e.followUpDate <= today).length, "follow-up")} due`,
      href: "/enquiries",
      tone: "neutral",
    });
  }
  if (opens("complaints"))
    all.push({
      module: "complaints",
      label: "Open complaints",
      value: String(ops.complaints.open),
      hint: `${ops.complaints.overdue} past response target`,
      href: "/complaints",
      tone: ops.complaints.overdue ? "warning" : "neutral",
    });
  if (opens("mrd")) {
    const review = db.medicalRecords.filter(
      r => r.status === "PENDING_REVIEW"
    ).length;
    const incomplete = db.medicalRecords.filter(
      r => r.status === "INCOMPLETE"
    ).length;
    all.push({
      module: "mrd",
      label: "Records to review",
      value: String(review),
      hint: `${incomplete} incomplete`,
      href: "/mrd",
      tone: "neutral",
    });
  }
  if (opens("wfm"))
    all.push({
      module: "wfm",
      label: "On duty now",
      value: String(
        ops.staff.doctors +
          ops.staff.nurses +
          ops.staff.pharmacists +
          ops.staff.lab +
          ops.staff.frontOffice +
          ops.staff.billing
      ),
      hint: `${pluralize(ops.staff.doctors, "doctor")} · ${pluralize(ops.staff.nurses, "nurse")}`,
      href: "/wfm/roster",
      tone: ops.staff.nurses < 3 ? "critical" : "neutral",
    });
  if (opens("admin"))
    all.push({
      module: "admin",
      label: "Active logins",
      value: String(db.users.filter(u => u.status === "ACTIVE").length),
      hint: `${pluralize(db.roles.length, "role")} · ${db.users.filter(u => u.customAccess).length} custom access`,
      href: "/admin/users",
      tone: "neutral",
    });
  const worksIn = (m: Module) =>
    Object.entries(ACTION_MODULE).some(
      ([action, module]) => module === m && does(action as Action)
    );
  return [
    ...all.filter(m => worksIn(m.module)),
    ...all.filter(m => !worksIn(m.module)),
  ]
    .sort(
      (a, b) =>
        Number(worksIn(b.module)) - Number(worksIn(a.module)) ||
        MODULES.indexOf(a.module) - MODULES.indexOf(b.module)
    )
    .slice(0, 6);
}

function moduleHints(ops: Snapshot, opens: (m: Module) => boolean) {
  const hints: Partial<Record<string, string>> = {
    "/enquiries": "Calls, walk-ins and referrals",
    "/opd": `${ops.opd.waiting} waiting · ${ops.opd.completed} seen today`,
    "/ipd": `${pluralize(ops.ipd.inHouse, "inpatient")} · ${ops.ipd.dischargePending} awaiting discharge`,
    "/patients": "Unified patient records",
    "/pharmacy": `${pluralize(ops.pharmacy.pending, "prescription")} to dispense`,
    "/lab": `${pluralize(ops.lab.collection + ops.lab.processing + ops.lab.verification, "order")} in progress`,
    "/beds": `${pluralize(ops.beds.AVAILABLE, "bed")} free · ${ops.beds.occupancy.toFixed(0)}% occupied`,
    "/operations": `${pluralize(ops.alerts.length, "alert")} right now`,
    "/wfm": `${pluralize(ops.staff.doctors, "doctor")} · ${pluralize(ops.staff.nurses, "nurse")} on duty`,
    "/billing": "Bills, payments and refunds",
    "/mrd": "Case sheets and case files",
    "/complaints": `${ops.complaints.open} open ${ops.complaints.open === 1 ? "complaint" : "complaints"}`,
    "/feedback": "Ratings and follow-ups",
    "/analytics": "Trends and KPIs",
    "/admin/users": "Logins, roles and permissions",
  };
  const moduleOf: Record<string, Module> = {
    "/enquiries": "enquiry",
    "/opd": "opd",
    "/ipd": "ipd",
    "/patients": "ehr",
    "/pharmacy": "pharmacy",
    "/lab": "lab",
    "/beds": "beds",
    "/operations": "operations",
    "/wfm": "wfm",
    "/billing": "billing",
    "/mrd": "mrd",
    "/complaints": "complaints",
    "/feedback": "feedback",
    "/analytics": "analytics",
    "/admin/users": "admin",
  };
  return Object.fromEntries(
    Object.entries(hints).filter(([href]) => opens(moduleOf[href]!))
  ) as Record<string, string>;
}

/**
 * The "last 7 days" strip — only the series this login's modules cover:
 * OPD visits (OPD), admissions (IPD) and collections (billing, analytics).
 */
export function dashboardTrendView(db: Database, now: Date, actor: Actor) {
  const opens = (m: Module) => actor.access.modules.has(m);
  const visits = opens("opd");
  const admissions = opens("ipd");
  const money = opens("billing") || opens("analytics");
  if (!visits && !admissions && !money) return null;
  const analytics = buildAnalytics(db, now, 7);
  return {
    revenue: money ? analytics.kpis.revenue : null,
    daily: analytics.daily.map(d => ({
      label: d.label,
      visits: visits ? d.visits : null,
      admissions: admissions ? d.admissions : null,
    })),
  };
}
