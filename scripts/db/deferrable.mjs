// Makes every foreign key in a migration DEFERRABLE INITIALLY DEFERRED.
//
// One operation may insert rows that reference each other (an IPD encounter
// and its admission point at one another), so foreign keys are checked when
// the transaction commits rather than statement by statement. Drizzle has no
// schema syntax for this, so migrations are post-processed: `db:generate`
// runs this on every new migration and the test suite checks the files and
// the database.
import { readFileSync, writeFileSync } from "node:fs";

const FK =
  /(FOREIGN KEY \([^)]*\) REFERENCES (?:"[^"]+"\.)?"[^"]+"\([^)]*\)(?: ON DELETE [a-z ]+?)?(?: ON UPDATE [a-z ]+?)?)(\s+DEFERRABLE[a-z ]*)?;/gi;

export function makeDeferrable(sql) {
  let count = 0;
  const out = sql.replace(FK, (_, constraint) => {
    count += 1;
    return `${constraint} DEFERRABLE INITIALLY DEFERRED;`;
  });
  return { sql: out, count };
}

if (
  process.argv[1]?.replace(/\\/g, "/").endsWith("scripts/db/deferrable.mjs")
) {
  const files = process.argv.slice(2);
  if (!files.length) {
    console.error("usage: node scripts/db/deferrable.mjs <migration.sql>…");
    process.exit(1);
  }
  for (const file of files) {
    const { sql, count } = makeDeferrable(readFileSync(file, "utf8"));
    writeFileSync(file, sql);
    console.log(`${file}: ${count} foreign key(s) deferrable`);
  }
}
