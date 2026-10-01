/** Shared plumbing for the route handlers under app/api. */
import { NextResponse, type NextRequest } from "next/server";

import { OperationError, toOperationError } from "../ops/execute";
import { configurationProblems, dataMode } from "./env";
import { SESSION_COOKIE, readSessionToken } from "./session";

const NO_STORE = { "Cache-Control": "no-store" };

export function ok(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: NO_STORE });
}

/** Any error → `{ error: { code, message } }` with its HTTP status. */
export function failure(error: unknown) {
  const e = toOperationError(error);
  if (e.code === "INTERNAL") console.error("[hims] request failed", error);
  return NextResponse.json(
    { error: { code: e.code, message: e.message } },
    { status: e.status, headers: NO_STORE }
  );
}

/** The API only serves data when PostgreSQL is the system of record. */
export function assertServerMode() {
  if (dataMode() !== "server")
    throw new OperationError(
      "UNAVAILABLE",
      "This deployment runs in browser mode (no DATABASE_URL); data lives in each browser."
    );
  const problems = configurationProblems();
  if (problems.length)
    throw new OperationError(
      "UNAVAILABLE",
      `The server is misconfigured: ${problems.join(" ")}`
    );
}

export function sessionUserId(request: NextRequest) {
  return readSessionToken(request.cookies.get(SESSION_COOKIE)?.value);
}

/**
 * State-changing requests must come from this site (the session cookie is
 * SameSite=Lax as well) and carry JSON.
 */
export function assertSameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  const host =
    request.headers.get("x-forwarded-host") ??
    request.headers.get("host") ??
    request.nextUrl.host;
  if (origin && new URL(origin).host !== host)
    throw new OperationError("FORBIDDEN", "Cross-site requests are refused.");
  const type = request.headers.get("content-type") ?? "";
  if (request.method !== "DELETE" && !type.includes("application/json"))
    throw new OperationError(
      "INVALID_INPUT",
      "Send the request body as application/json."
    );
}

export async function readJson(request: NextRequest): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new OperationError("INVALID_INPUT", "The request body is not JSON.");
  }
}
