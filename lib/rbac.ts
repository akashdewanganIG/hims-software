import type { Role, StaffRole, SystemRole, User } from "./sim/schema";

/**
 * Access control. Modules decide which pages a login can open; actions
 * decide which buttons it gets. Both come from the login's role — a row in
 * the `roles` table that Administrators manage from User management — or,
 * for one user, from a custom set. Pages check `canAccess`, buttons `can`,
 * and the server applies the same checks to every operation and view, so a
 * login never sees a control it cannot use and cannot call one either.
 */
export const MODULES = [
  "dashboard",
  "enquiry",
  "opd",
  "ipd",
  "ehr",
  "pharmacy",
  "lab",
  "beds",
  "operations",
  "wfm",
  "billing",
  "mrd",
  "complaints",
  "feedback",
  "analytics",
  "admin",
] as const;
export type Module = (typeof MODULES)[number];

export const MODULE_LABEL: Record<Module, string> = {
  dashboard: "Dashboard",
  enquiry: "Enquiry",
  opd: "OPD",
  ipd: "IPD",
  ehr: "EHR / EMR",
  pharmacy: "Pharmacy",
  lab: "Lab Services",
  beds: "Bed Management",
  operations: "Operations",
  wfm: "WFM",
  billing: "Billing",
  mrd: "MRD",
  complaints: "Complaints",
  feedback: "Feedback",
  analytics: "Hospital Performance",
  admin: "Administration",
};

/** What each module covers — the permissions editor and architecture map. */
export const MODULE_DESCRIPTION: Record<Module, string> = {
  dashboard: "Home page with the signed-in login's own work queues.",
  enquiry: "Front-office enquiries, follow-ups and conversion to bookings.",
  opd: "Appointments, check-in and tokens, vitals, consultation.",
  ipd: "Admissions, ward rounds, care orders, transfers and discharge.",
  ehr: "Patient registration, demographics, documents and history.",
  pharmacy: "Prescription queue, dispensing, returns, stock and batches.",
  lab: "Test orders, sample collection, results and verification.",
  beds: "Bed board, reservations, housekeeping and occupancy.",
  operations: "Live command centre across departments.",
  wfm: "Staff directory, rosters, shifts and duty status.",
  billing: "Bills, payments, deposits, discounts and refunds.",
  mrd: "Medical record completion, review, archiving and access.",
  complaints: "Complaint intake, SLA tracking and resolution.",
  feedback: "Patient feedback, scores and follow-ups.",
  analytics: "Hospital performance trends and KPIs.",
  admin: "User management, roles and permissions, simulation controls.",
};

export const ACTIONS = [
  "patient.register",
  "patient.edit",
  "document.upload",
  "enquiry.manage",
  "appointment.book",
  "appointment.checkin",
  "opd.vitals",
  "opd.consult",
  "ipd.admit",
  "ipd.note",
  "ipd.order",
  "ipd.transfer",
  "ipd.discharge",
  "beds.housekeeping",
  "pharmacy.dispense",
  "pharmacy.stock",
  "lab.order",
  "lab.collect",
  "lab.result",
  "lab.verify",
  "billing.collect",
  "billing.adjust",
  "billing.refund",
  "mrd.manage",
  "complaint.log",
  "complaint.manage",
  "feedback.submit",
  "feedback.manage",
  "wfm.manage",
  "users.manage",
  "simulation.reset",
] as const;
export type Action = (typeof ACTIONS)[number];

/**
 * The module each action belongs to. Granting an action also opens its
 * module — a button is no use on a page its holder cannot reach.
 */
export const ACTION_MODULE: Record<Action, Module> = {
  "patient.register": "ehr",
  "patient.edit": "ehr",
  "document.upload": "ehr",
  "enquiry.manage": "enquiry",
  "appointment.book": "opd",
  "appointment.checkin": "opd",
  "opd.vitals": "opd",
  "opd.consult": "opd",
  "ipd.admit": "ipd",
  "ipd.note": "ipd",
  "ipd.order": "ipd",
  "ipd.transfer": "ipd",
  "ipd.discharge": "ipd",
  "beds.housekeeping": "beds",
  "pharmacy.dispense": "pharmacy",
  "pharmacy.stock": "pharmacy",
  "lab.order": "lab",
  "lab.collect": "lab",
  "lab.result": "lab",
  "lab.verify": "lab",
  "billing.collect": "billing",
  "billing.adjust": "billing",
  "billing.refund": "billing",
  "mrd.manage": "mrd",
  "complaint.log": "complaints",
  "complaint.manage": "complaints",
  "feedback.submit": "feedback",
  "feedback.manage": "feedback",
  "wfm.manage": "wfm",
  "users.manage": "admin",
  "simulation.reset": "admin",
};

/** How the permissions editor describes each action. */
export const ACTION_INFO: Record<Action, { label: string; hint?: string }> = {
  "patient.register": { label: "Register patients" },
  "patient.edit": { label: "Edit patient details" },
  "document.upload": { label: "Upload patient documents" },
  "enquiry.manage": { label: "Log and follow up enquiries" },
  "appointment.book": { label: "Book, reschedule and cancel appointments" },
  "appointment.checkin": { label: "Check patients in and issue tokens" },
  "opd.vitals": { label: "Record vitals" },
  "opd.consult": {
    label: "Consult, prescribe and close visits",
    hint: "Signs diagnoses and prescriptions",
  },
  "ipd.admit": { label: "Admit patients" },
  "ipd.note": { label: "Write progress and nursing notes" },
  "ipd.order": { label: "Place and stop care orders" },
  "ipd.transfer": { label: "Request and complete bed transfers" },
  "ipd.discharge": {
    label: "Discharge patients",
    hint: "Finalises the discharge summary",
  },
  "beds.housekeeping": { label: "Housekeeping and bed reservations" },
  "pharmacy.dispense": { label: "Dispense, sell and take returns" },
  "pharmacy.stock": {
    label: "Receive, adjust and write off stock",
    hint: "Changes stock on hand",
  },
  "lab.order": { label: "Order lab tests" },
  "lab.collect": { label: "Collect samples" },
  "lab.result": { label: "Enter results" },
  "lab.verify": {
    label: "Verify and release reports",
    hint: "Releases results to clinicians",
  },
  "billing.collect": { label: "Collect payments and deposits" },
  "billing.adjust": {
    label: "Add charges and discounts, cancel bills",
    hint: "Changes what patients owe",
  },
  "billing.refund": { label: "Refund payments", hint: "Returns money" },
  "mrd.manage": { label: "Review, complete and archive records" },
  "complaint.log": { label: "Log complaints" },
  "complaint.manage": { label: "Assign, escalate and resolve complaints" },
  "feedback.submit": { label: "Record patient feedback" },
  "feedback.manage": { label: "Follow up feedback" },
  "wfm.manage": { label: "Manage staff, rosters and duty status" },
  "users.manage": {
    label: "Manage users, roles and permissions",
    hint: "Lets the holder grant themselves anything else",
  },
  "simulation.reset": {
    label: "Reset the simulation",
    hint: "Replaces all hospital data",
  },
};

/** Pages a role can land on after signing in, in navigation order. */
export const LANDING_PAGES: Array<{
  path: string;
  label: string;
  module: Module;
}> = [
  { path: "/", label: "Dashboard", module: "dashboard" },
  { path: "/enquiries", label: "Enquiries", module: "enquiry" },
  { path: "/opd", label: "OPD queue", module: "opd" },
  { path: "/opd/appointments", label: "Appointments", module: "opd" },
  { path: "/ipd", label: "Inpatients", module: "ipd" },
  { path: "/patients", label: "Patients (EHR)", module: "ehr" },
  { path: "/pharmacy", label: "Prescription queue", module: "pharmacy" },
  { path: "/pharmacy/inventory", label: "Pharmacy stock", module: "pharmacy" },
  { path: "/lab", label: "Lab worklist", module: "lab" },
  { path: "/beds", label: "Bed board", module: "beds" },
  { path: "/operations", label: "Operations centre", module: "operations" },
  { path: "/wfm", label: "Staff", module: "wfm" },
  { path: "/wfm/roster", label: "Roster", module: "wfm" },
  { path: "/billing", label: "Billing", module: "billing" },
  { path: "/mrd", label: "Medical records", module: "mrd" },
  { path: "/complaints", label: "Complaints", module: "complaints" },
  { path: "/feedback", label: "Feedback", module: "feedback" },
  { path: "/analytics", label: "Hospital performance", module: "analytics" },
  { path: "/admin/users", label: "User management", module: "admin" },
];

const MODULE_SET = new Set<string>(MODULES);
const ACTION_SET = new Set<string>(ACTIONS);
export const isModule = (value: unknown): value is Module =>
  typeof value === "string" && MODULE_SET.has(value);
export const isAction = (value: unknown): value is Action =>
  typeof value === "string" && ACTION_SET.has(value);

/**
 * A grant as stored: known keys only, in canonical order, with what it
 * implies added — every login has a dashboard, and every action opens its
 * module.
 */
export function normaliseGrants(
  modules: readonly string[],
  actions: readonly string[]
): { modules: Module[]; actions: Action[] } {
  const granted = new Set<string>(actions.filter(isAction));
  const open = new Set<string>(modules.filter(isModule));
  open.add("dashboard");
  for (const action of granted) open.add(ACTION_MODULE[action as Action]);
  return {
    modules: MODULES.filter(m => open.has(m)),
    actions: ACTIONS.filter(a => granted.has(a)),
  };
}

/** The role that always has every permission (it cannot lock itself out). */
export const ADMINISTRATOR_ROLE: SystemRole = "ADMINISTRATOR";

export interface RoleDefinition {
  name: string;
  description: string;
  modules: Module[];
  actions: Action[];
  homePath: string;
}

/** A role definition with its grants in canonical, implied-complete form. */
function defineRole(role: RoleDefinition): RoleDefinition {
  return { ...role, ...normaliseGrants(role.modules, role.actions) };
}

/** The roles a new hospital starts with (seeded into `roles`). */
export const DEFAULT_ROLES: Record<SystemRole, RoleDefinition> = {
  ADMINISTRATOR: defineRole({
    name: "Administrator",
    description:
      "Full access to every module, user management and the simulation controls.",
    modules: [...MODULES],
    actions: [...ACTIONS],
    homePath: "/",
  }),
  RECEPTIONIST: defineRole({
    name: "Receptionist",
    description:
      "Front office: enquiries, registration, appointments, check-in, admissions desk and payment collection.",
    modules: [
      "dashboard",
      "enquiry",
      "opd",
      "ipd",
      "ehr",
      "beds",
      "billing",
      "complaints",
      "feedback",
    ],
    actions: [
      "patient.register",
      "patient.edit",
      "document.upload",
      "enquiry.manage",
      "appointment.book",
      "appointment.checkin",
      "ipd.admit",
      "billing.collect",
      "complaint.log",
      "feedback.submit",
    ],
    homePath: "/",
  }),
  DOCTOR: defineRole({
    name: "Doctor",
    description:
      "OPD consultations, prescriptions and lab orders, inpatient rounds, transfers and discharge.",
    modules: [
      "dashboard",
      "opd",
      "ipd",
      "ehr",
      "lab",
      "pharmacy",
      "beds",
      "mrd",
      "feedback",
    ],
    actions: [
      "document.upload",
      "opd.vitals",
      "opd.consult",
      "ipd.admit",
      "ipd.note",
      "ipd.order",
      "ipd.transfer",
      "ipd.discharge",
      "lab.order",
    ],
    homePath: "/opd",
  }),
  NURSE: defineRole({
    name: "Nurse",
    description:
      "Triage vitals, nursing notes, sample collection, bed transfers and housekeeping.",
    modules: [
      "dashboard",
      "opd",
      "ipd",
      "ehr",
      "pharmacy",
      "lab",
      "beds",
      "wfm",
      "complaints",
    ],
    actions: [
      "document.upload",
      "appointment.checkin",
      "opd.vitals",
      "ipd.note",
      "ipd.transfer",
      "beds.housekeeping",
      "lab.collect",
      "complaint.log",
    ],
    homePath: "/",
  }),
  PHARMACIST: defineRole({
    name: "Pharmacist",
    description:
      "Prescription queue, dispensing and counter sales, returns and pharmacy stock.",
    modules: ["dashboard", "ehr", "pharmacy", "billing"],
    actions: ["pharmacy.dispense", "pharmacy.stock"],
    homePath: "/pharmacy",
  }),
  LAB_TECHNICIAN: defineRole({
    name: "Lab Technician",
    description:
      "Sample collection, processing, result entry and report verification.",
    modules: ["dashboard", "ehr", "lab"],
    actions: ["lab.collect", "lab.result", "lab.verify"],
    homePath: "/lab",
  }),
  BILLING_EXECUTIVE: defineRole({
    name: "Billing Executive",
    description:
      "Bills, payments, deposits, discounts, refunds and the day-end collection report.",
    modules: [
      "dashboard",
      "enquiry",
      "opd",
      "ipd",
      "pharmacy",
      "lab",
      "billing",
      "complaints",
    ],
    actions: [
      "billing.collect",
      "billing.adjust",
      "billing.refund",
      "complaint.log",
    ],
    homePath: "/billing",
  }),
  MRD_STAFF: defineRole({
    name: "MRD Staff",
    description:
      "Medical record review and completion, documents, archiving and access requests.",
    modules: ["dashboard", "opd", "ipd", "ehr", "mrd"],
    actions: ["patient.edit", "document.upload", "mrd.manage"],
    homePath: "/mrd",
  }),
  OPERATIONS_MANAGER: defineRole({
    name: "Operations Manager",
    description:
      "Command centre, beds, workforce, complaints, feedback and hospital performance.",
    modules: [
      "dashboard",
      "enquiry",
      "opd",
      "ipd",
      "beds",
      "operations",
      "wfm",
      "billing",
      "mrd",
      "complaints",
      "feedback",
      "analytics",
    ],
    actions: [
      "enquiry.manage",
      "beds.housekeeping",
      "complaint.log",
      "complaint.manage",
      "feedback.submit",
      "feedback.manage",
      "wfm.manage",
    ],
    homePath: "/operations",
  }),
};

/** Job titles for staff categories (the directory and rosters). */
export const STAFF_ROLE_LABEL: Record<StaffRole, string> = {
  ...(Object.fromEntries(
    Object.entries(DEFAULT_ROLES).map(([key, role]) => [key, role.name])
  ) as Record<SystemRole, string>),
  SUPPORT: "Support",
};

export interface Access {
  modules: ReadonlySet<Module>;
  actions: ReadonlySet<Action>;
}

const NO_ACCESS: Access = { modules: new Set(), actions: new Set() };
const FULL_ACCESS: Access = {
  modules: new Set(MODULES),
  actions: new Set(ACTIONS),
};

/** What a login may open and do: its custom set, else its role's. */
export function resolveAccess(
  role: Pick<Role, "id" | "modules" | "actions"> | undefined,
  user?: Pick<User, "customAccess" | "modules" | "actions">
): Access {
  if (!role) return NO_ACCESS;
  if (role.id === ADMINISTRATOR_ROLE) return FULL_ACCESS;
  const source = user?.customAccess ? user : role;
  const { modules, actions } = normaliseGrants(source.modules, source.actions);
  return { modules: new Set(modules), actions: new Set(actions) };
}

/** The same access as plain arrays (sessions, JSON). */
export function accessList(access: Access) {
  return {
    modules: MODULES.filter(m => access.modules.has(m)),
    actions: ACTIONS.filter(a => access.actions.has(a)),
  };
}

export function accessFromList(list: {
  modules: readonly string[];
  actions: readonly string[];
}): Access {
  return {
    modules: new Set(list.modules.filter(isModule)),
    actions: new Set(list.actions.filter(isAction)),
  };
}

export function canAccess(access: Access | undefined, module: Module) {
  return Boolean(access?.modules.has(module));
}

export function can(access: Access | undefined, action: Action) {
  return Boolean(access?.actions.has(action));
}

/** A landing page the access can open: the role's own, else the first. */
export function homeFor(access: Access, homePath: string | undefined) {
  const own = LANDING_PAGES.find(p => p.path === homePath);
  if (own && access.modules.has(own.module)) return own.path;
  return LANDING_PAGES.find(p => access.modules.has(p.module))?.path ?? "/";
}
