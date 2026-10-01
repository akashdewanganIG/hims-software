import type { NextRequest } from "next/server";

import { runOperation } from "@/lib/server/engine";
import {
  assertSameOrigin,
  assertServerMode,
  failure,
  ok,
  readJson,
  sessionUserId,
} from "@/lib/server/http";

export const dynamic = "force-dynamic";

/**
 * POST /api/ops/<name> `{ input }` — one domain operation, validated,
 * authorised for the session's role and committed to PostgreSQL atomically.
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ name: string }> }
) {
  try {
    assertServerMode();
    assertSameOrigin(request);
    const { name } = await context.params;
    const body = (await readJson(request)) as { input?: unknown } | null;
    const outcome = await runOperation(
      sessionUserId(request),
      name,
      body?.input ?? {}
    );
    return ok(outcome);
  } catch (error) {
    return failure(error);
  }
}
