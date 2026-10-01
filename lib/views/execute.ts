/**
 * Reads take the same path in both modes: resolve the actor → check the role
 * may open one of the view's modules → validate parameters → run the view.
 */
import type { z } from "zod";

import {
  OperationError,
  describeActor,
  resolveActor,
  type Actor,
} from "../ops/execute";
import { MODULE_LABEL, canAccess } from "../rbac";
import type { Database, ID } from "../sim/schema";
import { VIEWS, isViewName, type ViewDef, type ViewName } from "./registry";

type AnyView = ViewDef<z.ZodType, unknown>;

export interface PreparedView {
  name: ViewName;
  run: (db: Database, now: Date) => unknown;
}

export function prepareView(
  db: Database,
  userId: ID | null | undefined,
  name: string,
  rawParams: unknown
): PreparedView {
  if (!isViewName(name))
    throw new OperationError(
      "UNKNOWN_OPERATION",
      `There is no view called "${name}".`
    );
  const def = VIEWS[name] as unknown as AnyView;
  const actor: Actor | null = def.public ? null : resolveActor(db, userId);
  if (actor && def.modules.length) {
    if (!def.modules.some(module => canAccess(actor.access, module)))
      throw new OperationError(
        "FORBIDDEN",
        `${describeActor(actor)} has no access to ${def.modules
          .map(m => MODULE_LABEL[m])
          .join(" or ")}.`
      );
  }
  const parsed = def.params.safeParse(rawParams ?? {});
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new OperationError(
      "INVALID_INPUT",
      issue
        ? `Invalid ${issue.path.join(".") || "parameters"}: ${issue.message}`
        : "Invalid parameters."
    );
  }
  return {
    name,
    run: (db, now) => def.run(db, now, parsed.data, actor as Actor),
  };
}
