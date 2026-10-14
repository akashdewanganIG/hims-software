import { matches, staffName } from "@/lib/api/lookup";
import type { Actor } from "@/lib/ops/execute";
import { STAFF_ROLE_LABEL } from "@/lib/rbac";
import type { AlertPriority, Database, StaffRole } from "@/lib/sim/schema";

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
  },
  actor: Actor
) {
  return db.alerts
    .filter(alert =>
      filters.box === "inbox"
        ? alert.recipientIds.includes(actor.staff.id)
        : alert.senderId === actor.staff.id
    )
    .map(alert => {
      const sender = db.staff.find(staff => staff.id === alert.senderId);
      const recipientNames = alert.recipientIds
        .map(id => db.staff.find(staff => staff.id === id))
        .filter(staff => staff !== undefined)
        .map(staffName);
      return {
        ...alert,
        sender: sender ? staffName(sender) : "Former staff member",
        recipientNames,
        recipientCount: alert.recipientIds.length,
        readCount: alert.readByIds.length,
        isRead: alert.readByIds.includes(actor.staff.id),
      };
    })
    .filter(alert => {
      if (filters.category && alert.category !== filters.category) return false;
      if (filters.priority && alert.priority !== filters.priority) return false;
      if (filters.unreadOnly && alert.isRead) return false;
      if (
        filters.q &&
        !matches(
          filters.q,
          alert.subject,
          alert.message,
          alert.category,
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
  const inbox = db.alerts.filter(alert =>
    alert.recipientIds.includes(actor.staff.id)
  );
  return {
    inbox: inbox.length,
    unread: inbox.filter(alert => !alert.readByIds.includes(actor.staff.id))
      .length,
    critical: inbox.filter(alert => alert.priority === "CRITICAL").length,
    sent: db.alerts.filter(alert => alert.senderId === actor.staff.id).length,
  };
}

export function alertComposerView(db: Database, actor: Actor) {
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
