import {
  SYSTEM_ROLES,
  type Database,
  type ID,
  type ISODate,
  type RosterAssignment,
  type RosterStatus,
  type Staff,
  type StaffRole,
  type StaffStatus,
} from "../sim/schema";
import { addDaysIso, isoDate, withinShift } from "../sim/time";
import { activeAdministrators, uniqueUsername } from "./admin";
import { IMAGE_TYPES, removeFilesOf, storeFile, type FileInput } from "./files";
import {
  DomainError,
  assert,
  find,
  log,
  must,
  newId,
  nowIso,
  requireText,
  touch,
  type Tx,
} from "../sim/tx";

export function rosterFor(db: Database, staffId: ID, date: ISODate) {
  return db.roster.find(r => r.staffId === staffId && r.date === date);
}

/**
 * On duty right now: rostered on a shift whose window covers `at`. Night
 * shifts start on the previous calendar day, so both days are checked.
 */
export function isOnDuty(db: Database, staff: Staff, at: Date) {
  if (staff.status !== "ACTIVE") return false;
  const today = isoDate(at);
  for (const date of [today, addDaysIso(today, -1)]) {
    const row = rosterFor(db, staff.id, date);
    if (row?.status !== "SCHEDULED" || !row.shiftId) continue;
    const shift = find(db.shifts, row.shiftId);
    if (shift && withinShift(at, date, shift.start, shift.end)) return true;
  }
  return false;
}

export type Availability =
  "AVAILABLE" | "OFF" | "LEAVE" | "INACTIVE" | "UNROSTERED";

export function doctorAvailability(
  db: Database,
  doctor: Staff,
  date: ISODate
): Availability {
  if (doctor.status === "INACTIVE") return "INACTIVE";
  if (doctor.status === "ON_LEAVE") return "LEAVE";
  const row = rosterFor(db, doctor.id, date);
  if (!row) return "UNROSTERED";
  if (row.status === "LEAVE") return "LEAVE";
  if (row.status === "OFF") return "OFF";
  return "AVAILABLE";
}

export function assertDoctorBookable(
  db: Database,
  doctor: Staff,
  date: ISODate
) {
  const availability = doctorAvailability(db, doctor, date);
  const name = `Dr ${doctor.firstName} ${doctor.lastName}`;
  if (availability === "LEAVE")
    throw new DomainError(`${name} is on leave on that day.`);
  if (availability === "OFF")
    throw new DomainError(
      `${name} is not rostered on that day. Check the WFM roster.`
    );
  if (availability === "INACTIVE")
    throw new DomainError(`${name} is no longer active.`);
}

export function setRoster(
  tx: Tx,
  input: {
    staffId: ID;
    date: ISODate;
    status: RosterStatus;
    shiftId?: ID;
    note?: string;
  }
): RosterAssignment {
  const staff = must(tx.db.staff, input.staffId, "Staff member");
  assert(
    staff.status !== "INACTIVE",
    `${staff.firstName} ${staff.lastName} is inactive.`
  );
  if (input.status === "SCHEDULED") {
    must(tx.db.shifts, input.shiftId, "Shift");
  }
  let row = rosterFor(tx.db, staff.id, input.date);
  if (!row) {
    row = {
      id: newId(tx, "ros"),
      staffId: staff.id,
      date: input.date,
      status: input.status,
      departmentId: staff.departmentId,
    };
    tx.db.roster.push(row);
  }
  row.status = input.status;
  row.shiftId = input.status === "SCHEDULED" ? input.shiftId : undefined;
  row.note = input.note?.trim() || undefined;
  row.departmentId = staff.departmentId;
  return row;
}

/** Copies one week's roster pattern (Mon–Sun) onto the following week. */
export function copyWeek(
  tx: Tx,
  input: { fromWeekStart: ISODate; departmentId?: ID }
) {
  let copied = 0;
  for (let offset = 0; offset < 7; offset += 1) {
    const from = addDaysIso(input.fromWeekStart, offset);
    const to = addDaysIso(from, 7);
    for (const row of tx.db.roster.filter(r => r.date === from)) {
      if (input.departmentId && row.departmentId !== input.departmentId)
        continue;
      const staff = find(tx.db.staff, row.staffId);
      if (!staff || staff.status === "INACTIVE") continue;
      setRoster(tx, {
        staffId: row.staffId,
        date: to,
        status: row.status === "LEAVE" ? "OFF" : row.status,
        shiftId: row.shiftId,
      });
      copied += 1;
    }
  }
  log(tx, {
    entityType: "roster",
    entityId: input.fromWeekStart,
    action: "copied",
    summary: `Roster copied to week of ${addDaysIso(input.fromWeekStart, 7)} (${copied} assignments)`,
  });
  return copied;
}

export interface StaffInput {
  firstName: string;
  lastName: string;
  role: StaffRole;
  departmentId: ID;
  designation: string;
  specialisation?: string;
  qualification?: string;
  phone: string;
  email: string;
  consultationFee?: number;
}

/** The job and contact details of a staff record, validated and tidied. */
function staffDetails(
  tx: Tx,
  input: Omit<StaffInput, "role" | "consultationFee">,
  selfId?: ID
) {
  must(tx.db.departments, input.departmentId, "Department");
  const phone = input.phone.replace(/\D/g, "").slice(-10);
  assert(phone.length === 10, "Phone must be a 10-digit number.");
  const email = requireText(input.email, "Email").toLowerCase();
  assert(
    /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email),
    "Enter a valid email address."
  );
  assert(
    !tx.db.staff.some(s => s.email === email && s.id !== selfId),
    "Another staff member already uses that email."
  );
  return {
    firstName: requireText(input.firstName, "First name"),
    lastName: requireText(input.lastName, "Last name"),
    departmentId: input.departmentId,
    designation: requireText(input.designation, "Designation"),
    specialisation: input.specialisation?.trim() || undefined,
    qualification: input.qualification?.trim() || undefined,
    phone,
    email,
  };
}

export function createStaff(tx: Tx, input: StaffInput): Staff {
  const details = staffDetails(tx, input);
  const seq = (tx.db.meta.counters["staff"] ?? 0) + 1;
  tx.db.meta.counters["staff"] = seq;
  const staff: Staff = {
    id: newId(tx, "stf"),
    staffCode: `EMP-${String(seq).padStart(4, "0")}`,
    ...details,
    role: input.role,
    status: "ACTIVE",
    joinedOn: isoDate(tx.now),
    consultationFee:
      input.role === "DOCTOR"
        ? Math.max(0, input.consultationFee ?? 500)
        : undefined,
    createdAt: nowIso(tx),
    updatedAt: nowIso(tx),
  };
  tx.db.staff.push(staff);
  // Every clinical and office job gets a login on its default role (when
  // the Administrator has not deleted it); support staff do not.
  const role = (SYSTEM_ROLES as readonly StaffRole[]).includes(staff.role)
    ? tx.db.roles.find(r => r.id === staff.role)
    : undefined;
  if (role) {
    tx.db.users.push({
      id: newId(tx, "usr"),
      staffId: staff.id,
      roleId: role.id,
      username: uniqueUsername(tx.db, details.email.split("@")[0]!),
      status: "ACTIVE",
      customAccess: false,
      modules: [],
      actions: [],
      createdAt: nowIso(tx),
      updatedAt: nowIso(tx),
    });
  }
  log(tx, {
    entityType: "staff",
    entityId: staff.id,
    action: "created",
    summary: `${staff.firstName} ${staff.lastName} added as ${staff.designation}`,
  });
  return staff;
}

/**
 * Edits a staff record's job and contact details. The job role stays: it
 * decides the default login and, for doctors, OPD scheduling — a different
 * job is a new staff record.
 */
export function updateStaff(
  tx: Tx,
  staffId: ID,
  input: Omit<StaffInput, "role">
): Staff {
  const staff = must(tx.db.staff, staffId, "Staff member");
  const details = staffDetails(tx, input, staff.id);
  if (staff.role === "DOCTOR" && details.departmentId !== staff.departmentId) {
    const upcoming = tx.db.appointments.some(
      a =>
        a.doctorId === staff.id &&
        (a.status === "SCHEDULED" || a.status === "CHECKED_IN") &&
        a.scheduledAt >= nowIso(tx)
    );
    assert(
      !upcoming,
      "Reassign or cancel this doctor's upcoming appointments before moving them to another department."
    );
  }
  Object.assign(staff, details);
  staff.consultationFee =
    staff.role === "DOCTOR"
      ? Math.max(0, input.consultationFee ?? staff.consultationFee ?? 500)
      : undefined;
  touch(tx, staff);
  log(tx, {
    entityType: "staff",
    entityId: staff.id,
    action: "updated",
    summary: `Details updated for ${staff.firstName} ${staff.lastName}`,
  });
  return staff;
}

export function setStaffPhoto(tx: Tx, staffId: ID, photo: FileInput) {
  const staff = must(tx.db.staff, staffId, "Staff member");
  removeFilesOf(tx, "STAFF_PHOTO", staff.id);
  const file = storeFile(
    tx,
    { type: "STAFF_PHOTO", id: staff.id },
    photo,
    IMAGE_TYPES
  );
  touch(tx, staff);
  log(tx, {
    entityType: "staff",
    entityId: staff.id,
    action: "photo",
    summary: `Photo updated for ${staff.firstName} ${staff.lastName}`,
  });
  return { fileId: file.id };
}

export function removeStaffPhoto(tx: Tx, staffId: ID) {
  const staff = must(tx.db.staff, staffId, "Staff member");
  assert(
    removeFilesOf(tx, "STAFF_PHOTO", staff.id) > 0,
    `${staff.firstName} ${staff.lastName} has no photo on file.`
  );
  touch(tx, staff);
  log(tx, {
    entityType: "staff",
    entityId: staff.id,
    action: "photo",
    summary: `Photo removed for ${staff.firstName} ${staff.lastName}`,
  });
  return staff;
}

export function setStaffStatus(tx: Tx, staffId: ID, status: StaffStatus) {
  const staff = must(tx.db.staff, staffId, "Staff member");
  assert(
    !(status === "INACTIVE" && staff.id === tx.actorId),
    "You cannot deactivate your own account."
  );
  assert(
    status !== "INACTIVE" ||
      !activeAdministrators(tx.db).some(u => u.staffId === staff.id) ||
      activeAdministrators(tx.db, { staffId: staff.id }).length > 0,
    `${staff.firstName} ${staff.lastName} holds the only active Administrator login. Give another login the Administrator role first.`
  );
  assert(
    staff.status !== status,
    `${staff.firstName} ${staff.lastName} is already ${status.replace("_", " ").toLowerCase()}.`
  );
  if (status === "INACTIVE" && staff.role === "DOCTOR") {
    const upcoming = tx.db.appointments.some(
      a =>
        a.doctorId === staff.id &&
        (a.status === "SCHEDULED" || a.status === "CHECKED_IN") &&
        a.scheduledAt >= nowIso(tx)
    );
    assert(
      !upcoming,
      "Reassign or cancel this doctor's upcoming appointments first."
    );
  }
  staff.status = status;
  touch(tx, staff);
  log(tx, {
    entityType: "staff",
    entityId: staff.id,
    action: "status",
    summary: `${staff.firstName} ${staff.lastName} marked ${status.replace("_", " ").toLowerCase()}`,
  });
  return staff;
}
