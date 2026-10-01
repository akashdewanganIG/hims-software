/**
 * Verifies the PostgreSQL database end to end:
 *   - every migration in ./drizzle applied
 *   - every foreign key deferrable (see scripts/db/deferrable.mjs)
 *   - the hospital is seeded with the current schema version
 *   - the change log is contiguous for the current data set
 *   - the stored data passes every cross-module integrity rule
 *
 *   npm run db:verify      (exit 1 on any problem)
 */
import { sql } from "drizzle-orm";

import { prepareCli, targetDatabase } from "./safety";

await prepareCli();
const target = targetDatabase("Verification");
const { closeDatabase, database, databaseDriver } =
  await import("../../lib/server/db/client");
const { migrationStatus, queryRows } =
  await import("../../lib/server/db/migrations");
const { countTables, readChangesAfter, readSyncMeta, readTables } =
  await import("../../lib/server/persistence");
const { checkIntegrity } = await import("../../lib/sim/integrity");
const { SCHEMA_VERSION } = await import("../../lib/sim/schema");

const problems: string[] = [];
const ok = (message: string) => console.log(`  ✓ ${message}`);
const fail = (message: string) => {
  problems.push(message);
  console.log(`  ✗ ${message}`);
};

console.log(`\nVerifying ${target}\n`);
try {
  const db = database();
  const [server] = await queryRows<{ version: string }>(
    db,
    sql`SELECT version()`
  );
  const version = server?.version ?? "PostgreSQL";
  ok(
    `connected — ${version.split(" ").slice(0, 2).join(" ")} (${databaseDriver(process.env.DATABASE_URL ?? "")} driver)`
  );

  const migrations = await migrationStatus(db);
  if (migrations.legacy)
    fail(
      "built by the Prisma version of this app — rebuild it with npm run db:reset (guarded)"
    );
  else if (migrations.pending.length)
    fail(
      `migrations not applied: ${migrations.pending.join(", ")} — run npm run db:migrate`
    );
  else
    ok(
      `${migrations.applied} migration(s) applied, latest ${migrations.latest}`
    );

  const [fks] = await queryRows<{ total: string; deferred: string }>(
    db,
    sql`SELECT count(*) AS total,
               count(*) FILTER (WHERE condeferrable AND condeferred) AS deferred
        FROM pg_constraint
        WHERE contype = 'f' AND connamespace = 'public'::regnamespace`
  );
  const total = Number(fks?.total ?? 0);
  const deferred = Number(fks?.deferred ?? 0);
  if (total !== deferred)
    fail(
      `${total - deferred} foreign key(s) are not DEFERRABLE INITIALLY DEFERRED`
    );
  else ok(`${total} foreign keys, all deferrable`);

  const meta = migrations.pending.length ? null : await readSyncMeta(db);
  if (!meta) {
    fail("no hospital seeded yet — run npm run db:seed (or open the app)");
  } else {
    if (meta.schemaVersion !== SCHEMA_VERSION)
      fail(
        `data written by schema v${meta.schemaVersion}; the app expects v${SCHEMA_VERSION} (it will reseed on first use)`
      );
    else
      ok(
        `seeded (schema v${meta.schemaVersion}, version ${meta.version}, anchored ${meta.anchoredAt})`
      );

    const log = await readChangesAfter(db, meta.epoch, 0);
    const gaps = log.filter(
      (e, i) => i > 0 && e.version !== log[i - 1]!.version + 1
    );
    const ahead = log.filter(e => e.version > meta.version);
    if (gaps.length || ahead.length)
      fail(
        `change log is not contiguous (${gaps.length} gap(s), ${ahead.length} ahead of version ${meta.version})`
      );
    else
      ok(
        `change log: ${log.length} operation(s) recorded for the current data set`
      );

    const started = Date.now();
    const data = await readTables(db, meta);
    const issues = checkIntegrity(data);
    if (issues.length) {
      fail(`${issues.length} integrity issue(s)`);
      for (const issue of issues.slice(0, 15))
        console.log(`      · ${issue.rule} — ${issue.detail}`);
    } else
      ok(
        `all integrity rules hold on the stored data (${Date.now() - started} ms)`
      );

    const counts = await countTables(db);
    console.log(
      `\n  Rows: ${Object.entries(counts)
        .map(([t, n]) => `${t}=${n}`)
        .join("  ")}`
    );
  }
} catch (error) {
  fail(error instanceof Error ? error.message.split("\n")[0]! : String(error));
} finally {
  await closeDatabase();
}

if (problems.length) {
  console.log(`\n✗ ${problems.length} problem(s) found.\n`);
  process.exit(1);
}
console.log("\n✓ Database verified.\n");
