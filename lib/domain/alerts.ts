/** Staff-to-staff alert rules. */
import type { AlertPriority, ID, StaffAlert } from "../sim/schema";
import { assert, log, must, newId, nowIso, type Tx } from "../sim/tx";

export type AlertAudience = "ALL" | "DEPARTMENT" | "ROLE" | "STAFF";

export interface SendAlertInput {
  audience: AlertAudience;
  audienceId?: ID;
  category: string;
  subject: string;
  message: string;
  priority: AlertPriority;
}

const clean = (value: string) => value.trim().replace(/\s+/g, " ");

export function sendAlert(tx: Tx, input: SendAlertInput) {
  const category = clean(input.category);
  const subject = clean(input.subject);
  const message = input.message.trim();
  assert(
    category.length >= 2 && category.length <= 40,
    "Alert category must be 2–40 characters."
  );
  assert(
    subject.length >= 3 && subject.length <= 120,
    "Alert subject must be 3–120 characters."
  );
  assert(
    message.length >= 5 && message.length <= 2000,
    "Alert details must be 5–2,000 characters."
  );

  const activeStaffIds = new Set(
    tx.db.users
      .filter(user => user.status === "ACTIVE")
      .map(user => user.staffId)
  );
  const candidates = tx.db.staff.filter(
    staff => staff.status !== "INACTIVE" && activeStaffIds.has(staff.id)
  );
  const recipients = candidates.filter(staff => {
    if (input.audience === "ALL") return staff.id !== tx.actorId;
    assert(input.audienceId, "Choose who should receive this alert.");
    if (input.audience === "DEPARTMENT")
      return staff.departmentId === input.audienceId;
    if (input.audience === "ROLE") return staff.role === input.audienceId;
    return staff.id === input.audienceId;
  });
  const recipientIds = [...new Set(recipients.map(staff => staff.id))];
  assert(
    recipientIds.length > 0,
    "No active staff match the selected audience."
  );

  const alert: StaffAlert = {
    id: newId(tx, "alert"),
    senderId: tx.actorId,
    recipientIds,
    readByIds: [],
    category,
    subject,
    message,
    priority: input.priority,
    createdAt: nowIso(tx),
  };
  tx.db.alerts.push(alert);
  log(tx, {
    entityType: "alert",
    entityId: alert.id,
    action: "sent",
    summary: `${alert.priority} ${alert.category} alert sent to ${recipientIds.length} recipient${recipientIds.length === 1 ? "" : "s"}: ${alert.subject}`,
  });
  return alert;
}

export function markAlertRead(tx: Tx, alertId: ID) {
  const alert = must(tx.db.alerts, alertId, "Alert");
  assert(
    alert.recipientIds.includes(tx.actorId),
    "This alert was not sent to you."
  );
  if (!alert.readByIds.includes(tx.actorId)) alert.readByIds.push(tx.actorId);
  return alert;
}
