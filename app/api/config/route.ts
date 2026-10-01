import {
  configurationProblems,
  dataMode,
  resetAllowed,
} from "@/lib/server/env";
import { ok } from "@/lib/server/http";

export const dynamic = "force-dynamic";

/** Tells the browser where data lives: PostgreSQL ("server") or itself. */
export function GET() {
  const mode = dataMode();
  return ok({
    mode,
    // A browser-mode reset only replaces that browser's own sandbox.
    resetAllowed: mode === "browser" || resetAllowed(),
    problems: configurationProblems(),
  });
}
