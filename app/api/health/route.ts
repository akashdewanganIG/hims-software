import { sql } from "drizzle-orm";

import { database, databaseDriver } from "@/lib/server/db/client";
import { migrationStatus } from "@/lib/server/db/migrations";
import { configurationProblems, dataMode, serverEnv } from "@/lib/server/env";
import { ok } from "@/lib/server/http";
import { readSyncMeta } from "@/lib/server/persistence";
import { SCHEMA_VERSION } from "@/lib/sim/schema";

export const dynamic = "force-dynamic";

/**
 * Liveness and readiness for load balancers and `npm run doctor`: 200 when
 * the app can serve, 503 when the database it depends on cannot be used.
 */
export async function GET() {
  const time = new Date().toISOString();
  const mode = dataMode();
  if (mode === "browser")
    return ok({
      status: "ok",
      mode,
      time,
      note: "Browser mode: each browser keeps its own hospital; no database.",
    });

  const problems = configurationProblems();
  if (problems.length)
    return ok({ status: "error", mode, time, problems }, 503);

  try {
    const db = database();
    const started = performance.now();
    await db.execute(sql`SELECT 1`);
    const latencyMs = Math.round(performance.now() - started);
    const migrations = await migrationStatus(db);
    const meta = migrations.pending.length ? null : await readSyncMeta(db);
    const status = migrations.pending.length
      ? "error"
      : meta
        ? "ok"
        : "degraded";
    return ok(
      {
        status,
        mode,
        time,
        database: {
          reachable: true,
          driver: databaseDriver(serverEnv().DATABASE_URL ?? ""),
          latencyMs,
          migrations: migrations.applied,
          latestMigration: migrations.latest,
          pendingMigrations: migrations.pending,
          ...(migrations.legacy
            ? {
                note: "This database was built by the Prisma version of the app. Rebuild it with npm run db:reset (guarded).",
              }
            : {}),
          seeded: Boolean(meta),
          schemaVersion: meta?.schemaVersion ?? null,
          expectedSchemaVersion: SCHEMA_VERSION,
          epoch: meta?.epoch ?? null,
          version: meta?.version ?? null,
          anchoredAt: meta?.anchoredAt ?? null,
        },
      },
      status === "error" ? 503 : 200
    );
  } catch (error) {
    return ok(
      {
        status: "error",
        mode,
        time,
        database: {
          reachable: false,
          error:
            error instanceof Error ? error.message.split("\n")[0] : "unknown",
        },
      },
      503
    );
  }
}
