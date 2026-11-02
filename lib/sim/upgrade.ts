import { DEFAULT_ROLES } from "../rbac";
import type { Database, Role, Staff, User } from "./schema";

/** Additive v8 → v9 adoption. Existing clinical and user-created data stays intact. */
export function upgradeV8ToV9(db: Database, fresh: Database) {
  db.radiologyProcedures = fresh.radiologyProcedures.map(row => ({ ...row }));
  db.radiologyEquipment = fresh.radiologyEquipment.map(row => ({ ...row }));
  db.radiologyOrders = [];
  db.radiologySafetyAssessments = [];
  db.radiologyStudies = [];
  db.radiologyReports = [];
  db.radiologyCommunications = [];
  db.radiologyEquipmentEvents = [];

  let department = db.departments.find(row => row.code === "RAD");
  if (!department) {
    const source = fresh.departments.find(row => row.code === "RAD")!;
    department = { ...source, id: "dep_radiology_v9" };
    db.departments.push(department);
  }

  for (const roleId of ["RADIOLOGIST", "RADIOLOGY_TECHNICIAN"] as const) {
    if (db.roles.some(row => row.id === roleId)) continue;
    const definition = DEFAULT_ROLES[roleId];
    const source = fresh.roles.find(row => row.id === roleId);
    const at = db.meta.anchoredAt;
    db.roles.push({
      id: roleId,
      name: definition.name,
      description: definition.description,
      modules: [...definition.modules],
      actions: [...definition.actions],
      homePath: definition.homePath,
      system: true,
      createdAt: source?.createdAt ?? at,
      updatedAt: source?.updatedAt ?? at,
    } satisfies Role);
  }

  const grants: Array<[string, string[], string[]]> = [
    ["RECEPTIONIST", ["radiology"], ["radiology.schedule"]],
    ["DOCTOR", ["radiology"], ["radiology.order", "radiology.acknowledge"]],
    ["BILLING_EXECUTIVE", ["radiology"], []],
    ["OPERATIONS_MANAGER", ["radiology"], []],
  ];
  for (const [id, modules, actions] of grants) {
    const role = db.roles.find(row => row.id === id);
    if (!role?.system) continue;
    role.modules = [...new Set([...role.modules, ...modules])];
    role.actions = [...new Set([...role.actions, ...actions])];
  }

  const people = fresh.staff.filter(
    row => row.role === "RADIOLOGIST" || row.role === "RADIOLOGY_TECHNICIAN"
  );
  const maxStaffNum = db.staff.reduce((max, s) => {
    const match = /^EMP-(\d+)$/.exec(s.staffCode);
    return match ? Math.max(max, parseInt(match[1]!, 10)) : max;
  }, 0);

  people.forEach((source, index) => {
    if (db.staff.some(row => row.role === source.role)) return;
    const staffId = `staff_radiology_v9_${index + 1}`;
    const nextNum = maxStaffNum + index + 1;
    const staffCode = `EMP-${String(nextNum).padStart(4, "0")}`;
    const phone = `98${String(22000000 + nextNum * 7919).slice(0, 8)}`;
    db.staff.push({
      ...source,
      id: staffId,
      staffCode,
      phone,
      departmentId: department!.id,
    } satisfies Staff);
    const login = fresh.users.find(row => row.staffId === source.id);
    if (login) {
      const username = db.users.some(u => u.username === login.username)
        ? `${login.username}-v9`
        : login.username;
      db.users.push({
        ...login,
        id: `user_radiology_v9_${index + 1}`,
        staffId,
        username,
      } satisfies User);
    }
  });
  db.meta.schemaVersion = 9;
  return db;
}
