import type { NextRequest } from "next/server";

import { OperationError } from "@/lib/ops/execute";
import { readState } from "@/lib/server/engine";
import {
  assertServerMode,
  failure,
  ok,
  sessionUserId,
} from "@/lib/server/http";
import { prepareView } from "@/lib/views/execute";

export const dynamic = "force-dynamic";

/** GET /api/views/<name>?params=<json> — one named, role-checked read. */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ name: string }> }
) {
  try {
    assertServerMode();
    const { name } = await context.params;
    const raw = request.nextUrl.searchParams.get("params");
    let params: unknown = {};
    if (raw) {
      try {
        params = JSON.parse(raw);
      } catch {
        throw new OperationError("INVALID_INPUT", "`params` must be JSON.");
      }
    }
    const state = await readState();
    const view = prepareView(state.db, sessionUserId(request), name, params);
    // Runs synchronously on the committed working copy.
    return ok({
      data: view.run(state.db, new Date()) ?? null,
      epoch: state.epoch,
      version: state.version,
    });
  } catch (error) {
    return failure(error);
  }
}
