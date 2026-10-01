import type { NextRequest } from "next/server";

import { resolveActor } from "@/lib/ops/execute";
import { readState } from "@/lib/server/engine";
import {
  assertServerMode,
  failure,
  ok,
  sessionUserId,
} from "@/lib/server/http";

export const dynamic = "force-dynamic";

/**
 * The data version. Browsers poll this to learn that someone else changed
 * the hospital, then refetch what they show.
 */
export async function GET(request: NextRequest) {
  try {
    assertServerMode();
    const state = await readState();
    resolveActor(state.db, sessionUserId(request));
    return ok({
      epoch: state.epoch,
      version: state.version,
      anchoredAt: state.db.meta.anchoredAt,
      userChanges: state.userChanges,
    });
  } catch (error) {
    return failure(error);
  }
}
