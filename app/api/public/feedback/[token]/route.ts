import type { NextRequest } from "next/server";

import { readState, runOperation } from "@/lib/server/engine";
import { assertServerMode, failure } from "@/lib/server/http";

export const dynamic = "force-dynamic";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const headers = {
  "Cache-Control": "private, no-store",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
};

async function publicRequest(token: string) {
  if (!UUID.test(token)) return null;
  const state = await readState();
  const request = state.db.feedbackRequests.find(row => row.token === token);
  if (!request) return null;
  const patient = state.db.patients.find(row => row.id === request.patientId);
  const department = state.db.departments.find(
    row => row.id === request.departmentId
  );
  const doctor = state.db.staff.find(row => row.id === request.doctorId);
  return {
    state,
    request,
    payload: {
      status: request.status,
      process: request.process,
      processLabel:
        request.process === "OPD_VISIT" ? "OPD visit" : "hospital stay",
      patientFirstName: patient?.firstName ?? "Patient",
      department: department?.name ?? "Hospital care",
      doctor: doctor ? `Dr ${doctor.firstName} ${doctor.lastName}` : undefined,
      completedAt: request.completedAt,
    },
  };
}

/** Public, token-gated review context. No hospital login is required. */
export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ token: string }> }
) {
  try {
    assertServerMode();
    const { token } = await context.params;
    const found = await publicRequest(token);
    if (!found)
      return Response.json(
        { error: "Feedback link not found." },
        { status: 404, headers }
      );
    return Response.json(found.payload, { headers });
  } catch (error) {
    return failure(error);
  }
}

/** Records one response and permanently closes the one-time review link. */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ token: string }> }
) {
  try {
    assertServerMode();
    const { token } = await context.params;
    const found = await publicRequest(token);
    if (!found)
      return Response.json(
        { error: "Feedback link not found." },
        { status: 404, headers }
      );
    if (found.request.status === "SUBMITTED")
      return Response.json(
        { error: "Feedback has already been submitted." },
        { status: 409, headers }
      );

    const actor =
      found.state.db.users.find(
        user =>
          user.staffId === found.request.createdById && user.status === "ACTIVE"
      ) ?? found.state.db.users.find(user => user.status === "ACTIVE");
    if (!actor)
      return Response.json(
        { error: "Feedback is temporarily unavailable." },
        { status: 503, headers }
      );

    const body = (await request.json()) as unknown;
    const outcome = await runOperation(actor.id, "feedback.submitPublic", {
      token,
      ...(body && typeof body === "object" ? body : {}),
    });
    return Response.json({ ok: true, feedback: outcome.result }, { headers });
  } catch (error) {
    return failure(error);
  }
}
