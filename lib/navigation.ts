import {
  Activity,
  BarChart,
  BedIcon,
  CalendarDays,
  ChartNoAxesCombined,
  ChatText,
  FolderOpen,
  HospitalIcon,
  IdCard,
  LayoutGrid,
  ListChecks,
  Microscope,
  Phone,
  Pill,
  PrescriptionIcon,
  QueueIcon,
  ReceiptText,
  Sitemap,
  Smiley,
  Stethoscope,
  UserGear,
  UsersThree,
  Wallet,
  type IconComponent,
} from "@/components/icons";

import type { Module } from "./rbac";

export interface NavLink {
  label: string;
  href: string;
  icon: IconComponent;
  module: Module;
  /** Extra search terms for the command palette. */
  keywords?: string[];
  exact?: boolean;
}

export interface NavEntry extends NavLink {
  children?: NavLink[];
}

export interface NavGroup {
  title?: string;
  items: NavEntry[];
}

export const NAVIGATION: NavGroup[] = [
  {
    items: [
      {
        label: "Dashboard",
        href: "/",
        icon: ChartNoAxesCombined,
        module: "dashboard",
        exact: true,
        keywords: ["home", "overview"],
      },
    ],
  },
  {
    title: "Patient Care",
    items: [
      {
        label: "Enquiry",
        href: "/enquiries",
        icon: Phone,
        module: "enquiry",
        keywords: ["lead", "call", "prospect", "follow-up"],
      },
      {
        label: "OPD",
        href: "/opd",
        icon: Stethoscope,
        module: "opd",
        children: [
          {
            label: "OPD Queue",
            href: "/opd",
            icon: QueueIcon,
            module: "opd",
            exact: true,
            keywords: ["waiting", "consultation", "token", "check-in"],
          },
          {
            label: "Appointments",
            href: "/opd/appointments",
            icon: CalendarDays,
            module: "opd",
            keywords: ["booking", "schedule"],
          },
        ],
      },
      {
        label: "IPD",
        href: "/ipd",
        icon: HospitalIcon,
        module: "ipd",
        keywords: ["admission", "inpatient", "discharge", "ward"],
      },
      {
        label: "EHR / EMR",
        href: "/patients",
        icon: IdCard,
        module: "ehr",
        keywords: ["patient", "record", "history", "uhid", "register"],
      },
    ],
  },
  {
    title: "Clinical Services",
    items: [
      {
        label: "Pharmacy",
        href: "/pharmacy",
        icon: Pill,
        module: "pharmacy",
        children: [
          {
            label: "Prescription Queue",
            href: "/pharmacy",
            icon: PrescriptionIcon,
            module: "pharmacy",
            exact: true,
            keywords: ["dispense", "rx"],
          },
          {
            label: "Inventory",
            href: "/pharmacy/inventory",
            icon: LayoutGrid,
            module: "pharmacy",
            keywords: ["stock", "medicine", "batch", "expiry", "catalogue"],
          },
          {
            label: "Transactions",
            href: "/pharmacy/transactions",
            icon: ListChecks,
            module: "pharmacy",
            keywords: ["ledger", "returns"],
          },
        ],
      },
      {
        label: "Lab Services",
        href: "/lab",
        icon: Microscope,
        module: "lab",
        keywords: ["sample", "test", "result", "report", "pathology"],
      },
    ],
  },
  {
    title: "Hospital Operations",
    items: [
      {
        label: "Bed Management",
        href: "/beds",
        icon: BedIcon,
        module: "beds",
        keywords: ["ward", "occupancy", "cleaning", "transfer"],
      },
      {
        label: "Operations",
        href: "/operations",
        icon: Activity,
        module: "operations",
        keywords: ["command centre", "alerts", "live"],
      },
      {
        label: "WFM",
        href: "/wfm",
        icon: UsersThree,
        module: "wfm",
        children: [
          {
            label: "Staff",
            href: "/wfm",
            icon: UsersThree,
            module: "wfm",
            exact: true,
            keywords: ["employee", "workforce"],
          },
          {
            label: "Roster",
            href: "/wfm/roster",
            icon: CalendarDays,
            module: "wfm",
            keywords: ["shift", "schedule", "duty"],
          },
        ],
      },
    ],
  },
  {
    title: "Administration",
    items: [
      {
        label: "Billing",
        href: "/billing",
        icon: ReceiptText,
        module: "billing",
        children: [
          {
            label: "Bills",
            href: "/billing",
            icon: ReceiptText,
            module: "billing",
            exact: true,
            keywords: ["invoice", "payment", "refund", "bill", "deposit"],
          },
          {
            label: "Day-end Collection",
            href: "/billing/collections",
            icon: Wallet,
            module: "billing",
            keywords: ["cash", "closing", "collection report", "cashier"],
          },
        ],
      },
      {
        label: "MRD",
        href: "/mrd",
        icon: FolderOpen,
        module: "mrd",
        keywords: ["medical records", "archive", "case sheet"],
      },
      {
        label: "Complaints",
        href: "/complaints",
        icon: ChatText,
        module: "complaints",
        keywords: ["grievance", "issue"],
      },
      {
        label: "Feedback",
        href: "/feedback",
        icon: Smiley,
        module: "feedback",
        keywords: ["rating", "review", "satisfaction"],
      },
      {
        label: "User Management",
        href: "/admin/users",
        icon: UserGear,
        module: "admin",
        keywords: ["users", "logins", "roles", "permissions", "access"],
      },
    ],
  },
  {
    title: "Analytics",
    items: [
      {
        label: "Hospital Performance",
        href: "/analytics",
        icon: BarChart,
        module: "analytics",
        keywords: ["kpi", "metrics", "revenue", "trend"],
      },
    ],
  },
  {
    title: "Guide",
    items: [
      {
        // Every login can open it; the page shows only what they can reach.
        label: "Architecture & Flows",
        href: "/architecture",
        icon: Sitemap,
        module: "dashboard",
        keywords: ["map", "workflow", "how it works", "modules", "journey"],
      },
    ],
  },
];

/** One icon per module: that of the first sidebar entry opening it. */
export const MODULE_ICON = new Map<Module, IconComponent>();
for (const group of NAVIGATION)
  for (const item of group.items)
    if (!MODULE_ICON.has(item.module)) MODULE_ICON.set(item.module, item.icon);

/** Longest-prefix module for a path, used to gate pages by role. */
const ROUTE_MODULES: Array<[string, Module]> = [
  ["/enquiries", "enquiry"],
  ["/opd", "opd"],
  ["/ipd", "ipd"],
  ["/patients", "ehr"],
  ["/pharmacy", "pharmacy"],
  ["/lab", "lab"],
  ["/beds", "beds"],
  ["/operations", "operations"],
  ["/wfm", "wfm"],
  ["/billing", "billing"],
  ["/mrd", "mrd"],
  ["/complaints", "complaints"],
  ["/feedback", "feedback"],
  ["/analytics", "analytics"],
  ["/admin", "admin"],
  ["/architecture", "dashboard"],
];

export function moduleForPath(pathname: string): Module | undefined {
  if (pathname === "/") return "dashboard";
  return ROUTE_MODULES.find(
    ([prefix]) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  )?.[1];
}
