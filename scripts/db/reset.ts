/**
 * Drops and recreates the database schema from the migrations, then seeds a
 * fresh hospital. Guarded exactly like Ralli Wolf's `prisma:reset`.
 *
 *   ALLOW_DESTRUCTIVE_SEED=I_UNDERSTAND_THIS_DELETES_DATA  *   DESTRUCTIVE_DATABASE_CONFIRM=localhost:5433/hims_simulation  *   npm run db:reset
 *
 * Also rebuilds a database created by the Prisma version of this app.
 */
import { spawnSync } from "node:child_process";

import { sql } from "drizzle-orm";

import { assertDestructiveDatabaseAllowed, prepareCli } from "./safety";

await prepareCli();
assertDestructiveDatabaseAllowed("Database reset");

const { connect, directUrl } = await import("../../lib/server/db/client");
const connection = connect(directUrl(), { max: 1 });
try {
  await connection.db.execute(
    sql.raw(`
    DROP SCHEMA IF EXISTS drizzle CASCADE;
    DROP SCHEMA IF EXISTS public CASCADE;
    CREATE SCHEMA public;
    GRANT USAGE ON SCHEMA public TO PUBLIC;
  `)
  );
  console.log("• Dropped every table, type and migration record");
} finally {
  await connection.close();
}

for (const script of ["scripts/db/migrate.ts", "scripts/db/seed.ts"]) {
  const step = spawnSync(
    process.execPath,
    ["node_modules/tsx/dist/cli.mjs", script],
    { stdio: "inherit", env: process.env }
  );
  if (step.error) throw step.error;
  if (step.status !== 0) process.exit(step.status ?? 1);
}
