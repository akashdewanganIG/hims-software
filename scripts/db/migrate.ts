/**
 * Applies pending migrations from ./drizzle to the database, over the
 * direct (non-pooled) connection: DIRECT_URL or DATABASE_URL.
 *
 *   npm run db:migrate
 *
 * Safe to run on every deploy: applied migrations are skipped. Create new
 * ones after changing lib/server/db/schema.ts with `npm run db:generate`.
 */
import { prepareCli, targetDatabase } from "./safety";

await prepareCli();
const target = targetDatabase("Migration");
const { connect, directUrl } = await import("../../lib/server/db/client");
const { migrationStatus, runMigrations } =
  await import("../../lib/server/db/migrations");

/** Creates the database first when it is local and missing (as Prisma did). */
async function ensureLocalDatabase(url: string) {
  const parsed = new URL(url);
  if (!["localhost", "127.0.0.1", "::1"].includes(parsed.hostname)) return;
  const name = decodeURIComponent(parsed.pathname.slice(1));
  const pg = (await import("pg")).default;
  const admin = new URL(url);
  admin.pathname = "/postgres";
  const client = new pg.Client({ connectionString: admin.toString() });
  await client.connect();
  try {
    const found = await client.query(
      "SELECT 1 FROM pg_database WHERE datname = $1",
      [name]
    );
    if (!found.rowCount) {
      await client.query(`CREATE DATABASE "${name.replace(/"/g, '""')}"`);
      console.log(`• Created database ${name}`);
    }
  } finally {
    await client.end();
  }
}

await ensureLocalDatabase(directUrl());
const connection = connect(directUrl(), { max: 1 });
try {
  const before = await migrationStatus(connection.db);
  if (before.legacy) {
    console.error(
      `✗ ${target} was built by the Prisma version of this app. Rebuild it with Drizzle migrations:\n    npm run db:reset   (guarded — see .env.example)`
    );
    process.exitCode = 1;
  } else if (!before.pending.length) {
    console.log(
      `✓ ${target} is up to date (${before.applied} migration(s), latest ${before.latest}).`
    );
  } else {
    console.log(
      `• Applying ${before.pending.length} migration(s) to ${target} (${connection.driver} driver): ${before.pending.join(", ")}`
    );
    await runMigrations(connection);
    const after = await migrationStatus(connection.db);
    console.log(`✓ Migrated — latest ${after.latest}.`);
  }
} catch (error) {
  console.error(`✗ ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
} finally {
  await connection.close();
}
