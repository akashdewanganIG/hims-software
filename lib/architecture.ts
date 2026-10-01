/**
 * The map behind Guide → Architecture & Flows: every module, the hand-offs
 * between them, and the hospital workflows that run through them. Routes
 * are real application routes; modules and actions are the access keys of
 * lib/rbac.ts, so the page can show each login only what its access covers.
 *
 * Adding a module or a workflow is a data change: append it here and the
 * page, its search and its filtering pick it up.
 */
import type { Action, Module } from "./rbac";

export type AreaId =
  | "front"
  | "clinical"
  | "services"
  | "operations"
  | "finance"
  | "quality"
  | "platform";

export const ARCH_AREAS: Array<{
  id: AreaId;
  label: string;
  description: string;
}> = [
  {
    id: "front",
    label: "Front office",
    description:
      "First contact: enquiries, registration and the patient record.",
  },
  {
    id: "clinical",
    label: "Clinical care",
    description: "Outpatient consultations and inpatient stays.",
  },
  {
    id: "services",
    label: "Clinical services",
    description: "Pharmacy and laboratory, fed by clinical orders.",
  },
  {
    id: "operations",
    label: "Hospital operations",
    description: "Beds, staffing and the live command centre.",
  },
  {
    id: "finance",
    label: "Finance & records",
    description:
      "Where every service settles: bills, collections and case files.",
  },
  {
    id: "quality",
    label: "Quality & performance",
    description: "Complaints, feedback and the performance trends.",
  },
  {
    id: "platform",
    label: "Home & administration",
    description: "Each login's home, and who may do what.",
  },
];

export interface ArchPage {
  label: string;
  /** Absent for pages reached from a record (a visit, an admission). */
  route?: string;
  description: string;
}

export interface ArchModule {
  module: Module;
  area: AreaId;
  label: string;
  description: string;
  pages: ArchPage[];
  /** Records this module creates and owns. */
  owns: string[];
}

export const ARCH_MODULES: ArchModule[] = [
  {
    module: "enquiry",
    area: "front",
    label: "Enquiry",
    description:
      "Calls, walk-ins and referrals logged with follow-up dates, converted into appointments.",
    pages: [
      {
        label: "Enquiries",
        route: "/enquiries",
        description: "Pipeline, follow-ups due and conversions.",
      },
    ],
    owns: ["Enquiries", "Follow-ups"],
  },
  {
    module: "ehr",
    area: "front",
    label: "Registration & EHR",
    description:
      "One patient master (UHID) every module shares, with documents and the clinical timeline.",
    pages: [
      {
        label: "Patients",
        route: "/patients",
        description: "Search, register and update patients.",
      },
      {
        label: "Patient record",
        description: "Visits, admissions, results, bills and documents.",
      },
    ],
    owns: ["Patients", "Documents"],
  },
  {
    module: "opd",
    area: "clinical",
    label: "OPD",
    description:
      "Appointments from the doctor roster, check-in with tokens, triage vitals, consultation and e-prescriptions.",
    pages: [
      {
        label: "OPD queue",
        route: "/opd",
        description: "Today's tokens, waiting times and walk-ins.",
      },
      {
        label: "Appointments",
        route: "/opd/appointments",
        description: "Bookings, reschedules, no-shows and cancellations.",
      },
      {
        label: "Token display",
        route: "/opd/display",
        description: "Waiting-area screen: now serving and next tokens.",
      },
      {
        label: "Consultation",
        description: "Vitals, diagnosis, orders, advice; prints the Rx.",
      },
    ],
    owns: ["Appointments", "OPD encounters", "Prescriptions"],
  },
  {
    module: "ipd",
    area: "clinical",
    label: "IPD",
    description:
      "Admissions to rule-checked beds, rounds and nursing notes, care orders, transfers, clearance and discharge.",
    pages: [
      {
        label: "Inpatients",
        route: "/ipd",
        description: "Everyone admitted, by ward and status.",
      },
      {
        label: "Admission record",
        description: "Notes, orders, bed history, billing and discharge.",
      },
    ],
    owns: [
      "Admissions",
      "Clinical notes",
      "Care orders",
      "Discharge summaries",
    ],
  },
  {
    module: "pharmacy",
    area: "services",
    label: "Pharmacy",
    description:
      "Prescription queue with first-expiry-first-out dispensing, counter (OTC) sales, returns and batch-wise stock.",
    pages: [
      {
        label: "Prescription queue",
        route: "/pharmacy",
        description: "Dispense e-prescriptions; sell over the counter.",
      },
      {
        label: "Inventory",
        route: "/pharmacy/inventory",
        description: "Stock by batch, goods receipts (GRN), write-offs.",
      },
      {
        label: "Transactions",
        route: "/pharmacy/transactions",
        description: "Every stock movement and the bill it posted to.",
      },
    ],
    owns: ["Medicine batches", "Pharmacy transactions"],
  },
  {
    module: "lab",
    area: "services",
    label: "Laboratory",
    description:
      "Orders to samples, results with reference ranges and critical flags, second-person verification and reports.",
    pages: [
      {
        label: "Lab worklist",
        route: "/lab",
        description: "Collection, processing, entry and verification.",
      },
      {
        label: "Lab report",
        description: "Printable report once verified.",
      },
    ],
    owns: ["Lab orders", "Results"],
  },
  {
    module: "beds",
    area: "operations",
    label: "Bed management",
    description:
      "Live bed board: occupancy, reservations and housekeeping turnaround.",
    pages: [
      {
        label: "Bed board",
        route: "/beds",
        description: "Every bed by ward with its status.",
      },
    ],
    owns: ["Beds", "Bed assignments"],
  },
  {
    module: "operations",
    area: "operations",
    label: "Operations centre",
    description:
      "Hospital-wide situation: queues, occupancy, lab TAT, staffing and alerts.",
    pages: [
      {
        label: "Command centre",
        route: "/operations",
        description: "Alerts and live figures across departments.",
      },
    ],
    owns: [],
  },
  {
    module: "wfm",
    area: "operations",
    label: "Workforce (WFM)",
    description:
      "The staff master and shift rosters that decide doctor availability and who is on duty.",
    pages: [
      {
        label: "Staff",
        route: "/wfm",
        description: "Directory, status and new staff.",
      },
      {
        label: "Roster",
        route: "/wfm/roster",
        description: "Weekly shifts by department.",
      },
    ],
    owns: ["Staff", "Shifts", "Roster"],
  },
  {
    module: "billing",
    area: "finance",
    label: "Billing",
    description:
      "Bills filled automatically by every service, payments and deposits, discounts, refunds and the day-end closing.",
    pages: [
      {
        label: "Bills",
        route: "/billing",
        description: "Open, paid and final bills; collect and refund.",
      },
      {
        label: "Day-end collection",
        route: "/billing/collections",
        description: "Receipts by method, source and cashier.",
      },
    ],
    owns: ["Invoices", "Invoice lines", "Payments"],
  },
  {
    module: "mrd",
    area: "finance",
    label: "Medical records (MRD)",
    description:
      "OPD case sheets and IPD case files: completeness checks, review, archiving and access log.",
    pages: [
      {
        label: "Medical records",
        route: "/mrd",
        description: "Records to review, incomplete files, archive.",
      },
    ],
    owns: ["Medical records", "Access log"],
  },
  {
    module: "complaints",
    area: "quality",
    label: "Complaints",
    description:
      "Grievances with response targets by priority, owners, notes and resolution.",
    pages: [
      {
        label: "Complaints",
        route: "/complaints",
        description: "Open, overdue and resolved complaints.",
      },
    ],
    owns: ["Complaints", "Complaint notes"],
  },
  {
    module: "feedback",
    area: "quality",
    label: "Feedback",
    description:
      "Patient ratings after visits and stays, with follow-up calls.",
    pages: [
      {
        label: "Feedback",
        route: "/feedback",
        description: "Scores, comments and follow-ups.",
      },
    ],
    owns: ["Feedback"],
  },
  {
    module: "analytics",
    area: "quality",
    label: "Hospital performance",
    description:
      "Trends over 7–30 days: volumes, revenue, waits and occupancy.",
    pages: [
      {
        label: "Hospital performance",
        route: "/analytics",
        description: "KPIs and daily trends.",
      },
    ],
    owns: [],
  },
  {
    module: "dashboard",
    area: "platform",
    label: "Dashboard",
    description:
      "Each login's home: figures, work queues and alerts for its own areas only.",
    pages: [
      {
        label: "Dashboard",
        route: "/",
        description: "My work, needs attention, my modules.",
      },
    ],
    owns: [],
  },
  {
    module: "admin",
    area: "platform",
    label: "User management",
    description:
      "Logins, roles and permissions. The sign-in screen and every access check read from here.",
    pages: [
      {
        label: "User management",
        route: "/admin/users",
        description: "Users, roles & permissions, audit log.",
      },
    ],
    owns: ["Roles", "Logins"],
  },
];

export type RelationKind = "handoff" | "charge" | "shared" | "record";

export const RELATION_LABEL: Record<RelationKind, string> = {
  handoff: "Hands work to",
  charge: "Posts charges to",
  shared: "Shares master data with",
  record: "Files records in",
};

export interface ArchRelation {
  from: Module;
  to: Module;
  label: string;
  kind: RelationKind;
}

export const ARCH_RELATIONS: ArchRelation[] = [
  {
    from: "enquiry",
    to: "opd",
    label: "Converted to an appointment",
    kind: "handoff",
  },
  {
    from: "enquiry",
    to: "ehr",
    label: "Prospect registered as a patient",
    kind: "handoff",
  },
  {
    from: "ehr",
    to: "opd",
    label: "Registered patients book and check in",
    kind: "shared",
  },
  {
    from: "ehr",
    to: "ipd",
    label: "One patient master for admissions",
    kind: "shared",
  },
  {
    from: "wfm",
    to: "opd",
    label: "Doctor rosters decide bookable slots",
    kind: "shared",
  },
  {
    from: "wfm",
    to: "operations",
    label: "Who is on duty now",
    kind: "shared",
  },
  {
    from: "opd",
    to: "pharmacy",
    label: "e-Prescriptions to the dispensing queue",
    kind: "handoff",
  },
  { from: "opd", to: "lab", label: "Investigation orders", kind: "handoff" },
  { from: "opd", to: "ipd", label: "Admission advised", kind: "handoff" },
  {
    from: "opd",
    to: "billing",
    label: "Registration and consultation (free review within 7 days)",
    kind: "charge",
  },
  {
    from: "opd",
    to: "mrd",
    label: "Closed visit files an OPD case sheet",
    kind: "record",
  },
  {
    from: "ipd",
    to: "beds",
    label: "Bed allocation, transfers, release to cleaning",
    kind: "handoff",
  },
  {
    from: "ipd",
    to: "pharmacy",
    label: "Ward medication and take-home prescriptions",
    kind: "handoff",
  },
  {
    from: "ipd",
    to: "lab",
    label: "Ward investigations and sample collection",
    kind: "handoff",
  },
  {
    from: "ipd",
    to: "billing",
    label: "Admission, room, nursing; clearance before discharge",
    kind: "charge",
  },
  {
    from: "ipd",
    to: "mrd",
    label: "Discharge files the IPD case file",
    kind: "record",
  },
  {
    from: "billing",
    to: "ipd",
    label: "Financial clearance unlocks the discharge",
    kind: "handoff",
  },
  {
    from: "pharmacy",
    to: "billing",
    label: "Dispenses, counter sales and returns",
    kind: "charge",
  },
  {
    from: "lab",
    to: "billing",
    label: "Test charges; withdrawn on cancellation",
    kind: "charge",
  },
  {
    from: "lab",
    to: "ehr",
    label: "Verified results in the patient record",
    kind: "record",
  },
  {
    from: "opd",
    to: "feedback",
    label: "Feedback after the visit",
    kind: "handoff",
  },
  {
    from: "ipd",
    to: "feedback",
    label: "Feedback after discharge",
    kind: "handoff",
  },
  {
    from: "ehr",
    to: "complaints",
    label: "Complaints linked to the patient and visit",
    kind: "shared",
  },
];

export type StepKind = "start" | "action" | "auto" | "decision" | "end";

export interface FlowStep {
  id: string;
  label: string;
  kind: StepKind;
  /** The module the step happens in (none: happens anywhere). */
  module?: Module;
  /** Who can do it — logins holding this action. */
  action?: Action;
  route?: string;
  note?: string;
  /** Override the next sequential step. `null` ends this branch. */
  next?: string | null;
  /** A decision's outcomes: labels and the step each leads to. */
  branches?: Array<{ label: string; to: string }>;
}

export type FlowCategory =
  | "Front office"
  | "Clinical"
  | "Pharmacy & lab"
  | "Finance & records"
  | "Operations & quality"
  | "Administration";

export const FLOW_CATEGORIES: FlowCategory[] = [
  "Front office",
  "Clinical",
  "Pharmacy & lab",
  "Finance & records",
  "Operations & quality",
  "Administration",
];

export interface UserFlow {
  id: string;
  title: string;
  summary: string;
  category: FlowCategory;
  steps: FlowStep[];
}

export const USER_FLOWS: UserFlow[] = [
  {
    id: "sign-in",
    title: "Sign in and role-based access",
    summary:
      "Every login works through its role (or custom access): menus, pages and buttons follow it, and the server refuses everything else.",
    category: "Administration",
    steps: [
      {
        id: "s1",
        label: "Choose a role and a login on the sign-in screen",
        kind: "start",
        route: "/login",
      },
      {
        id: "s2",
        label: "Session carries the role's modules and actions",
        kind: "auto",
      },
      {
        id: "s3",
        label: "Land on the role's landing page",
        kind: "action",
        module: "dashboard",
        route: "/",
      },
      {
        id: "s4",
        label:
          "Only permitted modules in the menu; only permitted buttons on pages",
        kind: "auto",
      },
      {
        id: "s5",
        label: "Every operation and view is checked again on the server",
        kind: "end",
      },
    ],
  },
  {
    id: "enquiry",
    title: "Enquiry to appointment",
    summary:
      "A call, walk-in or referral becomes a tracked enquiry with follow-ups, and converts into a booking.",
    category: "Front office",
    steps: [
      { id: "e1", label: "Call, walk-in or referral", kind: "start" },
      {
        id: "e2",
        label: "Log the enquiry: reason, department, preferred doctor",
        kind: "action",
        module: "enquiry",
        action: "enquiry.manage",
        route: "/enquiries",
      },
      {
        id: "e3",
        label: "Follow-up calls on the promised dates",
        kind: "action",
        module: "enquiry",
        action: "enquiry.manage",
        note: "Due follow-ups show on the front-office dashboard.",
      },
      {
        id: "e4",
        label: "Ready to book?",
        kind: "decision",
        branches: [
          { label: "Yes", to: "e5" },
          { label: "Not interested", to: "e6" },
        ],
      },
      {
        id: "e5",
        label: "Convert: register the prospect (UHID) and book the slot",
        kind: "action",
        module: "opd",
        action: "appointment.book",
        route: "/opd/appointments",
        next: null,
      },
      {
        id: "e6",
        label: "Close the enquiry with a reason",
        kind: "end",
        module: "enquiry",
        action: "enquiry.manage",
      },
    ],
  },
  {
    id: "opd",
    title: "OPD visit: arrival to settlement",
    summary:
      "Registration, token, triage, consultation and orders, then pharmacy, lab and the bill — the standard outpatient path.",
    category: "Clinical",
    steps: [
      {
        id: "o1",
        label: "Patient arrives with a booking, or walks in",
        kind: "start",
      },
      {
        id: "o2",
        label: "Already registered?",
        kind: "decision",
        branches: [
          { label: "No", to: "o3" },
          { label: "Yes", to: "o4" },
        ],
      },
      {
        id: "o3",
        label: "Register the patient — UHID issued",
        kind: "action",
        module: "ehr",
        action: "patient.register",
        route: "/patients",
      },
      {
        id: "o4",
        label: "Check in and issue a token",
        kind: "action",
        module: "opd",
        action: "appointment.checkin",
        route: "/opd",
        note: "Registration and consultation charges post to the bill; a review with the same doctor within 7 days of a paid visit is free.",
      },
      {
        id: "o5",
        label: "Token called on the waiting-area display",
        kind: "auto",
        module: "opd",
        route: "/opd/display",
      },
      {
        id: "o6",
        label: "Triage vitals",
        kind: "action",
        module: "opd",
        action: "opd.vitals",
      },
      {
        id: "o7",
        label: "Consultation: history, examination, diagnosis, advice",
        kind: "action",
        module: "opd",
        action: "opd.consult",
      },
      {
        id: "o8",
        label: "Orders?",
        kind: "decision",
        branches: [
          { label: "Medicines", to: "o9" },
          { label: "Investigations", to: "o10" },
          { label: "Admission", to: "o11" },
          { label: "None", to: "o12" },
        ],
      },
      {
        id: "o9",
        label: "e-Prescription (allergy-checked); print the Rx",
        kind: "action",
        module: "opd",
        action: "opd.consult",
        next: "o13",
      },
      {
        id: "o10",
        label: "Lab orders sent to the lab worklist",
        kind: "action",
        module: "lab",
        action: "lab.order",
        next: "o12",
      },
      {
        id: "o11",
        label: "Admission advised — continues in the IPD flow",
        kind: "action",
        module: "ipd",
        action: "ipd.admit",
        next: null,
      },
      {
        id: "o12",
        label: "Close the visit — OPD case sheet filed in MRD",
        kind: "action",
        module: "opd",
        action: "opd.consult",
        next: "o14",
      },
      {
        id: "o13",
        label: "Pharmacy dispenses first-expiry-first-out onto the bill",
        kind: "action",
        module: "pharmacy",
        action: "pharmacy.dispense",
        route: "/pharmacy",
      },
      {
        id: "o14",
        label: "Billing desk collects payment",
        kind: "action",
        module: "billing",
        action: "billing.collect",
        route: "/billing",
      },
      { id: "o15", label: "Visit complete; feedback invited", kind: "end" },
    ],
  },
  {
    id: "ipd",
    title: "IPD: admission to discharge",
    summary:
      "Admission to a suitable bed, the stay, then discharge with the summary, billing clearance and bed turnaround.",
    category: "Clinical",
    steps: [
      {
        id: "i1",
        label: "Admission advised in OPD, direct or referral",
        kind: "start",
      },
      {
        id: "i2",
        label: "Admit to a bed the ward rules allow (gender, age)",
        kind: "action",
        module: "ipd",
        action: "ipd.admit",
        route: "/ipd",
        note: "The admission fee posts to the running bill.",
      },
      {
        id: "i3",
        label: "IP advance deposit",
        kind: "action",
        module: "billing",
        action: "billing.collect",
      },
      {
        id: "i4",
        label: "Rounds, nursing notes and care orders",
        kind: "action",
        module: "ipd",
        action: "ipd.note",
      },
      {
        id: "i5",
        label: "Ward medication and investigations",
        kind: "action",
        module: "pharmacy",
        action: "pharmacy.dispense",
      },
      {
        id: "i6",
        label: "Transfer needed?",
        kind: "decision",
        branches: [
          { label: "Yes", to: "i7" },
          { label: "No", to: "i8" },
        ],
      },
      {
        id: "i7",
        label: "Request and complete the bed transfer",
        kind: "action",
        module: "ipd",
        action: "ipd.transfer",
        route: "/beds",
      },
      {
        id: "i8",
        label: "Initiate discharge",
        kind: "action",
        module: "ipd",
        action: "ipd.discharge",
      },
      {
        id: "i9",
        label: "Finalise the discharge summary; take-home medicines",
        kind: "action",
        module: "ipd",
        action: "ipd.discharge",
      },
      {
        id: "i10",
        label:
          "Billing clearance: settle the final bill, or record approved dues",
        kind: "action",
        module: "billing",
        action: "billing.collect",
        note: "Includes today's room and nursing charges. Discharge stays locked until billing clears it.",
      },
      {
        id: "i11",
        label: "Discharge: bed to cleaning, final bill, IPD case file to MRD",
        kind: "action",
        module: "ipd",
        action: "ipd.discharge",
      },
      {
        id: "i12",
        label: "Housekeeping marks the bed available",
        kind: "action",
        module: "beds",
        action: "beds.housekeeping",
        route: "/beds",
      },
      { id: "i13", label: "Patient discharged", kind: "end" },
    ],
  },
  {
    id: "lab",
    title: "Lab: order to verified report",
    summary:
      "Orders become samples, results are flagged against reference ranges, and a second person verifies before release.",
    category: "Pharmacy & lab",
    steps: [
      {
        id: "l1",
        label: "Test ordered from OPD or the ward",
        kind: "start",
        module: "lab",
        action: "lab.order",
      },
      {
        id: "l2",
        label: "Sample collected — sample ID assigned",
        kind: "action",
        module: "lab",
        action: "lab.collect",
        route: "/lab",
      },
      {
        id: "l3",
        label: "Processing",
        kind: "action",
        module: "lab",
        action: "lab.result",
      },
      {
        id: "l4",
        label: "Results entered; flags and critical values marked",
        kind: "action",
        module: "lab",
        action: "lab.result",
      },
      {
        id: "l5",
        label: "Verified by a second person?",
        kind: "decision",
        branches: [
          { label: "Correct first", to: "l4" },
          { label: "Verify", to: "l6" },
        ],
      },
      {
        id: "l6",
        label: "Verify and release the report",
        kind: "action",
        module: "lab",
        action: "lab.verify",
      },
      {
        id: "l7",
        label: "Report printable; results in the patient record",
        kind: "end",
        module: "ehr",
      },
    ],
  },
  {
    id: "dispense",
    title: "Pharmacy: prescription to dispense",
    summary:
      "e-Prescriptions queue up, dispense first-expiry-first-out (partially if needed) and post to the patient's bill.",
    category: "Pharmacy & lab",
    steps: [
      {
        id: "p1",
        label: "e-Prescription arrives in the queue",
        kind: "start",
        module: "pharmacy",
        route: "/pharmacy",
      },
      {
        id: "p2",
        label: "Dispense from the earliest-expiring usable batch",
        kind: "action",
        module: "pharmacy",
        action: "pharmacy.dispense",
        note: "Each draw posts a pharmacy line to the bill.",
      },
      {
        id: "p3",
        label: "Everything collected?",
        kind: "decision",
        branches: [
          { label: "Yes", to: "p5" },
          { label: "Balance left", to: "p4" },
        ],
      },
      {
        id: "p4",
        label: "Close the uncollected balance with a reason",
        kind: "action",
        module: "pharmacy",
        action: "pharmacy.dispense",
      },
      {
        id: "p5",
        label: "Returns credit the original bill",
        kind: "end",
        module: "pharmacy",
        action: "pharmacy.dispense",
      },
    ],
  },
  {
    id: "counter",
    title: "Pharmacy counter (OTC) sale",
    summary:
      "Over-the-counter medicines for a registered patient on a bill of their own; Schedule H needs a prescription.",
    category: "Pharmacy & lab",
    steps: [
      {
        id: "c1",
        label: "Customer at the pharmacy counter",
        kind: "start",
        module: "pharmacy",
      },
      {
        id: "c2",
        label: "Prescription-only (Schedule H)?",
        kind: "decision",
        branches: [
          { label: "Yes", to: "c3" },
          { label: "No", to: "c4" },
        ],
      },
      {
        id: "c3",
        label: "Refused — dispense only against a doctor's prescription",
        kind: "end",
        module: "pharmacy",
      },
      {
        id: "c4",
        label: "Sell on a new pharmacy bill (FEFO batches)",
        kind: "action",
        module: "pharmacy",
        action: "pharmacy.dispense",
        route: "/pharmacy",
      },
      {
        id: "c5",
        label: "Pay now?",
        kind: "decision",
        branches: [
          { label: "Yes", to: "c6" },
          { label: "Later", to: "c7" },
        ],
      },
      {
        id: "c6",
        label: "Paid at the counter",
        kind: "end",
        module: "pharmacy",
      },
      {
        id: "c7",
        label: "Open bill collected by the billing desk",
        kind: "end",
        module: "billing",
        action: "billing.collect",
      },
    ],
  },
  {
    id: "stock",
    title: "Stock: goods receipt to write-off",
    summary:
      "Stock arrives against the supplier's invoice (GRN), is issued first-expiry-first-out and written off when it cannot be used.",
    category: "Pharmacy & lab",
    steps: [
      { id: "g1", label: "Supplier delivery with an invoice", kind: "start" },
      {
        id: "g2",
        label:
          "Receive stock (GRN): supplier, invoice no., batch, expiry, cost",
        kind: "action",
        module: "pharmacy",
        action: "pharmacy.stock",
        route: "/pharmacy/inventory",
      },
      {
        id: "g3",
        label: "Issues draw the earliest-expiring usable batch",
        kind: "auto",
        module: "pharmacy",
      },
      {
        id: "g4",
        label: "Expired or damaged?",
        kind: "decision",
        branches: [
          { label: "Yes", to: "g5" },
          { label: "No", to: "g6" },
        ],
      },
      {
        id: "g5",
        label: "Write off the batch",
        kind: "action",
        module: "pharmacy",
        action: "pharmacy.stock",
      },
      {
        id: "g6",
        label: "Low stock shows on the dashboard to reorder",
        kind: "end",
        module: "pharmacy",
      },
    ],
  },
  {
    id: "billing",
    title: "Billing and day-end collection",
    summary:
      "Charges post themselves from every service; the desk collects, adjusts and refunds, and closes the day.",
    category: "Finance & records",
    steps: [
      {
        id: "b1",
        label: "Charges post automatically from OPD, IPD, lab and pharmacy",
        kind: "start",
        module: "billing",
      },
      {
        id: "b2",
        label: "Manual charges and discounts",
        kind: "action",
        module: "billing",
        action: "billing.adjust",
        route: "/billing",
      },
      {
        id: "b3",
        label: "Collect payment: cash, card, UPI, net banking",
        kind: "action",
        module: "billing",
        action: "billing.collect",
      },
      {
        id: "b4",
        label: "Paid more than the bill?",
        kind: "decision",
        branches: [
          { label: "Yes", to: "b5" },
          { label: "No", to: "b6" },
        ],
      },
      {
        id: "b5",
        label: "Refund the excess",
        kind: "action",
        module: "billing",
        action: "billing.refund",
      },
      {
        id: "b6",
        label: "Day-end closing by method, source and cashier",
        kind: "end",
        module: "billing",
        route: "/billing/collections",
      },
    ],
  },
  {
    id: "mrd",
    title: "Medical records completion",
    summary:
      "Closed visits and discharges file case records that MRD checks, reviews and archives.",
    category: "Finance & records",
    steps: [
      { id: "m1", label: "Visit closed or patient discharged", kind: "start" },
      {
        id: "m2",
        label: "Record filed with its completeness checklist",
        kind: "auto",
        module: "mrd",
      },
      {
        id: "m3",
        label: "Complete?",
        kind: "decision",
        branches: [
          { label: "Missing items", to: "m4" },
          { label: "Complete", to: "m5" },
        ],
      },
      {
        id: "m4",
        label: "Return to the ward for the missing items",
        kind: "action",
        module: "mrd",
        action: "mrd.manage",
        route: "/mrd",
        next: "m3",
      },
      {
        id: "m5",
        label: "Review and sign off",
        kind: "action",
        module: "mrd",
        action: "mrd.manage",
      },
      {
        id: "m6",
        label: "Archive",
        kind: "end",
        module: "mrd",
        action: "mrd.manage",
      },
    ],
  },
  {
    id: "beds",
    title: "Bed turnaround",
    summary:
      "A vacated bed is cleaned and made available, or held for an admission.",
    category: "Operations & quality",
    steps: [
      {
        id: "t1",
        label: "Discharge or transfer vacates the bed",
        kind: "start",
        module: "ipd",
      },
      {
        id: "t2",
        label: "Housekeeping: cleaning",
        kind: "action",
        module: "beds",
        action: "beds.housekeeping",
        route: "/beds",
      },
      {
        id: "t3",
        label: "Mark available — or reserve for an admission",
        kind: "action",
        module: "beds",
        action: "beds.housekeeping",
      },
      { id: "t4", label: "Bed ready", kind: "end", module: "beds" },
    ],
  },
  {
    id: "complaints",
    title: "Complaint handling",
    summary:
      "Complaints carry a response target by priority, an owner and a trail of notes to resolution.",
    category: "Operations & quality",
    steps: [
      {
        id: "q1",
        label: "Complaint logged — target date from its priority",
        kind: "start",
        module: "complaints",
        action: "complaint.log",
        route: "/complaints",
      },
      {
        id: "q2",
        label: "Assign an owner",
        kind: "action",
        module: "complaints",
        action: "complaint.manage",
      },
      {
        id: "q3",
        label: "Work it with notes",
        kind: "action",
        module: "complaints",
        action: "complaint.manage",
      },
      {
        id: "q4",
        label: "Resolved?",
        kind: "decision",
        branches: [
          { label: "Yes", to: "q5" },
          { label: "Reopened", to: "q3" },
        ],
      },
      {
        id: "q5",
        label: "Resolve and close",
        kind: "end",
        module: "complaints",
        action: "complaint.manage",
      },
    ],
  },
  {
    id: "feedback",
    title: "Feedback follow-up",
    summary:
      "Ratings after visits and stays; poor scores get a follow-up call.",
    category: "Operations & quality",
    steps: [
      {
        id: "f1",
        label: "Feedback recorded after a visit or discharge",
        kind: "start",
        module: "feedback",
        action: "feedback.submit",
        route: "/feedback",
      },
      {
        id: "f2",
        label: "Low score?",
        kind: "decision",
        branches: [
          { label: "Yes", to: "f3" },
          { label: "No", to: "f4" },
        ],
      },
      {
        id: "f3",
        label: "Follow-up call and outcome",
        kind: "action",
        module: "feedback",
        action: "feedback.manage",
      },
      {
        id: "f4",
        label: "Counted in the performance trends",
        kind: "end",
        module: "analytics",
      },
    ],
  },
  {
    id: "wfm",
    title: "Staff and rosters",
    summary:
      "New staff get a login on their job's default role; rosters decide OPD slots and who is on duty.",
    category: "Operations & quality",
    steps: [
      {
        id: "w1",
        label: "Add a staff member",
        kind: "start",
        module: "wfm",
        action: "wfm.manage",
        route: "/wfm",
      },
      {
        id: "w2",
        label: "Login created on the job's default role",
        kind: "auto",
        module: "admin",
      },
      {
        id: "w3",
        label: "Roster shifts week by week (copy a week)",
        kind: "action",
        module: "wfm",
        action: "wfm.manage",
        route: "/wfm/roster",
      },
      {
        id: "w4",
        label: "Rosters drive OPD slots and on-duty counts",
        kind: "end",
        module: "opd",
      },
    ],
  },
  {
    id: "access",
    title: "Users, roles and permissions",
    summary:
      "Administrators decide who may open and do what; changes reach the sign-in screen and signed-in users at once.",
    category: "Administration",
    steps: [
      {
        id: "a1",
        label: "Open User management",
        kind: "start",
        module: "admin",
        action: "users.manage",
        route: "/admin/users",
      },
      {
        id: "a2",
        label: "Create or edit a role: modules, actions, landing page",
        kind: "action",
        module: "admin",
        action: "users.manage",
      },
      {
        id: "a3",
        label: "Give a login a role — or custom access of its own",
        kind: "action",
        module: "admin",
        action: "users.manage",
      },
      {
        id: "a4",
        label: "Disable or delete logins; history stays attributed",
        kind: "action",
        module: "admin",
        action: "users.manage",
      },
      {
        id: "a5",
        label: "Applied at once: sign-in screen, menus and server checks",
        kind: "end",
        module: "admin",
        note: "There is always an active Administrator, and nobody can remove their own access to User management.",
      },
    ],
  },
];
