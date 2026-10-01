/**
 * User management: logins, access roles and their permissions.
 *
 * The rules keep the hospital administrable: there is always an active
 * Administrator login, nobody can lock themselves out of User management,
 * the Administrator role keeps full access, and a role still in use cannot
 * be deleted. Every change is written to the activity log.
 */
import { pluralize } from "../format";
import {
  ACTIONS,
  ADMINISTRATOR_ROLE,
  LANDING_PAGES,
  MODULES,
  isAction,
  isModule,
  normaliseGrants,
  resolveAccess,
} from "../rbac";
import type { Database, ID, Role, User, UserStatus } from "../sim/schema";
import {
  assert,
  log,
  must,
  newId,
  nowIso,
  requireText,
  touch,
  type Tx,
} from "../sim/tx";

const fullName = (db: Database, staffId: ID) => {
  const staff = db.staff.find(s => s.id === staffId);
  return staff ? `${staff.firstName} ${staff.lastName}` : "Unknown staff";
};

/** Logins that can administer: active, Administrator role, staff not inactive. */
export function activeAdministrators(
  db: Database,
  except: { userId?: ID; staffId?: ID } = {}
) {
  return db.users.filter(
    u =>
      u.roleId === ADMINISTRATOR_ROLE &&
      u.status === "ACTIVE" &&
      u.id !== except.userId &&
      u.staffId !== except.staffId &&
      db.staff.find(s => s.id === u.staffId)?.status !== "INACTIVE"
  );
}

const ONLY_ADMIN =
  "This is the only active Administrator login. Give another login the Administrator role first.";

/** A free login ID based on `wanted` (kavya.rao, kavya.rao2, …). */
export function uniqueUsername(db: Database, wanted: string) {
  const base =
    wanted
      .toLowerCase()
      .replace(/[^a-z0-9._-]/g, "")
      .slice(0, 28) || "user";
  const taken = new Set(db.users.map(u => u.username));
  if (!taken.has(base)) return base;
  for (let n = 2; ; n += 1) if (!taken.has(`${base}${n}`)) return `${base}${n}`;
}

const USERNAME = /^[a-z0-9][a-z0-9._-]{2,31}$/;

function checkUsername(db: Database, username: string, selfId?: ID) {
  const value = username.trim().toLowerCase();
  assert(
    USERNAME.test(value),
    "A login ID is 3–32 characters: lowercase letters, digits, dots, dashes or underscores."
  );
  assert(
    !db.users.some(u => u.username === value && u.id !== selfId),
    `The login ID "${value}" is already taken.`
  );
  return value;
}

function checkGrants(modules: readonly string[], actions: readonly string[]) {
  const badModule = modules.find(m => !isModule(m));
  assert(!badModule, `There is no module called "${badModule}".`);
  const badAction = actions.find(a => !isAction(a));
  assert(!badAction, `There is no action called "${badAction}".`);
  return normaliseGrants(modules, actions);
}

function checkHome(homePath: string, modules: readonly string[]) {
  const page = LANDING_PAGES.find(p => p.path === homePath);
  assert(page, "Choose a landing page from the list.");
  assert(
    modules.includes(page.module),
    `Members of this role cannot open ${page.label}. Choose a landing page inside its modules.`
  );
}

/** The acting staff member's own login, if any (the seed acts as "system"). */
const loginOf = (tx: Tx) => tx.db.users.find(u => u.staffId === tx.actorId);

/* ------------------------------------------------------------------ */
/* Logins                                                              */
/* ------------------------------------------------------------------ */

export interface LoginInput {
  roleId: ID;
  username: string;
  status?: UserStatus;
  customAccess?: boolean;
  modules?: string[];
  actions?: string[];
}

function accessFields(role: Role, input: LoginInput, current?: User) {
  const custom =
    (input.customAccess ?? current?.customAccess ?? false) &&
    role.id !== ADMINISTRATOR_ROLE;
  if (!custom) return { customAccess: false, modules: [], actions: [] };
  const grants = checkGrants(
    input.modules ?? current?.modules ?? [],
    input.actions ?? current?.actions ?? []
  );
  assert(
    grants.actions.length > 0 || grants.modules.length > 1,
    "Custom access needs at least one module or action beyond the dashboard."
  );
  return { customAccess: true, ...grants };
}

export function createUser(tx: Tx, input: LoginInput & { staffId: ID }) {
  const staff = must(tx.db.staff, input.staffId, "Staff member");
  const name = `${staff.firstName} ${staff.lastName}`;
  assert(
    staff.status !== "INACTIVE",
    `${name} is marked inactive. Reactivate them in WFM first.`
  );
  assert(
    !tx.db.users.some(u => u.staffId === staff.id),
    `${name} already has a login.`
  );
  const role = must(tx.db.roles, input.roleId, "Role");
  const user: User = {
    id: newId(tx, "usr"),
    staffId: staff.id,
    roleId: role.id,
    username: checkUsername(tx.db, input.username),
    status: input.status ?? "ACTIVE",
    ...accessFields(role, input),
    createdAt: nowIso(tx),
    updatedAt: nowIso(tx),
  };
  tx.db.users.push(user);
  log(tx, {
    entityType: "user",
    entityId: user.id,
    action: "created",
    summary: `Login ${user.username} created for ${name} as ${role.name}${user.customAccess ? " with custom access" : ""}`,
  });
  return user;
}

export function updateUser(
  tx: Tx,
  input: Partial<LoginInput> & { userId: ID }
) {
  const user = must(tx.db.users, input.userId, "Login");
  const name = fullName(tx.db, user.staffId);
  const role = must(tx.db.roles, input.roleId ?? user.roleId, "Role");
  const status = input.status ?? user.status;
  const username =
    input.username === undefined
      ? user.username
      : checkUsername(tx.db, input.username, user.id);
  const access = accessFields(
    role,
    { roleId: role.id, username, ...input },
    user
  );

  if (user.roleId === ADMINISTRATOR_ROLE && user.status === "ACTIVE")
    assert(
      (role.id === ADMINISTRATOR_ROLE && status === "ACTIVE") ||
        activeAdministrators(tx.db, { userId: user.id }).length > 0,
      ONLY_ADMIN
    );
  if (user.staffId === tx.actorId) {
    assert(status === "ACTIVE", "You cannot disable your own login.");
    assert(
      resolveAccess(role, access).actions.has("users.manage"),
      "You cannot remove your own access to User management."
    );
  }

  const changes: string[] = [];
  if (role.id !== user.roleId) changes.push(`role → ${role.name}`);
  if (username !== user.username) changes.push(`login ID → ${username}`);
  if (status !== user.status) changes.push(status.toLowerCase());
  if (
    access.customAccess !== user.customAccess ||
    access.modules.join() !== user.modules.join() ||
    access.actions.join() !== user.actions.join()
  )
    changes.push(
      access.customAccess ? "custom access updated" : "role permissions"
    );
  assert(changes.length, "Nothing to change.");

  Object.assign(user, { roleId: role.id, username, status, ...access });
  touch(tx, user);
  log(tx, {
    entityType: "user",
    entityId: user.id,
    action: "updated",
    summary: `Login ${user.username} (${name}): ${changes.join(", ")}`,
  });
  return user;
}

export function deleteUser(tx: Tx, userId: ID) {
  const index = tx.db.users.findIndex(u => u.id === userId);
  const user = tx.db.users[index];
  assert(user, "Login was not found.");
  assert(user.staffId !== tx.actorId, "You cannot delete your own login.");
  if (user.roleId === ADMINISTRATOR_ROLE && user.status === "ACTIVE")
    assert(
      activeAdministrators(tx.db, { userId: user.id }).length > 0,
      ONLY_ADMIN
    );
  tx.db.users.splice(index, 1);
  log(tx, {
    entityType: "user",
    entityId: user.id,
    action: "deleted",
    summary: `Login ${user.username} (${fullName(tx.db, user.staffId)}) deleted — the staff record and its history stay`,
  });
  return { id: user.id };
}

/* ------------------------------------------------------------------ */
/* Roles                                                               */
/* ------------------------------------------------------------------ */

export interface RoleInput {
  name: string;
  description: string;
  modules: string[];
  actions: string[];
  homePath: string;
}

function checkRoleName(db: Database, name: string, selfId?: ID) {
  const value = requireText(name, "Role name").replace(/\s+/g, " ");
  assert(value.length <= 48, "Keep the role name under 48 characters.");
  assert(
    !db.roles.some(
      r => r.id !== selfId && r.name.toLowerCase() === value.toLowerCase()
    ),
    `A role called ${value} already exists.`
  );
  return value;
}

export function createRole(tx: Tx, input: RoleInput) {
  const name = checkRoleName(tx.db, input.name);
  const grants = checkGrants(input.modules, input.actions);
  checkHome(input.homePath, grants.modules);
  const role: Role = {
    id: newId(tx, "rol"),
    name,
    description: input.description.trim(),
    ...grants,
    homePath: input.homePath,
    system: false,
    createdAt: nowIso(tx),
    updatedAt: nowIso(tx),
  };
  tx.db.roles.push(role);
  log(tx, {
    entityType: "role",
    entityId: role.id,
    action: "created",
    summary: `Role ${name} created: ${pluralize(grants.modules.length, "module")}, ${pluralize(grants.actions.length, "action")}`,
  });
  return role;
}

export function updateRole(tx: Tx, input: Partial<RoleInput> & { roleId: ID }) {
  const role = must(tx.db.roles, input.roleId, "Role");
  const administrator = role.id === ADMINISTRATOR_ROLE;
  const name =
    input.name === undefined
      ? role.name
      : checkRoleName(tx.db, input.name, role.id);
  assert(
    !administrator || name === role.name,
    "The Administrator role cannot be renamed."
  );
  const grants = administrator
    ? { modules: [...MODULES], actions: [...ACTIONS] }
    : checkGrants(input.modules ?? role.modules, input.actions ?? role.actions);
  if (administrator && (input.modules || input.actions))
    assert(
      normaliseGrants(input.modules ?? MODULES, input.actions ?? ACTIONS)
        .actions.length === ACTIONS.length,
      "The Administrator role always has full access."
    );
  const homePath = input.homePath ?? role.homePath;
  checkHome(homePath, grants.modules);
  const own = loginOf(tx);
  if (own && own.roleId === role.id && !own.customAccess)
    assert(
      resolveAccess({ id: role.id, ...grants }).actions.has("users.manage"),
      "You cannot remove User management from your own role."
    );
  const description = input.description?.trim() ?? role.description;

  const before = { modules: role.modules.length, actions: role.actions.length };
  Object.assign(role, { name, description, ...grants, homePath });
  touch(tx, role);
  const members = tx.db.users.filter(u => u.roleId === role.id).length;
  log(tx, {
    entityType: "role",
    entityId: role.id,
    action: "updated",
    summary: `Role ${name} updated: ${before.modules}→${grants.modules.length} modules, ${before.actions}→${grants.actions.length} actions (${members} login${members === 1 ? "" : "s"})`,
  });
  return role;
}

export function deleteRole(tx: Tx, roleId: ID) {
  const index = tx.db.roles.findIndex(r => r.id === roleId);
  const role = tx.db.roles[index];
  assert(role, "Role was not found.");
  assert(
    role.id !== ADMINISTRATOR_ROLE,
    "The Administrator role cannot be deleted."
  );
  const members = tx.db.users.filter(u => u.roleId === role.id).length;
  assert(
    members === 0,
    `${members} login${members === 1 ? " still uses" : "s still use"} ${role.name}. Move ${members === 1 ? "it" : "them"} to another role first.`
  );
  tx.db.roles.splice(index, 1);
  log(tx, {
    entityType: "role",
    entityId: role.id,
    action: "deleted",
    summary: `Role ${role.name} deleted`,
  });
  return { id: role.id };
}
