/**
 * Views that are not tied to one module: the records search behind ⌘K, the
 * sign-in directory, the signed-in user's own profile and the integrity
 * check.
 */
import { matches, staffName } from "../api/lookup";
import { fileOf } from "../domain/files";
import { formatDate } from "../format";
import type { Actor } from "../ops/execute";
import {
  accessList,
  canAccess,
  homeFor,
  resolveAccess,
  type Action,
  type Module,
} from "../rbac";
import { checkIntegrity } from "../sim/integrity";
import { STAFF } from "../sim/reference";
import type { Database, ID, Staff, User } from "../sim/schema";

export type RecordKind =
  "patient" | "appointment" | "admission" | "invoice" | "enquiry" | "lab";

export interface RecordHit {
  id: string;
  kind: RecordKind;
  label: string;
  hint: string;
  href: string;
}

/**
 * Hospital-wide lookup by patient name / UHID / phone and reference numbers,
 * limited to the modules the signed-in role can open.
 */
export function searchRecordsView(
  db: Database,
  _now: Date,
  { query }: { query: string },
  actor: Actor
): RecordHit[] {
  const q = query.trim();
  if (q.length < 2) return [];
  const allowed = (module: Module) => canAccess(actor.access, module);
  const out: RecordHit[] = [];
  const take = (limit: number, rows: RecordHit[]) =>
    out.push(...rows.slice(0, limit));
  const patients = new Map(db.patients.map(p => [p.id, p]));
  const patientName = (id: ID) => {
    const p = patients.get(id);
    return p ? `${p.firstName} ${p.lastName}` : "—";
  };
  const status = (s: string) => s.replace(/_/g, " ").toLowerCase();

  if (allowed("ehr"))
    take(
      6,
      db.patients
        .filter(p =>
          matches(q, `${p.firstName} ${p.lastName}`, p.uhid, p.phone)
        )
        .map(p => ({
          id: `patient:${p.id}`,
          kind: "patient",
          label: `${p.firstName} ${p.lastName}`,
          hint: `${p.uhid} · ${p.phone.slice(0, 5)} ${p.phone.slice(5)}`,
          href: `/patients/${p.id}`,
        }))
    );
  if (allowed("opd"))
    take(
      4,
      db.appointments
        .filter(a => matches(q, a.code))
        .map(a => ({
          id: `apt:${a.id}`,
          kind: "appointment",
          label: `${a.code} · ${patientName(a.patientId)}`,
          hint: `${formatDate(a.scheduledAt)} · ${staffName(db.staff.find(s => s.id === a.doctorId))}`,
          href: a.encounterId
            ? `/opd/visits/${a.encounterId}`
            : `/opd/appointments?q=${encodeURIComponent(a.code)}`,
        }))
    );
  if (allowed("ipd"))
    take(
      4,
      db.admissions
        .filter(a => matches(q, a.code))
        .map(a => ({
          id: `adm:${a.id}`,
          kind: "admission",
          label: `${a.code} · ${patientName(a.patientId)}`,
          hint: status(a.status),
          href: `/ipd/${a.id}`,
        }))
    );
  if (allowed("billing"))
    take(
      4,
      db.invoices
        .filter(i => matches(q, i.code))
        .map(i => ({
          id: `inv:${i.id}`,
          kind: "invoice",
          label: `${i.code} · ${patientName(i.patientId)}`,
          hint: status(i.status),
          href: `/billing/${i.id}`,
        }))
    );
  if (allowed("enquiry"))
    take(
      3,
      db.enquiries
        .filter(e => matches(q, e.code, e.prospectName, e.phone))
        .map(e => ({
          id: `enq:${e.id}`,
          kind: "enquiry",
          label: `${e.code} · ${e.prospectName}`,
          hint: status(e.status),
          href: `/enquiries?open=${e.id}`,
        }))
    );
  if (allowed("lab"))
    take(
      3,
      db.labOrders
        .filter(o => matches(q, o.code, o.sampleId))
        .map(o => ({
          id: `lab:${o.id}`,
          kind: "lab",
          label: `${o.code} · ${patientName(o.patientId)}`,
          hint: o.sampleId ?? status(o.status),
          href: `/lab?open=${o.id}`,
        }))
    );
  return out;
}

export interface DirectoryUser {
  userId: ID;
  name: string;
  username: string;
  detail: string;
  /** The suggested login for its role (preselected on the sign-in screen). */
  primary: boolean;
  customAccess: boolean;
}

export interface DirectoryRole {
  id: ID;
  name: string;
  description: string;
  system: boolean;
  /** What members can open and do — role permissions, before custom access. */
  modules: Module[];
  actions: Action[];
  /** Where members land after signing in. */
  home: string;
  users: DirectoryUser[];
}

/**
 * The sign-in screen: every role with its active logins, straight from User
 * management — a role, user or permission change shows here at once.
 */
export function loginDirectoryView(db: Database): DirectoryRole[] {
  const staffById = new Map(db.staff.map(s => [s.id, s]));
  const deptName = new Map(db.departments.map(d => [d.id, d.name]));
  return db.roles.map(role => {
    const users: DirectoryUser[] = [];
    for (const user of db.users) {
      if (user.roleId !== role.id || user.status !== "ACTIVE") continue;
      const staff = staffById.get(user.staffId);
      if (!staff || staff.status !== "ACTIVE") continue;
      const seed = STAFF.find(
        s => s.first === staff.firstName && s.last === staff.lastName
      );
      users.push({
        userId: user.id,
        name: staffName(staff),
        username: user.username,
        detail: `${staff.designation} · ${deptName.get(staff.departmentId) ?? ""}`,
        primary: Boolean(seed?.primaryLogin),
        customAccess: user.customAccess,
      });
    }
    users.sort(
      (a, b) =>
        Number(b.primary) - Number(a.primary) || a.name.localeCompare(b.name)
    );
    const access = resolveAccess(role);
    return {
      id: role.id,
      name: role.name,
      description: role.description,
      system: role.system,
      ...accessList(access),
      home: homeFor(access, role.homePath),
      users,
    };
  });
}

export interface SessionData {
  user: User;
  staff: Staff;
  role: { id: ID; name: string; description: string; system: boolean };
  access: { modules: Module[]; actions: Action[] };
  /** Where this login lands after signing in. */
  home: string;
  /** The staff member's own photo, shown on the account menu. */
  photoFileId?: ID;
}

/** The signed-in user, their staff record, role and resolved access. */
export function sessionView(
  db: Database,
  userId: ID | null
): SessionData | null {
  const user = userId ? db.users.find(u => u.id === userId) : undefined;
  if (!user || user.status !== "ACTIVE") return null;
  const staff = db.staff.find(s => s.id === user.staffId);
  if (!staff || staff.status === "INACTIVE") return null;
  const role = db.roles.find(r => r.id === user.roleId);
  if (!role) return null;
  const access = resolveAccess(role, user);
  return {
    user,
    staff,
    role: {
      id: role.id,
      name: role.name,
      description: role.description,
      system: role.system,
    },
    access: accessList(access),
    home: homeFor(access, role.homePath),
    photoFileId: fileOf(db, "STAFF_PHOTO", staff.id)?.id,
  };
}

export function integrityView(db: Database) {
  return { checkedAt: new Date().toISOString(), issues: checkIntegrity(db) };
}
