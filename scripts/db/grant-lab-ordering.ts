/**
 * One-off data change for an existing database: lets the Lab Technician role
 * place lab orders from Lab Services (new default in lib/rbac). Runs as an
 * active Administrator through the app's own `admin.updateRole` operation,
 * so validation and the audit log apply. Idempotent.
 *
 *   npx tsx scripts/db/grant-lab-ordering.ts
 */
import { prepareCli, targetDatabase } from "./safety";

await prepareCli();
const target = targetDatabase("Role update");
const { readState, runOperation } = await import("../../lib/server/engine");
const { closeDatabase } = await import("../../lib/server/db/client");
const { ADMINISTRATOR_ROLE } = await import("../../lib/rbac");

try {
  const { db } = await readState();
  const role = db.roles.find(r => r.id === "LAB_TECHNICIAN");
  const admin = db.users.find(
    u => u.roleId === ADMINISTRATOR_ROLE && u.status === "ACTIVE"
  );
  if (!role) console.log(`• ${target}: no Lab Technician role; nothing to do.`);
  else if (role.actions.includes("lab.order"))
    console.log(`✓ ${target}: Lab Technician can already order lab tests.`);
  else if (!admin) throw new Error("No active Administrator login to act as.");
  else {
    await runOperation(admin.id, "admin.updateRole", {
      roleId: role.id,
      actions: [...role.actions, "lab.order"],
    });
    console.log(`✓ ${target}: Lab Technician can now order lab tests.`);
  }
} finally {
  await closeDatabase();
}
