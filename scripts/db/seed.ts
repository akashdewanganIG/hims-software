/**
 * Seeds PostgreSQL with a hospital replayed over the last 30 days up to now.
 *
 *   npm run db:seed              seeds an empty database (no-op otherwise)
 *   npm run db:seed -- --force   replaces existing data (guarded: set
 *                                ALLOW_DESTRUCTIVE_SEED and
 *                                DESTRUCTIVE_DATABASE_CONFIRM, see .env.example)
 *
 * The server also seeds an empty database on first use, so this is only
 * needed to prepare one ahead of time or to start over.
 */
import {
  assertDestructiveDatabaseAllowed,
  prepareCli,
  targetDatabase,
} from "./safety";

await prepareCli();
const force = process.argv.includes("--force");
const target = targetDatabase("Seeding");

const { closeDatabase, database } = await import("../../lib/server/db/client");
const { countTables, readSyncMeta } =
  await import("../../lib/server/persistence");
const engine = await import("../../lib/server/engine");

try {
  const existing = await readSyncMeta(database());
  if (existing && !force) {
    console.log(
      `✓ ${target} already holds a hospital (anchored ${existing.anchoredAt}, version ${existing.version}, ${existing.userChanges} user changes). Nothing to do.\n  To replace it: npm run db:seed -- --force (guarded).`
    );
  } else {
    if (existing) assertDestructiveDatabaseAllowed("Reseeding");
    const started = Date.now();
    console.log(`• Replaying 30 days of hospital activity into ${target}…`);
    if (existing) await engine.resetHospital();
    else await engine.readState();
    const counts = await countTables(database());
    const rows = Object.values(counts).reduce((a, b) => a + b, 0);
    console.log(
      `✓ Seeded ${rows.toLocaleString("en-IN")} rows across ${Object.keys(counts).length} tables in ${((Date.now() - started) / 1000).toFixed(1)} s.`
    );
  }
} catch (error) {
  console.error(`✗ ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
} finally {
  await closeDatabase();
}
