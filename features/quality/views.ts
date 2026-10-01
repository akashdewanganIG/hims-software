/**
 * View builders for quality: pure functions of the database, the clock and
 * the request's parameters. Registered in lib/views/registry.ts; the browser
 * sandbox runs them locally, the server runs them for signed-in users.
 */
import type { Database } from "@/lib/sim/schema";
import { filesOf, summariseFile } from "@/lib/domain/files";
import { COMPLAINT_SLA_DAYS, isComplaintOverdue } from "@/lib/domain/quality";
import {
  departmentName,
  getStaff,
  matches,
  patientRef,
  staffName,
  type PatientRef,
} from "@/lib/api/lookup";
import type { Complaint, Feedback, ID } from "@/lib/sim/schema";
import { hoursBetween } from "@/lib/sim/time";

export interface ComplaintRow {
  id: ID;
  code: string;
  title: string;
  category: Complaint["category"];
  priority: Complaint["priority"];
  status: Complaint["status"];
  department: string;
  departmentId: ID;
  complainant: string;
  complainantType: Complaint["complainantType"];
  patient?: PatientRef;
  assignedTo?: string;
  createdAt: string;
  dueDate: string;
  overdue: boolean;
  resolvedAt?: string;
}
export function complaintsView(
  db: Database,
  now: Date,
  filters: {
    view: "open" | "overdue" | "resolved" | "all";
    q?: string;
    departmentId?: string;
    priority?: string;
  }
) {
  return db.complaints
    .filter(c => {
      const open = c.status !== "RESOLVED" && c.status !== "CLOSED";
      if (filters.view === "open" && !open) return false;
      if (filters.view === "overdue" && !isComplaintOverdue(c, now))
        return false;
      if (filters.view === "resolved" && open) return false;
      if (filters.departmentId && c.departmentId !== filters.departmentId)
        return false;
      if (filters.priority && c.priority !== filters.priority) return false;
      return (
        !filters.q ||
        matches(filters.q, c.code, c.title, c.complainantName, c.description)
      );
    })
    .map<ComplaintRow>(c => ({
      id: c.id,
      code: c.code,
      title: c.title,
      category: c.category,
      priority: c.priority,
      status: c.status,
      department: departmentName(db, c.departmentId),
      departmentId: c.departmentId,
      complainant: c.complainantName,
      complainantType: c.complainantType,
      patient: c.patientId ? patientRef(db, c.patientId, now) : undefined,
      assignedTo: c.assignedToId
        ? staffName(getStaff(db, c.assignedToId))
        : undefined,
      createdAt: c.createdAt,
      dueDate: c.dueDate,
      overdue: isComplaintOverdue(c, now),
      resolvedAt: c.resolvedAt,
    }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function complaintSummaryView(db: Database, now: Date) {
  const open = db.complaints.filter(
    c => c.status !== "RESOLVED" && c.status !== "CLOSED"
  );
  const resolved = db.complaints.filter(c => c.resolvedAt);
  const withinSla = resolved.filter(
    c =>
      hoursBetween(c.createdAt, c.resolvedAt!) <=
      COMPLAINT_SLA_DAYS[c.priority] * 24
  );
  const avgHours = resolved.length
    ? resolved.reduce(
        (s, c) => s + hoursBetween(c.createdAt, c.resolvedAt!),
        0
      ) / resolved.length
    : 0;
  const byCategory = new Map<string, number>();
  for (const c of db.complaints)
    byCategory.set(c.category, (byCategory.get(c.category) ?? 0) + 1);
  return {
    open: open.length,
    overdue: open.filter(c => isComplaintOverdue(c, now)).length,
    highOpen: open.filter(
      c => c.priority === "HIGH" || c.priority === "CRITICAL"
    ).length,
    unassigned: open.filter(c => !c.assignedToId).length,
    slaRate: resolved.length
      ? Math.round((withinSla.length / resolved.length) * 100)
      : 100,
    avgHours,
    total: db.complaints.length,
    byCategory: [...byCategory.entries()].sort((a, b) => b[1] - a[1]),
  };
}

export function complaintView(
  db: Database,
  now: Date,
  { id }: { id: ID | null }
) {
  const c = db.complaints.find(x => x.id === id);
  if (!c) return null;
  const encounter = c.encounterId
    ? db.encounters.find(e => e.id === c.encounterId)
    : undefined;
  return {
    complaint: c,
    department: departmentName(db, c.departmentId),
    patient: c.patientId ? patientRef(db, c.patientId, now) : undefined,
    assignedTo: c.assignedToId
      ? staffName(getStaff(db, c.assignedToId))
      : undefined,
    loggedBy: staffName(getStaff(db, c.loggedById)),
    overdue: isComplaintOverdue(c, now),
    encounter: encounter
      ? {
          id: encounter.id,
          code: encounter.code,
          type: encounter.type,
          admissionId: encounter.admissionId,
        }
      : undefined,
    notes: db.complaintNotes
      .filter(n => n.complaintId === c.id)
      .sort((a, b) => b.at.localeCompare(a.at))
      .map(n => ({ ...n, by: staffName(getStaff(db, n.byId)) })),
    photos: filesOf(db, "COMPLAINT", c.id).map(f => summariseFile(f)),
  };
}

export type ComplaintDetail = NonNullable<ReturnType<typeof complaintView>>;

export interface FeedbackRow {
  id: ID;
  code: string;
  rating: number;
  categories: Feedback["categories"];
  comments: string;
  department: string;
  doctor?: string;
  patient?: PatientRef;
  anonymous: boolean;
  channel: Feedback["channel"];
  submittedAt: string;
  followUpRequired: boolean;
  followUpStatus: Feedback["followUpStatus"];
  followUpNote?: string;
  encounterCode?: string;
}
export function feedbackView(
  db: Database,
  now: Date,
  filters: {
    view: "all" | "followup" | "low" | "high";
    q?: string;
    departmentId?: string;
    days: number;
  }
) {
  const since = new Date(
    now.getTime() - filters.days * 86_400_000
  ).toISOString();
  return db.feedback
    .filter(f => {
      if (f.submittedAt < since) return false;
      if (
        filters.view === "followup" &&
        !(f.followUpRequired && f.followUpStatus !== "COMPLETED")
      )
        return false;
      if (filters.view === "low" && f.rating > 2) return false;
      if (filters.view === "high" && f.rating < 4) return false;
      if (filters.departmentId && f.departmentId !== filters.departmentId)
        return false;
      return !filters.q || matches(filters.q, f.code, f.comments);
    })
    .map<FeedbackRow>(f => ({
      id: f.id,
      code: f.code,
      rating: f.rating,
      categories: f.categories,
      comments: f.comments,
      department: departmentName(db, f.departmentId),
      doctor: f.doctorId ? staffName(getStaff(db, f.doctorId)) : undefined,
      patient: f.patientId ? patientRef(db, f.patientId, now) : undefined,
      anonymous: !f.patientId,
      channel: f.channel,
      submittedAt: f.submittedAt,
      followUpRequired: f.followUpRequired,
      followUpStatus: f.followUpStatus,
      followUpNote: f.followUpNote,
      encounterCode: f.encounterId
        ? db.encounters.find(e => e.id === f.encounterId)?.code
        : undefined,
    }))
    .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
}

export function feedbackSummaryView(
  db: Database,
  now: Date,
  { days }: { days: number }
) {
  const since = new Date(now.getTime() - days * 86_400_000).toISOString();
  const rows = db.feedback.filter(f => f.submittedAt >= since);
  const distribution = [5, 4, 3, 2, 1].map(r => ({
    rating: r,
    count: rows.filter(f => f.rating === r).length,
  }));
  const categories = new Map<string, { count: number; sum: number }>();
  for (const f of rows)
    for (const c of f.categories) {
      const cur = categories.get(c) ?? { count: 0, sum: 0 };
      categories.set(c, { count: cur.count + 1, sum: cur.sum + f.rating });
    }
  const departments = new Map<string, { count: number; sum: number }>();
  for (const f of rows) {
    const name = departmentName(db, f.departmentId);
    const cur = departments.get(name) ?? { count: 0, sum: 0 };
    departments.set(name, { count: cur.count + 1, sum: cur.sum + f.rating });
  }
  const promoters = rows.filter(f => f.rating === 5).length;
  const detractors = rows.filter(f => f.rating <= 3).length;
  return {
    total: rows.length,
    average: rows.length
      ? rows.reduce((s, f) => s + f.rating, 0) / rows.length
      : 0,
    distribution,
    satisfaction: rows.length
      ? Math.round((rows.filter(f => f.rating >= 4).length / rows.length) * 100)
      : 0,
    nps: rows.length
      ? Math.round(((promoters - detractors) / rows.length) * 100)
      : 0,
    pendingFollowUps: db.feedback.filter(
      f => f.followUpRequired && f.followUpStatus !== "COMPLETED"
    ).length,
    categories: [...categories.entries()]
      .map(([k, v]) => ({
        category: k,
        count: v.count,
        average: v.sum / v.count,
      }))
      .sort((a, b) => b.count - a.count),
    departments: [...departments.entries()]
      .map(([k, v]) => ({
        department: k,
        count: v.count,
        average: v.sum / v.count,
      }))
      .sort((a, b) => b.count - a.count),
  };
}

/** A patient's recent visits, to link feedback to the visit it is about. */
export function patientEncountersView(
  db: Database,
  _now: Date,
  { patientId }: { patientId: ID }
) {
  return db.encounters
    .filter(e => e.patientId === patientId)
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
    .slice(0, 8)
    .map(e => ({
      id: e.id,
      code: e.code,
      type: e.type,
      startedAt: e.startedAt,
      departmentId: e.departmentId,
      doctorId: e.doctorId,
    }));
}
