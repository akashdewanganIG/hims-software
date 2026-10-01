/**
 * The transaction journal: atomic rollback and exact change sets, on a
 * small table set where every expectation can be spelled out.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { transact, transactTracked } from "../lib/sim/journal";

type Row = { id: string; v: number; nested?: { x: number; list: number[] } };
function fixture() {
  return {
    meta: { counters: { n: 1 } as Record<string, number> },
    a: [
      { id: "1", v: 1, nested: { x: 1, list: [1] } },
      { id: "2", v: 2 },
      { id: "3", v: 3 },
    ] as Row[],
    b: [] as Row[],
  };
}

test("rollback restores every kind of write", () => {
  const db = fixture();
  const before = structuredClone(db);
  assert.throws(() =>
    transact(db, draft => {
      draft.a.push({ id: "4", v: 4 });
      draft.a[0]!.v = 100;
      draft.a[0]!.nested!.list.push(2);
      delete (draft.a[1] as Partial<Row>).v;
      draft.a.splice(2, 1);
      draft.b = draft.a.filter(r => r.v > 3);
      draft.meta.counters.n = 2;
      throw new Error("refused");
    })
  );
  assert.deepStrictEqual(db, before);
});

test("change sets list inserts, updates, deletes and meta exactly", () => {
  const db = fixture();
  const { changes } = transactTracked(db, draft => {
    draft.a.push({ id: "4", v: 4 });
    draft.a[0]!.nested!.x = 9;
    const gone = draft.a.findIndex(r => r.id === "2");
    draft.a.splice(gone, 1);
    draft.meta.counters.n = (draft.meta.counters.n ?? 0) + 1;
  });
  assert.deepEqual(changes.upserts.a!.map(r => r.id).sort(), ["1", "4"]);
  assert.deepEqual(changes.deletes.a, ["2"]);
  assert.deepEqual(changes.singles, ["meta"]);
  assert.equal(changes.upserts.b, undefined);
  // Values are the committed state.
  assert.equal(
    (changes.upserts.a!.find(r => r.id === "1") as Row).nested!.x,
    9
  );
});

test("whole-table replacement is diffed by row", () => {
  const db = fixture();
  const { changes } = transactTracked(db, draft => {
    draft.a = draft.a.filter(r => r.id !== "3");
    draft.b = [{ id: "9", v: 9 }];
  });
  assert.deepEqual(changes.deletes.a, ["3"]);
  assert.equal(changes.upserts.a, undefined, "kept rows are not rewritten");
  assert.deepEqual(
    changes.upserts.b!.map(r => r.id),
    ["9"]
  );
});

test("a row added then removed in one transaction leaves no trace", () => {
  const db = fixture();
  const { changes } = transactTracked(db, draft => {
    draft.a.push({ id: "5", v: 5 });
    draft.a.pop();
  });
  assert.equal(changes.upserts.a, undefined);
  assert.ok(!(changes.deletes.a ?? []).includes("1"));
});

test("rollback after commit undoes a tracked transaction", () => {
  const db = fixture();
  const before = structuredClone(db);
  const tracked = transactTracked(db, draft => {
    draft.a[1]!.v = 20;
    draft.b.push({ id: "7", v: 7 });
    return draft.a[1];
  });
  assert.equal(db.a[1]!.v, 20);
  assert.deepEqual(
    tracked.result,
    { id: "2", v: 20 },
    "results are unwrapped rows"
  );
  tracked.rollback();
  assert.deepStrictEqual(db, before);
});

test("no proxy leaks into stored data", () => {
  const db = fixture();
  transact(db, draft => {
    const row = draft.a[0]!;
    draft.b.push(row);
    draft.b[0]!.v = 50;
  });
  assert.equal(db.b[0], db.a[0], "the stored row is the raw object");
  assert.equal(db.a[0]!.v, 50);
});
