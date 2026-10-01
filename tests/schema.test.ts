/**
 * The PostgreSQL schema mirrors the application's model exactly — checked
 * without a database from the Drizzle table definitions and the migration
 * files: every row key has a column, every reference is a foreign key, every
 * natural key is unique, calendar dates are DATE columns, and every foreign
 * key is deferrable.
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { getTableColumns, getTableName, type Column } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/pg-core";

import { TABLES, TABLE_SCHEMA, fields } from "../lib/server/persistence";
import { REFERENCES, UNIQUE_KEYS } from "../lib/sim/integrity";
import type { TableName } from "../lib/sim/schema";
import { seededDatabase } from "./helpers";

const tableOfName = new Map<string, TableName>(
  TABLES.map(t => [getTableName(TABLE_SCHEMA[t]), t])
);
/** Column name → row key, per table. */
const keyOf = (table: TableName) =>
  new Map(
    Object.entries(getTableColumns(TABLE_SCHEMA[table])).map(
      ([key, column]) => [(column as Column).name, key]
    )
  );

test("every row key has a column and required columns are always filled", () => {
  const db = seededDatabase();
  for (const table of TABLES) {
    const columns = getTableColumns(TABLE_SCHEMA[table]) as Record<
      string,
      Column
    >;
    const rows = db[table] as unknown as Array<Record<string, unknown>>;
    assert.ok(rows.length > 0, `${table} has seed rows`);
    for (const row of rows)
      for (const key of Object.keys(row))
        assert.ok(
          key !== "seq" && key in columns,
          `${table}.${key} has no column — it would be lost`
        );
    for (const field of fields(table).filter(
      f => f.required && !columns[f.key]!.hasDefault
    ))
      for (const row of rows)
        assert.ok(
          row[field.key] !== undefined && row[field.key] !== null,
          `${table}.${field.key} is required but missing on ${String(row.id)}`
        );
  }
});

test("foreign keys match the application's references", () => {
  const fks = new Set<string>();
  for (const table of TABLES) {
    const keys = keyOf(table);
    for (const fk of getTableConfig(TABLE_SCHEMA[table]).foreignKeys) {
      const ref = fk.reference();
      assert.equal(ref.columns.length, 1, `${table}: single-column keys`);
      fks.add(
        `${table}.${keys.get(ref.columns[0]!.name)}→${tableOfName.get(getTableName(ref.foreignTable))}`
      );
    }
  }
  const refs = new Set(
    REFERENCES.map(([t, f, target]) => `${t}.${f}→${target}`)
  );
  assert.deepEqual(
    [...fks].filter(k => !refs.has(k)).sort(),
    [],
    "FKs the integrity rules miss"
  );
  assert.deepEqual(
    [...refs].filter(k => !fks.has(k)).sort(),
    [],
    "references without an FK"
  );
});

test("unique constraints match the application's natural keys", () => {
  const constraints = new Set<string>();
  for (const table of TABLES) {
    const keys = keyOf(table);
    const config = getTableConfig(TABLE_SCHEMA[table]);
    for (const index of config.indexes.filter(i => i.config.unique))
      constraints.add(
        `${table}:${index.config.columns
          .map(c => keys.get((c as { name: string }).name))
          .join("+")}`
      );
    for (const unique of config.uniqueConstraints)
      constraints.add(
        `${table}:${unique.columns.map(c => keys.get(c.name)).join("+")}`
      );
    for (const column of config.columns.filter(c => c.isUnique))
      constraints.add(`${table}:${keys.get(column.name)}`);
  }
  const keys = new Set(
    UNIQUE_KEYS.map(([t, fields]) => `${t}:${fields.join("+")}`)
  );
  assert.deepEqual([...constraints].filter(k => !keys.has(k)).sort(), []);
  assert.deepEqual([...keys].filter(k => !constraints.has(k)).sort(), []);
});

test("calendar dates are DATE columns and moments are timestamps", () => {
  const db = seededDatabase();
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/;
  const instant = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
  for (const table of TABLES) {
    const rows = db[table] as unknown as Array<Record<string, unknown>>;
    for (const [key, column] of Object.entries(
      getTableColumns(TABLE_SCHEMA[table]) as Record<string, Column>
    )) {
      const values = rows.map(r => r[key]).filter(v => v !== undefined);
      if (column.columnType === "PgDateString")
        for (const v of values)
          assert.match(String(v), dateOnly, `${table}.${key} is a date`);
      else if (column.columnType === "PgTimestampString")
        for (const v of values)
          assert.match(String(v), instant, `${table}.${key} is a moment`);
      else
        for (const v of values)
          assert.ok(
            typeof v !== "string" || !instant.test(v),
            `${table}.${key} holds timestamps but is ${column.columnType}`
          );
    }
  }
});

test("every migration creates deferrable foreign keys", () => {
  const dir = join(process.cwd(), "drizzle");
  const migrations = readdirSync(dir).filter(name => name.endsWith(".sql"));
  assert.ok(migrations.length > 0);
  let total = 0;
  for (const name of migrations) {
    const sql = readFileSync(join(dir, name), "utf8");
    for (const line of sql.split("\n").filter(l => l.includes("FOREIGN KEY"))) {
      total += 1;
      assert.match(
        line,
        /DEFERRABLE INITIALLY DEFERRED;(--> statement-breakpoint)?$/,
        `${name}: ${line.slice(0, 80)}`
      );
    }
  }
  assert.ok(total >= REFERENCES.length, "a foreign key for every reference");
});

test("the migration journal lists every migration file", () => {
  const dir = join(process.cwd(), "drizzle");
  const journal = JSON.parse(
    readFileSync(join(dir, "meta", "_journal.json"), "utf8")
  ) as { entries: Array<{ tag: string }> };
  const files = readdirSync(dir)
    .filter(name => name.endsWith(".sql"))
    .map(name => name.replace(/\.sql$/, ""))
    .sort();
  assert.deepEqual(journal.entries.map(e => e.tag).sort(), files);
});
