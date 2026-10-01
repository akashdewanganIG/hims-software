import type { NextRequest } from "next/server";

import { OperationError, resolveActor } from "@/lib/ops/execute";
import { can } from "@/lib/rbac";
import { readState, resetHospital } from "@/lib/server/engine";
import { resetAllowed } from "@/lib/server/env";
import {
  assertSameOrigin,
  assertServerMode,
  failure,
  ok,
  sessionUserId,
} from "@/lib/server/http";

export const dynamic = "force-dynamic";

/** Replaces the hospital with a freshly replayed one (Administrator only). */
export async function POST(request: NextRequest) {
  try {
    assertServerMode();
    assertSameOrigin(request);
    const state = await readState();
    const actor = resolveActor(state.db, sessionUserId(request));
    if (!can(actor.access, "simulation.reset"))
      throw new OperationError(
        "FORBIDDEN",
        "Only an Administrator can reset the hospital."
      );
    if (!resetAllowed())
      throw new OperationError(
        "FORBIDDEN",
        "Resetting is disabled in production."
      );
    return ok(await resetHospital());
  } catch (error) {
    return failure(error);
  }
}
