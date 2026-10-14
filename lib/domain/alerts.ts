/** Staff-to-staff alert rules. */
import { resolveAccess, STAFF_ROLE_LABEL } from "../rbac";
import type {
  AlertAudience,
  AlertPriority,
  AlertState,
  Database,
  ID,
  StaffAlert,
  StaffRole,
} from "../sim/schema";
import { assert, log, must, newId, nowIso, type Tx } from "../sim/tx";

export interface SendAlertInput {
  audience: AlertAudience;
  audienceId?: ID;
  category: string;
  subject: string;
  message: string;
  priority: AlertPriority;
  acknowledgementRequired?: boolean;
  patientId?: ID;
  admissionId?: ID;
  dueAt?: string;
  escalationRecipientId?: ID;
}

const clean = (value: string) => value.trim().replace(/\s+/g, " ");

function activeUserForStaff(db: Database, staffId: ID) {
  return db.users.find(
    user => user.staffId === staffId && user.status === "ACTIVE"
  );
}

export function staffCanAccessIpd(db: Database, staffId: ID) {
  const user = activeUserForStaff(db, staffId);
  if (!user) return false;
  const role = db.roles.find(row => row.id === user.roleId);
  return resolveAccess(role, user).modules.has("ipd");
}

export function alertStateFor(alert: StaffAlert, staffId: ID): AlertState {
  return (
    (alert.participantStates ?? []).find(state => state.staffId === staffId)
      ?.status ?? "OPEN"
  );
}

function recipientNeedsResponse(alert: StaffAlert, staffId: ID) {
  if (alertStateFor(alert, staffId) === "RESOLVED") return false;
  return alert.acknowledgementRequired
    ? !(alert.acknowledgements ?? []).some(item => item.staffId === staffId)
    : !alert.readByIds.includes(staffId);
}

export function alertIsOverdue(alert: StaffAlert, now: Date) {
  return Boolean(
    alert.dueAt &&
    Date.parse(alert.dueAt) <= now.getTime() &&
    alert.recipientIds.some(staffId => recipientNeedsResponse(alert, staffId))
  );
}

/** Includes the escalation target only while the original response is overdue. */
export function alertRecipientIds(alert: StaffAlert, now: Date) {
  const ids = [...alert.recipientIds];
  if (
    alert.escalationRecipientId &&
    alertIsOverdue(alert, now) &&
    !ids.includes(alert.escalationRecipientId)
  )
    ids.push(alert.escalationRecipientId);
  return ids;
}

function audienceLabel(tx: Tx, input: SendAlertInput) {
  if (input.audience === "ALL") return "All active staff";
  assert(input.audienceId, "Choose who should receive this alert.");
  if (input.audience === "DEPARTMENT") {
    const department = must(tx.db.departments, input.audienceId, "Department");
    return `Department: ${department.name}`;
  }
  if (input.audience === "ROLE") {
    const label = STAFF_ROLE_LABEL[input.audienceId as StaffRole];
    assert(label, "The selected staff role was not found.");
    return `Staff role: ${label}`;
  }
  const staff = must(tx.db.staff, input.audienceId, "Staff member");
  return `Staff member: ${staff.firstName} ${staff.lastName}`;
}

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

  assert(
    Boolean(input.patientId) === Boolean(input.admissionId),
    "Patient-linked alerts must include both the patient and admission."
  );
  let patientId: ID | undefined;
  if (input.admissionId) {
    const admission = must(tx.db.admissions, input.admissionId, "Admission");
    assert(
      admission.patientId === input.patientId,
      "The selected admission does not belong to this patient."
    );
    patientId = admission.patientId;
  }

  let dueAt: string | undefined;
  if (input.dueAt) {
    const due = new Date(input.dueAt);
    assert(!Number.isNaN(due.getTime()), "Choose a valid alert deadline.");
    assert(
      due.getTime() > tx.now.getTime(),
      "The alert deadline must be later than now."
    );
    dueAt = due.toISOString();
  }
  assert(
    !input.escalationRecipientId || dueAt,
    "Choose a deadline before selecting an escalation recipient."
  );
  assert(
    !input.escalationRecipientId ||
      input.priority === "HIGH" ||
      input.priority === "CRITICAL",
    "Automatic escalation is available for high or critical alerts."
  );

  const activeStaffIds = new Set(
    tx.db.users
      .filter(user => user.status === "ACTIVE")
      .map(user => user.staffId)
  );
  const candidates = tx.db.staff.filter(
    staff =>
      staff.status !== "INACTIVE" &&
      activeStaffIds.has(staff.id) &&
      (!patientId || staffCanAccessIpd(tx.db, staff.id))
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
    patientId
      ? "No selected staff with IPD access can receive this patient alert."
      : "No active staff match the selected audience."
  );

  let escalationLabel: string | undefined;
  if (input.escalationRecipientId) {
    const escalation = must(
      tx.db.staff,
      input.escalationRecipientId,
      "Escalation recipient"
    );
    assert(
      escalation.status !== "INACTIVE" && activeStaffIds.has(escalation.id),
      "The escalation recipient does not have an active login."
    );
    assert(
      escalation.id !== tx.actorId,
      "Choose someone other than yourself for automatic escalation."
    );
    assert(
      !patientId || staffCanAccessIpd(tx.db, escalation.id),
      "The escalation recipient does not have access to this IPD record."
    );
    escalationLabel = `${escalation.firstName} ${escalation.lastName}`;
  }

  const alert: StaffAlert = {
    id: newId(tx, "alert"),
    senderId: tx.actorId,
    audience: input.audience,
    audienceId: input.audience === "ALL" ? undefined : input.audienceId,
    audienceLabel: audienceLabel(tx, input),
    recipientIds,
    readByIds: [],
    acknowledgementRequired: input.acknowledgementRequired ?? false,
    acknowledgements: [],
    patientId,
    admissionId: input.admissionId,
    dueAt,
    escalationRecipientId: input.escalationRecipientId,
    escalationLabel,
    participantStates: [],
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
    patientId,
    summary: `${alert.priority} ${alert.category} alert sent to ${recipientIds.length} recipient${recipientIds.length === 1 ? "" : "s"}: ${alert.subject}`,
  });
  return alert;
}

export function markAlertRead(tx: Tx, alertId: ID) {
  const alert = must(tx.db.alerts, alertId, "Alert");
  assert(
    alertRecipientIds(alert, tx.now).includes(tx.actorId),
    "This alert was not sent to you."
  );
  assert(
    !alert.admissionId || staffCanAccessIpd(tx.db, tx.actorId),
    "You no longer have access to this IPD record."
  );
  if (!alert.readByIds.includes(tx.actorId)) alert.readByIds.push(tx.actorId);
  return alert;
}

export function acknowledgeAlert(tx: Tx, alertId: ID) {
  const alert = must(tx.db.alerts, alertId, "Alert");
  assert(
    alertRecipientIds(alert, tx.now).includes(tx.actorId),
    "This alert was not sent to you."
  );
  assert(
    !alert.admissionId || staffCanAccessIpd(tx.db, tx.actorId),
    "You no longer have access to this IPD record."
  );
  assert(
    alert.acknowledgementRequired,
    "This alert does not require acknowledgement."
  );
  alert.acknowledgements ??= [];
  if (alert.acknowledgements.some(item => item.staffId === tx.actorId))
    return alert;
  if (!alert.readByIds.includes(tx.actorId)) alert.readByIds.push(tx.actorId);
  alert.acknowledgements.push({
    staffId: tx.actorId,
    acknowledgedAt: nowIso(tx),
  });
  log(tx, {
    entityType: "alert",
    entityId: alert.id,
    action: "acknowledged",
    summary: `Acknowledged alert: ${alert.subject}`,
  });
  return alert;
}

export function setAlertState(tx: Tx, alertId: ID, status: AlertState) {
  const alert = must(tx.db.alerts, alertId, "Alert");
  const participantIds = [alert.senderId, ...alertRecipientIds(alert, tx.now)];
  assert(
    participantIds.includes(tx.actorId),
    "This alert does not belong to your mailbox."
  );
  assert(
    !alert.admissionId || staffCanAccessIpd(tx.db, tx.actorId),
    "You no longer have access to this IPD record."
  );
  alert.participantStates ??= [];
  const current = alert.participantStates.find(
    state => state.staffId === tx.actorId
  );
  if (current?.status === status) return alert;
  if (current) {
    current.status = status;
    current.changedAt = nowIso(tx);
  } else {
    alert.participantStates.push({
      staffId: tx.actorId,
      status,
      changedAt: nowIso(tx),
    });
  }
  log(tx, {
    entityType: "alert",
    entityId: alert.id,
    patientId: alert.patientId,
    action: status.toLowerCase(),
    summary: `${status === "OPEN" ? "Reopened" : status === "RESOLVED" ? "Resolved" : "Archived"} alert: ${alert.subject}`,
  });
  return alert;
}
