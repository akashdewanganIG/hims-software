/**
 * Seeds a fresh simulation in Node and verifies it.
 *
 *   npm run verify:sim
 *
 * Fails (exit 1) on any integrity issue so it can gate changes to the domain
 * services or the seed.
 */
import { invoiceTotals } from "../lib/domain/billing";
import { isInHouse } from "../lib/domain/ipd";
import { checkIntegrity } from "../lib/sim/integrity";
import { generateDatabase } from "../lib/sim/seed";
import { isoDate } from "../lib/sim/time";

const now = new Date();
const { db, stats } = generateDatabase(now);
const today = isoDate(now);

const count = <T>(rows: T[], key: (row: T) => string) =>
  rows.reduce<Record<string, number>>((acc, row) => {
    const k = key(row);
    acc[k] = (acc[k] ?? 0) + 1;
    return acc;
  }, {});

const tables = Object.entries(db)
  .filter(([k]) => k !== "meta")
  .map(([k, v]) => `${k}=${(v as unknown[]).length}`)
  .join("  ");

console.log(
  `\nSimulation seeded in ${stats.ms} ms · ${stats.events} events · ${(JSON.stringify(db).length / 1024 / 1024).toFixed(2)} MB`
);
console.log(`\nTables\n  ${tables}`);
console.log(
  "\nToday's appointments",
  count(
    db.appointments.filter(a => isoDate(a.scheduledAt) === today),
    a => a.status
  )
);
console.log(
  "Future appointments",
  db.appointments.filter(
    a => isoDate(a.scheduledAt) > today && a.status === "SCHEDULED"
  ).length
);
console.log(
  "Admissions",
  count(db.admissions, a => a.status)
);
console.log(
  "Beds",
  count(db.beds, b => b.status),
  `occupancy ${Math.round((db.admissions.filter(isInHouse).length / db.beds.length) * 100)}%`
);
console.log(
  "Lab orders",
  count(db.labOrders, o => o.status)
);
console.log(
  "Prescriptions",
  count(db.prescriptions, p => p.status)
);
console.log(
  "Invoices",
  count(db.invoices, i => i.status)
);
console.log(
  "Revenue collected ₹",
  Math.round(
    db.invoices.reduce((s, i) => s + invoiceTotals(db, i.id).netPaid, 0)
  ).toLocaleString("en-IN")
);
console.log(
  "Enquiries",
  count(db.enquiries, e => e.status)
);
console.log(
  "Complaints",
  count(db.complaints, c => c.status)
);
console.log(
  "Feedback follow-ups",
  count(db.feedback, f => f.followUpStatus)
);
console.log(
  "Medical records",
  count(db.medicalRecords, r => r.status)
);

if (Object.keys(stats.failures).length) {
  console.log(
    "\nSkipped simulation events (domain rules refused them — expected in small numbers):"
  );
  for (const [label, n] of Object.entries(stats.failures))
    console.log(`  ${label}: ${n}`);
  for (const sample of stats.failureSamples.slice(0, 15))
    console.log(`    · ${sample}`);
}

const issues = checkIntegrity(db);
if (issues.length) {
  console.error(`\n✗ ${issues.length} integrity issue(s):`);
  const byRule = count(issues, i => i.rule);
  for (const [rule, n] of Object.entries(byRule))
    console.error(`  ${rule}: ${n}`);
  for (const issue of issues.slice(0, 25))
    console.error(`    · ${issue.rule} — ${issue.detail}`);
  process.exit(1);
}
console.log("\n✓ All integrity rules hold.\n");
