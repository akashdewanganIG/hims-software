// Creates a migration after a change to lib/server/db/schema.ts.
//
//   npm run db:generate -- --name add_visit_notes
//
// Wraps `drizzle-kit generate`: the new migration's foreign keys are then
// made DEFERRABLE INITIALLY DEFERRED (one operation may insert rows that
// reference each other). Apply it with `npm run db:migrate`.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { makeDeferrable } from "./deferrable.mjs";

const dir = "drizzle";
const list = () =>
  existsSync(dir) ? readdirSync(dir).filter(name => name.endsWith(".sql")) : [];

const before = new Set(list());
const result = spawnSync(
  process.execPath,
  ["node_modules/drizzle-kit/bin.cjs", "generate", ...process.argv.slice(2)],
  { stdio: "inherit", env: process.env }
);
if (result.status !== 0) process.exit(result.status ?? 1);

for (const name of list().filter(name => !before.has(name))) {
  const file = join(dir, name);
  const { sql, count } = makeDeferrable(readFileSync(file, "utf8"));
  writeFileSync(file, sql);
  console.log(`• ${name}: ${count} foreign key(s) made deferrable`);
}
