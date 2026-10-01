import type { NextRequest } from "next/server";

import { OperationError } from "@/lib/ops/execute";
import { readState } from "@/lib/server/engine";
import {
  assertSameOrigin,
  assertServerMode,
  failure,
  ok,
  readJson,
  sessionUserId,
} from "@/lib/server/http";
import {
  SESSION_COOKIE,
  createSessionToken,
  sessionCookieOptions,
} from "@/lib/server/session";
import { sessionView } from "@/lib/views/system";

export const dynamic = "force-dynamic";

/** The signed-in user, or `{ session: null }`. */
export async function GET(request: NextRequest) {
  try {
    assertServerMode();
    const state = await readState();
    return ok({ session: sessionView(state.db, sessionUserId(request)) });
  } catch (error) {
    return failure(error);
  }
}

/** Sign in as a staff login (the simulation's role picker). */
export async function POST(request: NextRequest) {
  try {
    assertServerMode();
    assertSameOrigin(request);
    const body = (await readJson(request)) as { userId?: unknown } | null;
    const userId = typeof body?.userId === "string" ? body.userId : "";
    const state = await readState();
    const session = sessionView(state.db, userId);
    if (!session)
      throw new OperationError(
        "UNAUTHENTICATED",
        "That login is not available. Choose an active member of staff."
      );
    const response = ok({ session });
    response.cookies.set(
      SESSION_COOKIE,
      createSessionToken(userId),
      sessionCookieOptions()
    );
    return response;
  } catch (error) {
    return failure(error);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const response = ok({ session: null });
    response.cookies.set(SESSION_COOKIE, "", {
      ...sessionCookieOptions(),
      maxAge: 0,
    });
    return response;
  } catch (error) {
    return failure(error);
  }
}
