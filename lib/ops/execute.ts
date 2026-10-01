/**
 * The one path every write takes, in the browser sandbox and on the server:
 * resolve who is acting → check their role may run the operation → validate
 * the input → run the domain service. Errors come back as `OperationError`
 * with a stable code (and HTTP status) and a message fit to show the user.
 */
import type { z } from "zod";

import { can, resolveAccess, type Access } from "../rbac";
import type { Database, ID, Role, Staff, User } from "../sim/schema";
import type { Tx } from "../sim/tx";
import { OperationError } from "./errors";
import {
  OPERATIONS,
  isOperationName,
  type OperationDef,
  type OperationName,
} from "./registry";

export {
  OperationError,
  toOperationError,
  type OperationErrorCode,
} from "./errors";

export interface Actor {
  user: User;
  staff: Staff;
  role: Role;
  /** What this login may open and do (its role's, or its custom set). */
  access: Access;
}

/** "The Nurse role" — or "Your login" when it has custom access. */
export function describeActor(actor: Actor) {
  return actor.user.customAccess ? "Your login" : `The ${actor.role.name} role`;
}

export function resolveActor(
  db: Database,
  userId: ID | null | undefined
): Actor {
  const user = userId ? db.users.find(u => u.id === userId) : undefined;
  if (!user)
    throw new OperationError(
      "UNAUTHENTICATED",
      "Your session has ended. Sign in again to continue."
    );
  if (user.status !== "ACTIVE")
    throw new OperationError(
      "UNAUTHENTICATED",
      "This login has been disabled. Ask an administrator to enable it."
    );
  const staff = db.staff.find(s => s.id === user.staffId);
  if (!staff)
    throw new OperationError(
      "UNAUTHENTICATED",
      "Your staff record was not found. Sign in again."
    );
  if (staff.status === "INACTIVE")
    throw new OperationError(
      "FORBIDDEN",
      `${staff.firstName} ${staff.lastName} is marked inactive and cannot make changes.`
    );
  const role = db.roles.find(r => r.id === user.roleId);
  if (!role)
    throw new OperationError(
      "FORBIDDEN",
      "Your login has no access role. Ask an administrator to assign one."
    );
  return { user, staff, role, access: resolveAccess(role, user) };
}

function describeIssues(error: z.ZodError) {
  const issue = error.issues[0];
  if (!issue) return "The request was not valid.";
  const path = issue.path.map(String).join(".");
  return path
    ? `Invalid value for ${path}: ${issue.message}`
    : `Invalid request: ${issue.message}`;
}

type AnyDef = OperationDef<z.ZodType, unknown>;

export interface PreparedOperation {
  name: OperationName;
  label: string;
  silent: boolean;
  actor: Actor;
  input: unknown;
  run: (tx: Tx) => unknown;
}

/** Authorise and validate; throws OperationError. Does not touch data. */
export function prepareOperation(
  db: Database,
  userId: ID | null | undefined,
  name: string,
  rawInput: unknown
): PreparedOperation {
  if (!isOperationName(name))
    throw new OperationError(
      "UNKNOWN_OPERATION",
      `There is no operation called "${name}".`
    );
  const def = OPERATIONS[name] as unknown as AnyDef;
  const actor = resolveActor(db, userId);
  if (def.allow.length && !def.allow.some(a => can(actor.access, a)))
    throw new OperationError(
      "FORBIDDEN",
      `${describeActor(actor)} cannot ${def.label.toLowerCase()}.`
    );
  const parsed = def.input.safeParse(rawInput ?? {});
  if (!parsed.success)
    throw new OperationError("INVALID_INPUT", describeIssues(parsed.error));
  return {
    name,
    label: def.label,
    silent: Boolean(def.silent),
    actor,
    input: parsed.data,
    run: tx => def.run({ ...tx, actorId: actor.staff.id }, parsed.data),
  };
}
