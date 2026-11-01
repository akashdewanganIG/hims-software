import type { NextRequest } from "next/server";

import { DOCUMENT_TYPES } from "@/lib/domain/files";
import { readState } from "@/lib/server/engine";
import { assertServerMode, failure } from "@/lib/server/http";

export const dynamic = "force-dynamic";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Serves exactly one immutable shared document; no session is required. */
export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ token: string }> }
) {
  try {
    assertServerMode();
    const { token } = await context.params;
    if (!UUID.test(token)) return new Response("Not found", { status: 404 });
    const state = await readState();
    const file = state.db.files.find(
      item => item.ownerType === "PUBLIC_DOCUMENT" && item.ownerId === token
    );
    if (!file || !DOCUMENT_TYPES.includes(file.mimeType as never))
      return new Response("Not found", { status: 404 });

    const base64 = file.data.slice(file.data.indexOf(",") + 1);
    return new Response(Buffer.from(base64, "base64"), {
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Disposition": `inline; filename="${file.name.replace(/["\\\r\n]/g, "-")}"`,
        "Content-Type": file.mimeType,
        "Referrer-Policy": "no-referrer",
        "X-Content-Type-Options": "nosniff",
        "X-Frame-Options": "SAMEORIGIN",
      },
    });
  } catch (error) {
    return failure(error);
  }
}
