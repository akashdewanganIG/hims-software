/**
 * View builders for enquiry: pure functions of the database, the clock and
 * the request's parameters. Registered in lib/views/registry.ts; the browser
 * sandbox runs them locally, the server runs them for signed-in users.
 */
import type { Database } from "@/lib/sim/schema";
import { invoiceTotals } from "@/lib/domain/billing";
import {
  departmentName,
  getStaff,
  matches,
  patientRef,
  staffName,
  type PatientRef,
} from "@/lib/api/lookup";
import type { Enquiry, ID } from "@/lib/sim/schema";
import { isoDate } from "@/lib/sim/time";

export type EnquiryView =
  "open" | "due" | "scheduled" | "converted" | "closed" | "all";
export interface EnquiryRow {
  id: ID;
  code: string;
  type: Enquiry["type"];
  status: Enquiry["status"];
  name: string;
  phone: string;
  patient?: PatientRef;
  source: Enquiry["source"];
  reason: string;
  department: string;
  assignedTo: string;
  followUpDate?: string;
  followUpState?: "overdue" | "today" | "upcoming";
  createdAt: string;
  appointmentCode?: string;
}
export function enquiriesView(
  db: Database,
  now: Date,
  filters: {
    view: EnquiryView;
    q?: string;
    source?: string;
    type?: string;
  }
) {
  const today = isoDate(now);
  return db.enquiries
    .filter(e => {
      const live =
        e.status === "NEW" ||
        e.status === "FOLLOW_UP_REQUIRED" ||
        e.status === "APPOINTMENT_SCHEDULED";
      switch (filters.view) {
        case "open":
          if (!live) return false;
          break;
        case "due":
          if (!(live && e.followUpDate && e.followUpDate <= today))
            return false;
          break;
        case "scheduled":
          if (e.status !== "APPOINTMENT_SCHEDULED") return false;
          break;
        case "converted":
          if (e.status !== "CONVERTED") return false;
          break;
        case "closed":
          if (e.status !== "CLOSED" && e.status !== "CANCELLED") return false;
          break;
      }
      if (filters.source && e.source !== filters.source) return false;
      if (filters.type && e.type !== filters.type) return false;
      return (
        !filters.q ||
        matches(filters.q, e.code, e.prospectName, e.phone, e.reason)
      );
    })
    .map<EnquiryRow>(e => ({
      id: e.id,
      code: e.code,
      type: e.type,
      status: e.status,
      name: e.prospectName,
      phone: e.phone,
      patient: e.patientId ? patientRef(db, e.patientId, now) : undefined,
      source: e.source,
      reason: e.reason,
      department: departmentName(db, e.departmentId),
      assignedTo: staffName(getStaff(db, e.assignedToId)),
      followUpDate: e.followUpDate,
      followUpState: e.followUpDate
        ? e.followUpDate < today
          ? "overdue"
          : e.followUpDate === today
            ? "today"
            : "upcoming"
        : undefined,
      createdAt: e.createdAt,
      appointmentCode: db.appointments.find(a => a.id === e.appointmentId)
        ?.code,
    }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function enquirySummaryView(db: Database, now: Date) {
  const today = isoDate(now);
  const monthAgo = new Date(now.getTime() - 30 * 86_400_000).toISOString();
  const live = db.enquiries.filter(
    e =>
      e.status === "NEW" ||
      e.status === "FOLLOW_UP_REQUIRED" ||
      e.status === "APPOINTMENT_SCHEDULED"
  );
  const recent = db.enquiries.filter(e => e.createdAt >= monthAgo);
  const decided = recent.filter(
    e =>
      e.status === "CONVERTED" ||
      e.status === "CLOSED" ||
      e.status === "CANCELLED"
  );
  const converted = recent.filter(e => e.status === "CONVERTED").length;
  const bySource = new Map<string, number>();
  for (const e of recent)
    bySource.set(e.source, (bySource.get(e.source) ?? 0) + 1);
  return {
    open: live.length,
    dueToday: live.filter(e => e.followUpDate === today).length,
    overdue: live.filter(e => e.followUpDate && e.followUpDate < today).length,
    scheduled: live.filter(e => e.status === "APPOINTMENT_SCHEDULED").length,
    newToday: db.enquiries.filter(e => isoDate(e.createdAt) === today).length,
    converted30: converted,
    conversionRate: decided.length
      ? Math.round((converted / decided.length) * 100)
      : 0,
    bySource: [...bySource.entries()].sort((a, b) => b[1] - a[1]),
  };
}

export interface EnquiryDetail {
  enquiry: Enquiry;
  patient?: PatientRef;
  department: string;
  preferredDoctor?: string;
  assignedTo: string;
  referredBy?: string;
  followUps: Array<{
    id: ID;
    at: string;
    by: string;
    channel: string;
    note: string;
    nextFollowUpDate?: string;
  }>;
  appointments: Array<{
    id: ID;
    code: string;
    scheduledAt: string;
    status: string;
    doctor: string;
    encounterId?: ID;
  }>;
  bills: Array<{
    id: ID;
    code: string;
    status: string;
    total: number;
    balance: number;
  }>;
}
export function enquiryView(
  db: Database,
  now: Date,
  { id }: { id: ID | null }
): EnquiryDetail | null {
  const enquiry = db.enquiries.find(e => e.id === id);
  if (!enquiry) return null;
  const appointments = db.appointments
    .filter(a => a.enquiryId === enquiry.id)
    .sort((a, b) => b.scheduledAt.localeCompare(a.scheduledAt));
  const encounterIds = appointments.map(a => a.encounterId).filter(Boolean);
  return {
    enquiry,
    patient: enquiry.patientId
      ? patientRef(db, enquiry.patientId, now)
      : undefined,
    department: departmentName(db, enquiry.departmentId),
    preferredDoctor: enquiry.preferredDoctorId
      ? staffName(getStaff(db, enquiry.preferredDoctorId))
      : undefined,
    assignedTo: staffName(getStaff(db, enquiry.assignedToId)),
    referredBy: enquiry.referredById
      ? staffName(getStaff(db, enquiry.referredById))
      : undefined,
    followUps: db.enquiryFollowUps
      .filter(f => f.enquiryId === enquiry.id)
      .sort((a, b) => b.at.localeCompare(a.at))
      .map(f => ({
        id: f.id,
        at: f.at,
        by: staffName(getStaff(db, f.byId)),
        channel: f.channel,
        note: f.note,
        nextFollowUpDate: f.nextFollowUpDate,
      })),
    appointments: appointments.map(a => ({
      id: a.id,
      code: a.code,
      scheduledAt: a.scheduledAt,
      status: a.status,
      doctor: staffName(getStaff(db, a.doctorId)),
      encounterId: a.encounterId,
    })),
    bills: db.invoices
      .filter(i => i.encounterId && encounterIds.includes(i.encounterId))
      .map(i => {
        const t = invoiceTotals(db, i.id);
        return {
          id: i.id,
          code: i.code,
          status: i.status,
          total: t.total,
          balance: t.balance,
        };
      }),
  };
}
