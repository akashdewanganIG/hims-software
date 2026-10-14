import { matches, staffName } from "@/lib/api/lookup";
import {
  alertIsOverdue,
  alertRecipientIds,
  alertStateFor,
  staffCanAccessIpd,
} from "@/lib/domain/alerts";
import { isOnDuty } from "@/lib/domain/wfm";
import type { Actor } from "@/lib/ops/execute";
import { STAFF_ROLE_LABEL } from "@/lib/rbac";
import type {
  AlertPriority,
  AlertState,
  Database,
  StaffRole,
} from "@/lib/sim/schema";

export const ALERT_CATEGORY_SUGGESTIONS = [
  "Clinical",
  "Bed Management",
  "Laboratory",
  "Pharmacy",
  "Billing",
  "Operations",
  "Facilities",
  "IT & Systems",
  "General",
] as const;

export type AlertBox = "inbox" | "sent";

export function alertsView(
  db: Database,
  _now: Date,
  filters: {
    box: AlertBox;
    q?: string;
    category?: string;
    priority?: string;
    unreadOnly?: boolean;
    status?: AlertState;
  },
  actor: Actor
) {
  return db.alerts
    .filter(alert => {
      if (alert.admissionId && !staffCanAccessIpd(db, actor.staff.id))
        return false;
      const inInbox = alertRecipientIds(alert, _now).includes(actor.staff.id);
      return filters.box === "inbox"
        ? inInbox
        : alert.senderId === actor.staff.id;
    })
    .map(alert => {
      const sender = db.staff.find(staff => staff.id === alert.senderId);
      const acknowledgements = alert.acknowledgements ?? [];
      const effectiveRecipientIds = alertRecipientIds(alert, _now);
      const recipientNames = effectiveRecipientIds
        .map(id => db.staff.find(staff => staff.id === id))
        .filter(staff => staff !== undefined)
        .map(staffName);
      const admission = alert.admissionId
        ? db.admissions.find(row => row.id === alert.admissionId)
        : undefined;
      const patient = admission
        ? db.patients.find(row => row.id === admission.patientId)
        : undefined;
      const overdue = alertIsOverdue(alert, _now);
      return {
        ...alert,
        audienceLabel:
          alert.audienceLabel ||
          `${alert.recipientIds.length} previously selected recipient${alert.recipientIds.length === 1 ? "" : "s"}`,
        acknowledgementRequired: alert.acknowledgementRequired ?? false,
        acknowledgements,
        sender: sender ? staffName(sender) : "Former staff member",
        recipientNames,
        recipientCount: effectiveRecipientIds.length,
        readCount: alert.readByIds.length,
        acknowledgedCount: acknowledgements.length,
        isRead: alert.readByIds.includes(actor.staff.id),
        isAcknowledged: acknowledgements.some(
          acknowledgement => acknowledgement.staffId === actor.staff.id
        ),
        acknowledgedAt: acknowledgements.find(
          acknowledgement => acknowledgement.staffId === actor.staff.id
        )?.acknowledgedAt,
        status: alertStateFor(alert, actor.staff.id),
        isOverdue: overdue,
        isEscalated: overdue && Boolean(alert.escalationRecipientId),
        isEscalatedToMe:
          overdue && alert.escalationRecipientId === actor.staff.id,
        linkedAdmission:
          admission && patient
            ? {
                id: admission.id,
                code: admission.code,
                patientName: `${patient.firstName} ${patient.lastName}`,
              }
            : undefined,
      };
    })
    .filter(alert => {
      if (filters.category && alert.category !== filters.category) return false;
      if (filters.priority && alert.priority !== filters.priority) return false;
      if (filters.unreadOnly && alert.isRead) return false;
      if (filters.status && alert.status !== filters.status) return false;
      if (
        filters.q &&
        !matches(
          filters.q,
          alert.subject,
          alert.message,
          alert.category,
          alert.audienceLabel,
          alert.sender,
          ...alert.recipientNames
        )
      )
        return false;
      return true;
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function alertSummaryView(db: Database, _now: Date, actor: Actor) {
  const inbox = db.alerts.filter(
    alert =>
      (!alert.admissionId || staffCanAccessIpd(db, actor.staff.id)) &&
      alertRecipientIds(alert, _now).includes(actor.staff.id)
  );
  const open = inbox.filter(
    alert => alertStateFor(alert, actor.staff.id) === "OPEN"
  );
  const sent = db.alerts.filter(alert => alert.senderId === actor.staff.id);
  return {
    inbox: inbox.length,
    open: open.length,
    resolved: inbox.filter(
      alert => alertStateFor(alert, actor.staff.id) === "RESOLVED"
    ).length,
    archived: inbox.filter(
      alert => alertStateFor(alert, actor.staff.id) === "ARCHIVED"
    ).length,
    unread: open.filter(alert => !alert.readByIds.includes(actor.staff.id))
      .length,
    unreadCritical: open.filter(
      alert =>
        alert.priority === "CRITICAL" &&
        !alert.readByIds.includes(actor.staff.id)
    ).length,
    awaitingAcknowledgement: open.filter(
      alert =>
        (alert.acknowledgementRequired ?? false) &&
        !(alert.acknowledgements ?? []).some(
          acknowledgement => acknowledgement.staffId === actor.staff.id
        )
    ).length,
    critical: open.filter(alert => alert.priority === "CRITICAL").length,
    escalated: open.filter(
      alert =>
        alert.escalationRecipientId === actor.staff.id &&
        alertIsOverdue(alert, _now)
    ).length,
    overdueSent: sent.filter(alert => alertIsOverdue(alert, _now)).length,
    sent: sent.length,
  };
}

export function alertComposerView(db: Database, now: Date, actor: Actor) {
  const activeUserStaffIds = new Set(
    db.users.filter(user => user.status === "ACTIVE").map(user => user.staffId)
  );
  const staff = db.staff
    .filter(row => row.status !== "INACTIVE" && activeUserStaffIds.has(row.id))
    .map(row => ({
      id: row.id,
      label: staffName(row),
      roleId: row.role,
      role: STAFF_ROLE_LABEL[row.role],
      departmentId: row.departmentId,
      ipdAccess: staffCanAccessIpd(db, row.id),
      onDuty: isOnDuty(db, row, now),
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
  const roles = [
    ...new Set(
      db.staff
        .filter(
          row => row.status !== "INACTIVE" && activeUserStaffIds.has(row.id)
        )
        .map(row => row.role)
    ),
  ]
    .map(role => ({ id: role, label: STAFF_ROLE_LABEL[role as StaffRole] }))
    .sort((a, b) => a.label.localeCompare(b.label));
  const categories = [
    ...new Set([
      ...ALERT_CATEGORY_SUGGESTIONS,
      ...db.alerts
        .filter(
          alert =>
            alert.senderId === actor.staff.id ||
            alert.recipientIds.includes(actor.staff.id)
        )
        .map(alert => alert.category),
    ]),
  ].sort((a, b) => a.localeCompare(b));
  return {
    categories,
    departments: db.departments
      .map(department => ({ id: department.id, label: department.name }))
      .sort((a, b) => a.label.localeCompare(b.label)),
    roles,
    staff,
  };
}

export type AlertRow = ReturnType<typeof alertsView>[number];
export type AlertPriorityFilter = AlertPriority | "";
