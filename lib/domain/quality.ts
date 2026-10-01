import type {
  ComplainantType,
  Complaint,
  ComplaintCategory,
  Feedback,
  FeedbackCategory,
  FeedbackChannel,
  FollowUpStatus,
  ID,
  Priority,
} from "../sim/schema";
import { addDays, isoDate } from "../sim/time";
import {
  assert,
  find,
  log,
  must,
  newId,
  nextCode,
  nowIso,
  requireText,
  touch,
  type Tx,
} from "../sim/tx";
import { IMAGE_TYPES, filesOf, storeFile, type FileInput } from "./files";

/** Response window by priority, in days. */
export const COMPLAINT_SLA_DAYS: Record<Priority, number> = {
  CRITICAL: 1,
  HIGH: 2,
  MEDIUM: 5,
  LOW: 7,
};

export function isComplaintOverdue(complaint: Complaint, now: Date) {
  if (complaint.status === "RESOLVED" || complaint.status === "CLOSED")
    return false;
  return complaint.dueDate < isoDate(now);
}

function note(
  tx: Tx,
  complaint: Complaint,
  text: string,
  kind: "NOTE" | "STATUS"
) {
  tx.db.complaintNotes.push({
    id: newId(tx, "cmn"),
    complaintId: complaint.id,
    at: nowIso(tx),
    byId: tx.actorId,
    text,
    kind,
  });
}

export function logComplaint(
  tx: Tx,
  input: {
    patientId?: ID;
    complainantName: string;
    complainantType: ComplainantType;
    contact: string;
    encounterId?: ID;
    category: ComplaintCategory;
    departmentId: ID;
    title: string;
    description: string;
    priority: Priority;
    assignedToId?: ID;
  }
): Complaint {
  must(tx.db.departments, input.departmentId, "Department");
  const patient = input.patientId
    ? must(tx.db.patients, input.patientId, "Patient")
    : undefined;
  if (input.encounterId) {
    const encounter = must(tx.db.encounters, input.encounterId, "Visit");
    assert(
      !patient || encounter.patientId === patient.id,
      "That visit belongs to another patient."
    );
  }
  const complaint: Complaint = {
    id: newId(tx, "cmp"),
    code: nextCode(tx, "CMP", 4),
    patientId: patient?.id,
    complainantName:
      patient && input.complainantType === "PATIENT"
        ? `${patient.firstName} ${patient.lastName}`
        : requireText(input.complainantName, "Complainant name"),
    complainantType: input.complainantType,
    contact: input.contact.trim() || patient?.phone || "",
    encounterId: input.encounterId || undefined,
    category: input.category,
    departmentId: input.departmentId,
    title: requireText(input.title, "Title"),
    description: requireText(input.description, "Description"),
    priority: input.priority,
    assignedToId: undefined,
    dueDate: isoDate(addDays(tx.now, COMPLAINT_SLA_DAYS[input.priority])),
    status: "OPEN",
    loggedById: tx.actorId,
    createdAt: nowIso(tx),
    updatedAt: nowIso(tx),
  };
  tx.db.complaints.push(complaint);
  note(tx, complaint, "Complaint logged", "STATUS");
  log(tx, {
    entityType: "complaint",
    entityId: complaint.id,
    patientId: complaint.patientId,
    action: "logged",
    summary: `Complaint ${complaint.code} logged: ${complaint.title}`,
  });
  if (input.assignedToId) assignComplaint(tx, complaint.id, input.assignedToId);
  return complaint;
}

export function assignComplaint(tx: Tx, complaintId: ID, staffId: ID) {
  const complaint = must(tx.db.complaints, complaintId, "Complaint");
  assert(
    complaint.status !== "RESOLVED" && complaint.status !== "CLOSED",
    "Reopen the complaint before reassigning it."
  );
  const staff = must(tx.db.staff, staffId, "Staff member");
  complaint.assignedToId = staff.id;
  if (complaint.status === "OPEN") complaint.status = "ASSIGNED";
  touch(tx, complaint);
  note(
    tx,
    complaint,
    `Assigned to ${staff.firstName} ${staff.lastName}`,
    "STATUS"
  );
  return complaint;
}

export function startComplaint(tx: Tx, complaintId: ID) {
  const complaint = must(tx.db.complaints, complaintId, "Complaint");
  assert(
    complaint.status === "ASSIGNED",
    "Assign the complaint before starting work on it."
  );
  complaint.status = "IN_PROGRESS";
  touch(tx, complaint);
  note(tx, complaint, "Investigation started", "STATUS");
  return complaint;
}

export function addComplaintNote(tx: Tx, complaintId: ID, text: string) {
  const complaint = must(tx.db.complaints, complaintId, "Complaint");
  assert(complaint.status !== "CLOSED", "This complaint is closed.");
  note(tx, complaint, requireText(text, "Note"), "NOTE");
  touch(tx, complaint);
  return complaint;
}

export function resolveComplaint(tx: Tx, complaintId: ID, resolution: string) {
  const complaint = must(tx.db.complaints, complaintId, "Complaint");
  assert(
    complaint.status === "IN_PROGRESS" || complaint.status === "ASSIGNED",
    "Only complaints being worked on can be resolved."
  );
  complaint.status = "RESOLVED";
  complaint.resolution = requireText(resolution, "Resolution");
  complaint.resolvedAt = nowIso(tx);
  touch(tx, complaint);
  note(tx, complaint, `Resolved: ${complaint.resolution}`, "STATUS");
  log(tx, {
    entityType: "complaint",
    entityId: complaint.id,
    patientId: complaint.patientId,
    action: "resolved",
    summary: `Complaint ${complaint.code} resolved`,
  });
  return complaint;
}

export function closeComplaint(tx: Tx, complaintId: ID) {
  const complaint = must(tx.db.complaints, complaintId, "Complaint");
  assert(
    complaint.status === "RESOLVED",
    "Resolve the complaint before closing it."
  );
  complaint.status = "CLOSED";
  complaint.closedAt = nowIso(tx);
  touch(tx, complaint);
  note(tx, complaint, "Closed after confirmation with complainant", "STATUS");
  return complaint;
}

/**
 * Corrects a complaint's details. A change of priority moves the response
 * target to the new priority's window, counted from when it was logged.
 */
export function updateComplaint(
  tx: Tx,
  complaintId: ID,
  input: {
    complainantName: string;
    contact: string;
    category: ComplaintCategory;
    departmentId: ID;
    title: string;
    description: string;
    priority: Priority;
  }
) {
  const complaint = must(tx.db.complaints, complaintId, "Complaint");
  assert(
    complaint.status !== "CLOSED",
    "This complaint is closed. Reopen it to change its details."
  );
  must(tx.db.departments, input.departmentId, "Department");
  const next = {
    complainantName:
      complaint.patientId && complaint.complainantType === "PATIENT"
        ? complaint.complainantName
        : requireText(input.complainantName, "Complainant name"),
    contact: input.contact.trim() || complaint.contact,
    category: input.category,
    departmentId: input.departmentId,
    title: requireText(input.title, "Title"),
    description: requireText(input.description, "Description"),
    priority: input.priority,
  };
  const changed = (Object.keys(next) as Array<keyof typeof next>).filter(
    key => next[key] !== complaint[key]
  );
  assert(changed.length > 0, "Nothing was changed.");
  if (next.priority !== complaint.priority)
    complaint.dueDate = isoDate(
      addDays(new Date(complaint.createdAt), COMPLAINT_SLA_DAYS[next.priority])
    );
  Object.assign(complaint, next);
  touch(tx, complaint);
  const LABEL: Record<keyof typeof next, string> = {
    complainantName: "complainant",
    contact: "contact",
    category: "category",
    departmentId: "department",
    title: "title",
    description: "description",
    priority: "priority",
  };
  note(
    tx,
    complaint,
    `Details updated: ${changed.map(key => LABEL[key]).join(", ")}`,
    "STATUS"
  );
  return complaint;
}

/** Photos of the problem (a broken fitting, a wrong bill) kept with it. */
const MAX_COMPLAINT_PHOTOS = 6;

export function attachComplaintPhoto(
  tx: Tx,
  complaintId: ID,
  photo: FileInput
) {
  const complaint = must(tx.db.complaints, complaintId, "Complaint");
  assert(
    complaint.status !== "CLOSED",
    "This complaint is closed. Reopen it to add photos."
  );
  assert(
    filesOf(tx.db, "COMPLAINT", complaint.id).length < MAX_COMPLAINT_PHOTOS,
    `A complaint can hold up to ${MAX_COMPLAINT_PHOTOS} photos. Remove one first.`
  );
  const file = storeFile(
    tx,
    { type: "COMPLAINT", id: complaint.id },
    photo,
    IMAGE_TYPES
  );
  touch(tx, complaint);
  note(tx, complaint, `Photo attached: ${file.name}`, "NOTE");
  return { fileId: file.id };
}

export function removeComplaintPhoto(tx: Tx, fileId: ID) {
  const file = must(tx.db.files, fileId, "Photo");
  assert(file.ownerType === "COMPLAINT", "That file is not a complaint photo.");
  const complaint = must(tx.db.complaints, file.ownerId, "Complaint");
  assert(
    complaint.status !== "CLOSED",
    "This complaint is closed. Reopen it to remove photos."
  );
  tx.db.files = tx.db.files.filter(f => f.id !== file.id);
  touch(tx, complaint);
  note(tx, complaint, `Photo removed: ${file.name}`, "NOTE");
  return complaint;
}

export function reopenComplaint(tx: Tx, complaintId: ID, reason: string) {
  const complaint = must(tx.db.complaints, complaintId, "Complaint");
  assert(
    complaint.status === "RESOLVED" || complaint.status === "CLOSED",
    "Only resolved or closed complaints can be reopened."
  );
  complaint.status = complaint.assignedToId ? "IN_PROGRESS" : "OPEN";
  complaint.resolvedAt = undefined;
  complaint.closedAt = undefined;
  complaint.dueDate = isoDate(
    addDays(tx.now, COMPLAINT_SLA_DAYS[complaint.priority])
  );
  touch(tx, complaint);
  note(tx, complaint, `Reopened: ${requireText(reason, "Reason")}`, "STATUS");
  return complaint;
}

/* ------------------------------------------------------------------ */
/* Feedback                                                            */
/* ------------------------------------------------------------------ */

export function submitFeedback(
  tx: Tx,
  input: {
    patientId?: ID;
    anonymous: boolean;
    encounterId?: ID;
    departmentId: ID;
    doctorId?: ID;
    rating: number;
    categories: FeedbackCategory[];
    comments: string;
    channel: FeedbackChannel;
    followUpRequired?: boolean;
  }
): Feedback {
  assert(
    Number.isInteger(input.rating) && input.rating >= 1 && input.rating <= 5,
    "Rating must be between 1 and 5 stars."
  );
  must(tx.db.departments, input.departmentId, "Department");
  if (input.doctorId) must(tx.db.staff, input.doctorId, "Doctor");
  if (input.patientId && !input.anonymous)
    must(tx.db.patients, input.patientId, "Patient");
  const encounter = find(tx.db.encounters, input.encounterId);
  if (encounter && input.patientId) {
    assert(
      encounter.patientId === input.patientId,
      "That visit belongs to another patient."
    );
  }
  // Low scores always get a follow-up, whoever submitted them.
  const followUpRequired = Boolean(input.followUpRequired) || input.rating <= 2;
  const feedback: Feedback = {
    id: newId(tx, "fb"),
    code: nextCode(tx, "FB", 4),
    patientId: input.anonymous ? undefined : input.patientId || undefined,
    encounterId: input.anonymous ? undefined : encounter?.id,
    departmentId: input.departmentId,
    doctorId: input.doctorId || undefined,
    rating: input.rating,
    categories: [...new Set(input.categories)],
    comments: input.comments.trim(),
    channel: input.channel,
    submittedAt: nowIso(tx),
    followUpRequired,
    followUpStatus: followUpRequired ? "PENDING" : "NOT_REQUIRED",
    createdAt: nowIso(tx),
    updatedAt: nowIso(tx),
  };
  tx.db.feedback.push(feedback);
  log(tx, {
    entityType: "feedback",
    entityId: feedback.id,
    patientId: feedback.patientId,
    action: "submitted",
    summary: `${feedback.rating}★ feedback received${followUpRequired ? " — follow-up needed" : ""}`,
  });
  return feedback;
}

export function updateFeedbackFollowUp(
  tx: Tx,
  feedbackId: ID,
  input: { status: FollowUpStatus; note?: string }
) {
  const feedback = must(tx.db.feedback, feedbackId, "Feedback");
  assert(feedback.followUpRequired, "This feedback does not need a follow-up.");
  assert(input.status !== "NOT_REQUIRED", "Choose a follow-up status.");
  if (input.status === "COMPLETED")
    requireText(input.note, "Follow-up outcome");
  feedback.followUpStatus = input.status;
  feedback.followUpNote = input.note?.trim() || feedback.followUpNote;
  feedback.followUpById = tx.actorId;
  touch(tx, feedback);
  return feedback;
}
