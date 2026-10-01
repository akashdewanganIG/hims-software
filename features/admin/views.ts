/**
 * User management reads: every login with its staff record and effective
 * access, every role with its permissions and members, and the audit trail
 * of access changes.
 */
import type { Actor } from "@/lib/ops/execute";
import { byId, matches, staffName } from "@/lib/api/lookup";
import {
  ADMINISTRATOR_ROLE,
  STAFF_ROLE_LABEL,
  accessList,
  resolveAccess,
  type Action,
  type Module,
} from "@/lib/rbac";
import { uniqueUsername } from "@/lib/domain/admin";
import type {
  Database,
  ID,
  ISODateTime,
  StaffStatus,
  UserStatus,
} from "@/lib/sim/schema";

export interface LoginRow {
  id: ID;
  staffId: ID;
  name: string;
  staffCode: string;
  designation: string;
  department: string;
  /** The staff member's job (Doctor, Nurse…), not the access role. */
  job: string;
  staffStatus: StaffStatus;
  email: string;
  username: string;
  roleId: ID;
  roleName: string;
  status: UserStatus;
  customAccess: boolean;
  /** Effective access: the custom set, else the role's. */
  modules: Module[];
  actions: Action[];
  /** Custom grants as stored (for editing). */
  customModules: string[];
  customActions: string[];
  administrator: boolean;
  /** The signed-in administrator's own login. */
  self: boolean;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface StaffWithoutLogin {
  id: ID;
  name: string;
  designation: string;
  department: string;
  job: string;
  /** The job's default role, when it still exists. */
  suggestedRoleId?: ID;
  suggestedUsername: string;
}

export function adminUsersView(
  db: Database,
  _now: Date,
  filters: { q?: string; roleId?: string; status?: string },
  actor: Actor
) {
  const staff = byId(db.staff);
  const departments = byId(db.departments);
  const roles = byId(db.roles);
  const all: LoginRow[] = [];
  for (const user of db.users) {
    const person = staff.get(user.staffId);
    const role = roles.get(user.roleId);
    if (!person || !role) continue;
    const access = accessList(resolveAccess(role, user));
    all.push({
      id: user.id,
      staffId: person.id,
      name: staffName(person),
      staffCode: person.staffCode,
      designation: person.designation,
      department: departments.get(person.departmentId)?.name ?? "—",
      job: STAFF_ROLE_LABEL[person.role],
      staffStatus: person.status,
      email: person.email,
      username: user.username,
      roleId: role.id,
      roleName: role.name,
      status: user.status,
      customAccess: user.customAccess,
      modules: access.modules,
      actions: access.actions,
      customModules: user.modules,
      customActions: user.actions,
      administrator: role.id === ADMINISTRATOR_ROLE,
      self: person.id === actor.staff.id,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    });
  }
  const q = filters.q?.trim() ?? "";
  const rows = all
    .filter(
      r =>
        (!q ||
          matches(
            q,
            r.name,
            r.username,
            r.email,
            r.designation,
            r.staffCode
          )) &&
        (!filters.roleId || r.roleId === filters.roleId) &&
        (!filters.status ||
          (filters.status === "CUSTOM"
            ? r.customAccess
            : r.status === filters.status))
    )
    .sort(
      (a, b) =>
        a.roleName.localeCompare(b.roleName) || a.name.localeCompare(b.name)
    );

  const withLogin = new Set(db.users.map(u => u.staffId));
  const staffWithoutLogin: StaffWithoutLogin[] = db.staff
    .filter(s => !withLogin.has(s.id) && s.status !== "INACTIVE")
    .map(s => ({
      id: s.id,
      name: staffName(s),
      designation: s.designation,
      department: departments.get(s.departmentId)?.name ?? "—",
      job: STAFF_ROLE_LABEL[s.role],
      suggestedRoleId: roles.has(s.role) ? s.role : undefined,
      suggestedUsername: uniqueUsername(db, s.email.split("@")[0] ?? ""),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return {
    rows,
    staffWithoutLogin,
    roles: db.roles.map(r => ({ id: r.id, name: r.name })),
    counts: {
      total: all.length,
      active: all.filter(r => r.status === "ACTIVE").length,
      disabled: all.filter(r => r.status === "DISABLED").length,
      custom: all.filter(r => r.customAccess).length,
      administrators: all.filter(r => r.administrator && r.status === "ACTIVE")
        .length,
    },
  };
}

export interface RoleRow {
  id: ID;
  name: string;
  description: string;
  system: boolean;
  administrator: boolean;
  /** Stored permissions (the Administrator role: everything). */
  modules: Module[];
  actions: Action[];
  homePath: string;
  members: number;
  activeMembers: number;
  /** Members whose custom access overrides this role's permissions. */
  customMembers: number;
  updatedAt: ISODateTime;
}

export function adminRolesView(db: Database): RoleRow[] {
  return db.roles.map(role => {
    const members = db.users.filter(u => u.roleId === role.id);
    const access = accessList(resolveAccess(role));
    return {
      id: role.id,
      name: role.name,
      description: role.description,
      system: role.system,
      administrator: role.id === ADMINISTRATOR_ROLE,
      modules: access.modules,
      actions: access.actions,
      homePath: role.homePath,
      members: members.length,
      activeMembers: members.filter(u => u.status === "ACTIVE").length,
      customMembers: members.filter(u => u.customAccess).length,
      updatedAt: role.updatedAt,
    };
  });
}

export interface AccessEvent {
  id: ID;
  at: ISODateTime;
  kind: "user" | "role";
  action: string;
  summary: string;
  actor: string;
}

/** Changes to logins and roles, newest first. */
export function adminAuditView(
  db: Database,
  _now: Date,
  { limit }: { limit: number }
): AccessEvent[] {
  const staff = byId(db.staff);
  const out: AccessEvent[] = [];
  for (let i = db.activity.length - 1; i >= 0 && out.length < limit; i -= 1) {
    const event = db.activity[i]!;
    if (event.entityType !== "user" && event.entityType !== "role") continue;
    out.push({
      id: event.id,
      at: event.at,
      kind: event.entityType,
      action: event.action,
      summary: event.summary,
      actor: staff.has(event.actorId)
        ? staffName(staff.get(event.actorId))
        : "System",
    });
  }
  return out;
}
