/**
 * View builders for analytics: pure functions of the database, the clock and
 * the request's parameters. Registered in lib/views/registry.ts; the browser
 * sandbox runs them locally, the server runs them for signed-in users.
 */
import { allInvoiceTotals, lineTotal } from "@/lib/domain/billing";
import { isInHouse } from "@/lib/domain/ipd";
import { departmentName } from "@/lib/api/lookup";
import type { Database } from "@/lib/sim/schema";
import {
  addDays,
  hoursBetween,
  isoDate,
  minutesBetween,
  startOfDay,
} from "@/lib/sim/time";

export interface Kpi {
  value: number;
  previous: number;
}
function kpi(current: number, previous: number): Kpi {
  return { value: current, previous };
}
/** Everything is aggregated from the operational records — no stored stats. */
export function buildAnalytics(db: Database, now: Date, days: number) {
  const today = startOfDay(now);
  const start = addDays(today, -(days - 1));
  const prevStart = addDays(start, -days);
  const iso = (d: Date) => d.toISOString();
  const inRange = (value: string | undefined, from: Date, to: Date) =>
    Boolean(value && value >= iso(from) && value < iso(to));
  const end = addDays(today, 1);

  const dayList = Array.from({ length: days }, (_, i) => addDays(start, i));
  const label = (d: Date) =>
    d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });

  const opd = db.encounters.filter(e => e.type === "OPD");
  const visits = (from: Date, to: Date) =>
    opd.filter(e => inRange(e.startedAt, from, to)).length;
  const admissions = (from: Date, to: Date) =>
    db.admissions.filter(a => inRange(a.admittedAt, from, to)).length;
  const discharges = (from: Date, to: Date) =>
    db.admissions.filter(a => inRange(a.dischargedAt, from, to)).length;
  const labOrders = (from: Date, to: Date) =>
    db.labOrders.filter(
      o => o.status !== "CANCELLED" && inRange(o.orderedAt, from, to)
    );
  const collections = (from: Date, to: Date) =>
    db.payments
      .filter(p => inRange(p.receivedAt, from, to))
      .reduce((s, p) => s + (p.kind === "PAYMENT" ? p.amount : -p.amount), 0);
  const dispenses = (from: Date, to: Date) =>
    db.pharmacyTransactions.filter(
      t =>
        (t.type === "DISPENSE" || t.type === "SALE") && inRange(t.at, from, to)
    ).length;
  const waitsIn = (from: Date, to: Date) =>
    db.appointments
      .filter(
        a =>
          a.checkedInAt &&
          a.consultationStartedAt &&
          inRange(a.checkedInAt, from, to)
      )
      .map(a => minutesBetween(a.checkedInAt!, a.consultationStartedAt!));
  const tatIn = (from: Date, to: Date) =>
    db.labOrders
      .filter(o => o.verifiedAt && inRange(o.verifiedAt, from, to))
      .map(o => hoursBetween(o.orderedAt, o.verifiedAt!));
  const avg = (xs: number[]) =>
    xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0;
  const complaintsIn = (from: Date, to: Date) =>
    db.complaints.filter(c => inRange(c.createdAt, from, to));
  const feedbackIn = (from: Date, to: Date) =>
    db.feedback.filter(f => inRange(f.submittedAt, from, to));

  /** Beds occupied at a moment, from bed-assignment intervals. */
  const occupiedAt = (moment: Date) => {
    const m = iso(moment);
    return db.bedAssignments.filter(
      a => a.fromAt <= m && (!a.toAt || a.toAt > m)
    ).length;
  };

  const totals = allInvoiceTotals(db);
  const pendingBills = db.invoices
    .filter(i => i.status === "PENDING" || i.status === "PARTIALLY_PAID")
    .reduce((s, i) => s + (totals.get(i.id)?.balance ?? 0), 0);

  // Comparisons are only meaningful when the previous window is fully covered
  // by recorded history.
  const firstRecord = db.encounters.reduce(
    (min, e) => (e.startedAt < min ? e.startedAt : min),
    iso(now)
  );
  const comparable = iso(prevStart) >= iso(startOfDay(firstRecord));
  const cur = { from: start, to: end };
  const prev = { from: prevStart, to: start };
  const totalBeds = db.beds.length;
  const occupiedNow = db.beds.filter(b => b.status === "OCCUPIED").length;
  const fbCur = feedbackIn(cur.from, cur.to);
  const fbPrev = feedbackIn(prev.from, prev.to);
  const cmpCur = complaintsIn(cur.from, cur.to);
  const cmpPrev = complaintsIn(prev.from, prev.to);

  const kpis = {
    opdVisits: kpi(visits(cur.from, cur.to), visits(prev.from, prev.to)),
    admissions: kpi(
      admissions(cur.from, cur.to),
      admissions(prev.from, prev.to)
    ),
    discharges: kpi(
      discharges(cur.from, cur.to),
      discharges(prev.from, prev.to)
    ),
    inpatients: db.admissions.filter(isInHouse).length,
    occupancy: totalBeds ? (occupiedNow / totalBeds) * 100 : 0,
    availableBeds: db.beds.filter(b => b.status === "AVAILABLE").length,
    avgOccupancy: kpi(
      avg(
        dayList.map(
          d =>
            (occupiedAt(
              new Date(
                Math.min(addDays(d, 1).getTime() - 60_000, now.getTime())
              )
            ) /
              Math.max(1, totalBeds)) *
            100
        )
      ),
      avg(
        Array.from(
          { length: days },
          (_, i) =>
            (occupiedAt(addDays(prevStart, i + 1)) / Math.max(1, totalBeds)) *
            100
        )
      )
    ),
    labOrders: kpi(
      labOrders(cur.from, cur.to).length,
      labOrders(prev.from, prev.to).length
    ),
    labTat: kpi(avg(tatIn(cur.from, cur.to)), avg(tatIn(prev.from, prev.to))),
    dispenses: kpi(dispenses(cur.from, cur.to), dispenses(prev.from, prev.to)),
    revenue: kpi(
      collections(cur.from, cur.to),
      collections(prev.from, prev.to)
    ),
    pendingBills,
    opdWait: kpi(
      avg(waitsIn(cur.from, cur.to)),
      avg(waitsIn(prev.from, prev.to))
    ),
    complaints: kpi(cmpCur.length, cmpPrev.length),
    resolvedComplaints: kpi(
      cmpCur.filter(c => c.resolvedAt).length,
      cmpPrev.filter(c => c.resolvedAt).length
    ),
    rating: kpi(avg(fbCur.map(f => f.rating)), avg(fbPrev.map(f => f.rating))),
    alos: avg(
      db.admissions
        .filter(a => inRange(a.dischargedAt, cur.from, cur.to))
        .map(a => hoursBetween(a.admittedAt, a.dischargedAt!) / 24)
    ),
  };

  const daily = dayList.map(d => {
    const next = addDays(d, 1);
    const snapshot = next > now ? now : new Date(next.getTime() - 60_000);
    const labs = labOrders(d, next);
    const tats = tatIn(d, next);
    return {
      label: label(d),
      date: isoDate(d),
      visits: visits(d, next),
      admissions: admissions(d, next),
      discharges: discharges(d, next),
      occupancy: totalBeds
        ? Math.round((occupiedAt(snapshot) / totalBeds) * 100)
        : 0,
      revenue: Math.round(collections(d, next)),
      labOrders: labs.length,
      labTat: Number(avg(tats).toFixed(1)),
      complaints: complaintsIn(d, next).length,
      resolved: db.complaints.filter(c => inRange(c.resolvedAt, d, next))
        .length,
      rating: Number(avg(feedbackIn(d, next).map(f => f.rating)).toFixed(2)),
      wait: Math.round(avg(waitsIn(d, next))),
    };
  });

  const deptVolume = new Map<string, number>();
  for (const e of opd.filter(e => inRange(e.startedAt, cur.from, cur.to))) {
    const name = departmentName(db, e.departmentId);
    deptVolume.set(name, (deptVolume.get(name) ?? 0) + 1);
  }
  const ipdVolume = new Map<string, number>();
  for (const a of db.admissions.filter(a =>
    inRange(a.admittedAt, cur.from, cur.to)
  )) {
    const name = departmentName(db, a.departmentId);
    ipdVolume.set(name, (ipdVolume.get(name) ?? 0) + 1);
  }

  const revenueByCategory = new Map<string, number>();
  const billedIds = new Set(
    db.invoices.filter(i => i.status !== "CANCELLED").map(i => i.id)
  );
  for (const item of db.invoiceItems) {
    if (
      !billedIds.has(item.invoiceId) ||
      !inRange(item.serviceDate, cur.from, cur.to)
    )
      continue;
    revenueByCategory.set(
      item.category,
      (revenueByCategory.get(item.category) ?? 0) + lineTotal(item)
    );
  }

  const labBySection = new Map<string, number>();
  for (const o of labOrders(cur.from, cur.to)) {
    for (const item of db.labOrderItems.filter(i => i.labOrderId === o.id)) {
      const test = db.labTests.find(t => t.id === item.testId);
      if (test)
        labBySection.set(
          test.section,
          (labBySection.get(test.section) ?? 0) + 1
        );
    }
  }

  const complaintCategories = new Map<string, number>();
  for (const c of cmpCur)
    complaintCategories.set(
      c.category,
      (complaintCategories.get(c.category) ?? 0) + 1
    );

  const methods = new Map<string, number>();
  for (const p of db.payments.filter(
    p => p.kind === "PAYMENT" && inRange(p.receivedAt, cur.from, cur.to)
  ))
    methods.set(p.method, (methods.get(p.method) ?? 0) + p.amount);

  return {
    days,
    comparable,
    historyStart: firstRecord,
    kpis,
    daily,
    deptVolume: [...deptVolume.entries()].sort((a, b) => b[1] - a[1]),
    ipdVolume: [...ipdVolume.entries()].sort((a, b) => b[1] - a[1]),
    revenueByCategory: [...revenueByCategory.entries()].sort(
      (a, b) => b[1] - a[1]
    ),
    labBySection: [...labBySection.entries()].sort((a, b) => b[1] - a[1]),
    complaintCategories: [...complaintCategories.entries()].sort(
      (a, b) => b[1] - a[1]
    ),
    paymentMethods: [...methods.entries()].sort((a, b) => b[1] - a[1]),
  };
}
export type Analytics = ReturnType<typeof buildAnalytics>;
export function analyticsView(
  db: Database,
  now: Date,
  { days }: { days: number }
) {
  return buildAnalytics(db, now, days);
}
