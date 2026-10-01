/**
 * Every read the application makes, by name.
 *
 * A view is a pure function of the database, the clock, validated parameters
 * and the signed-in actor. Each declares the modules that may open it — the
 * same module access that gates navigation (`lib/rbac`) — so a role cannot
 * read what its screens would not show. The browser sandbox runs views
 * locally; the server runs them over its PostgreSQL-backed working copy.
 */
import { z } from "zod";

import {
  adminAuditView,
  adminRolesView,
  adminUsersView,
} from "@/features/admin/views";
import { analyticsView } from "@/features/analytics/views";
import { bedBoardView } from "@/features/beds/views";
import {
  billingSummaryView,
  collectionsView,
  invoiceView,
  invoicesView,
} from "@/features/billing/views";
import { dashboardTrendView, dashboardView } from "@/features/dashboard/views";
import {
  enquiriesView,
  enquirySummaryView,
  enquiryView,
} from "@/features/enquiry/views";
import {
  admissionView,
  admissionsView,
  freeBedsView,
} from "@/features/ipd/views";
import { labOrderDetailView, labWorklistView } from "@/features/lab/views";
import {
  medicalRecordView,
  medicalRecordsView,
  mrdSummaryView,
} from "@/features/mrd/views";
import {
  appointmentsView,
  departmentsView,
  doctorOptionsView,
  doctorSlotsView,
  labTestOptionsView,
  medicineOptionsView,
  opdDashboardView,
  patientSearchView,
  staffOptionsView,
  tokenBoardView,
  visitView,
} from "@/features/opd/views";
import { fileView } from "@/features/files/views";
import { operationsView } from "@/features/operations/views";
import { patientRecordView, patientsView } from "@/features/patients/views";
import {
  dispenseDetailView,
  inventoryView,
  prescriptionQueueView,
  transactionsView,
} from "@/features/pharmacy/views";
import {
  complaintSummaryView,
  complaintView,
  complaintsView,
  feedbackSummaryView,
  feedbackView,
  patientEncountersView,
} from "@/features/quality/views";
import {
  rosterView,
  staffListView,
  staffProfileView,
} from "@/features/wfm/views";

import type { Actor } from "../ops/execute";
import type { Module } from "../rbac";
import type { Database } from "../sim/schema";
import { integrityView, loginDirectoryView, searchRecordsView } from "./system";

const none = z.object({});
const id = z.string().trim().min(1).max(80);
const maybeId = id.nullable();
const filter = z.string().max(200).optional();
const date = z.iso.date();
const days = z.number().int().min(1).max(3650);

export interface ViewDef<S extends z.ZodType, R> {
  /** Modules any of which lets a role open the view; [] = any signed-in user. */
  modules: readonly Module[];
  params: S;
  run: (db: Database, now: Date, params: z.output<S>, actor: Actor) => R;
  /** Served without signing in (the sign-in directory only). */
  public?: boolean;
}

function view<S extends z.ZodType, R>(def: ViewDef<S, R>) {
  return def;
}

export const VIEWS = {
  /* Dashboard & performance ---------------------------------------- */
  "dashboard.home": view({
    modules: ["dashboard"],
    params: none,
    run: (db, now, _p, actor) => dashboardView(db, now, actor),
  }),
  "dashboard.trend": view({
    modules: ["dashboard"],
    params: none,
    run: (db, now, _p, actor) => dashboardTrendView(db, now, actor),
  }),
  "analytics.overview": view({
    modules: ["analytics"],
    params: z.object({ days }),
    run: analyticsView,
  }),
  "operations.overview": view({
    modules: ["operations"],
    params: none,
    run: (db, now) => operationsView(db, now),
  }),

  /* Front office & OPD --------------------------------------------- */
  "enquiry.list": view({
    modules: ["enquiry"],
    params: z.object({
      view: z.enum(["open", "due", "scheduled", "converted", "closed", "all"]),
      q: filter,
      source: filter,
      type: filter,
    }),
    run: enquiriesView,
  }),
  "enquiry.summary": view({
    modules: ["enquiry"],
    params: none,
    run: (db, now) => enquirySummaryView(db, now),
  }),
  "enquiry.detail": view({
    modules: ["enquiry"],
    params: z.object({ id: maybeId }),
    run: enquiryView,
  }),
  "opd.dashboard": view({
    modules: ["opd"],
    params: z.object({ doctorId: filter, departmentId: filter }),
    run: opdDashboardView,
  }),
  "opd.appointments": view({
    modules: ["opd"],
    params: z.object({
      from: date,
      to: date,
      doctorId: filter,
      status: filter,
      q: filter,
    }),
    run: appointmentsView,
  }),
  "opd.tokenBoard": view({
    modules: ["opd"],
    params: none,
    run: (db, now) => tokenBoardView(db, now),
  }),
  "opd.visit": view({
    modules: ["opd"],
    params: z.object({ encounterId: id }),
    run: visitView,
  }),
  "opd.doctorOptions": view({
    modules: [],
    params: z.object({ date }),
    run: doctorOptionsView,
  }),
  "opd.doctorSlots": view({
    modules: [],
    params: z.object({ doctorId: filter, date }),
    run: doctorSlotsView,
  }),

  /* Patients ------------------------------------------------------- */
  "patients.search": view({
    modules: [],
    params: z.object({ query: z.string().max(100) }),
    run: patientSearchView,
  }),
  "patients.list": view({
    modules: ["ehr"],
    params: z.object({
      q: filter,
      filter: z.enum(["all", "inhouse", "today", "new"]),
    }),
    run: patientsView,
  }),
  "patients.record": view({
    modules: ["ehr"],
    params: z.object({ id }),
    run: patientRecordView,
  }),

  /* Inpatients & beds ---------------------------------------------- */
  "ipd.admissions": view({
    modules: ["ipd"],
    params: z.object({
      scope: z.enum(["inhouse", "discharged", "all"]),
      q: filter,
      wardCode: filter,
      doctorId: filter,
    }),
    run: admissionsView,
  }),
  "ipd.admission": view({
    modules: ["ipd"],
    params: z.object({ id }),
    run: admissionView,
  }),
  "ipd.freeBeds": view({
    modules: [],
    params: none,
    run: db => freeBedsView(db),
  }),
  "beds.board": view({
    modules: ["beds"],
    params: none,
    run: (db, now) => bedBoardView(db, now),
  }),

  /* Clinical services ---------------------------------------------- */
  "lab.worklist": view({
    modules: ["lab"],
    params: z.object({
      stage: z.enum([
        "collection",
        "processing",
        "reporting",
        "completed",
        "all",
      ]),
      q: filter,
      priority: filter,
    }),
    run: labWorklistView,
  }),
  "lab.order": view({
    modules: ["lab"],
    params: z.object({ id: maybeId }),
    run: labOrderDetailView,
  }),
  "pharmacy.queue": view({
    modules: ["pharmacy"],
    params: z.object({ view: z.enum(["open", "today", "all"]), q: filter }),
    run: prescriptionQueueView,
  }),
  "pharmacy.prescription": view({
    modules: ["pharmacy"],
    params: z.object({ id: maybeId }),
    run: dispenseDetailView,
  }),
  "pharmacy.inventory": view({
    modules: ["pharmacy"],
    params: none,
    run: (db, now) => inventoryView(db, now),
  }),
  "pharmacy.transactions": view({
    modules: ["pharmacy"],
    params: z.object({ type: filter, q: filter, days }),
    run: transactionsView,
  }),

  /* Catalogues shared by forms ------------------------------------- */
  "catalog.medicines": view({
    modules: [],
    params: none,
    run: (db, now) => medicineOptionsView(db, now),
  }),
  "catalog.labTests": view({
    modules: [],
    params: none,
    run: db => labTestOptionsView(db),
  }),
  "catalog.departments": view({
    modules: [],
    params: none,
    run: db => departmentsView(db),
  }),
  "catalog.staff": view({
    modules: [],
    params: z.object({ roles: z.array(z.string().max(40)).max(12).optional() }),
    run: staffOptionsView,
  }),

  /* Administration ------------------------------------------------- */
  "billing.invoices": view({
    modules: ["billing"],
    params: z.object({
      view: z.enum(["due", "running", "refund", "paid", "all"]),
      q: filter,
      setting: filter,
      days: days.optional(),
    }),
    run: invoicesView,
  }),
  "billing.summary": view({
    modules: ["billing"],
    params: none,
    run: (db, now) => billingSummaryView(db, now),
  }),
  "billing.collections": view({
    modules: ["billing"],
    params: z.object({ date }),
    run: collectionsView,
  }),
  "billing.invoice": view({
    modules: ["billing"],
    params: z.object({ id }),
    run: invoiceView,
  }),
  "mrd.records": view({
    modules: ["mrd"],
    params: z.object({
      view: z.enum(["incomplete", "review", "complete", "archived", "all"]),
      q: filter,
      type: filter,
    }),
    run: medicalRecordsView,
  }),
  "mrd.summary": view({
    modules: ["mrd"],
    params: none,
    run: (db, now) => mrdSummaryView(db, now),
  }),
  "mrd.record": view({
    modules: ["mrd"],
    params: z.object({ id: maybeId }),
    run: medicalRecordView,
  }),
  "complaints.list": view({
    modules: ["complaints"],
    params: z.object({
      view: z.enum(["open", "overdue", "resolved", "all"]),
      q: filter,
      departmentId: filter,
      priority: filter,
    }),
    run: complaintsView,
  }),
  "complaints.summary": view({
    modules: ["complaints"],
    params: none,
    run: (db, now) => complaintSummaryView(db, now),
  }),
  "complaints.detail": view({
    modules: ["complaints"],
    params: z.object({ id: maybeId }),
    run: complaintView,
  }),
  "feedback.list": view({
    modules: ["feedback"],
    params: z.object({
      view: z.enum(["all", "followup", "low", "high"]),
      q: filter,
      departmentId: filter,
      days,
    }),
    run: feedbackView,
  }),
  "feedback.summary": view({
    modules: ["feedback"],
    params: z.object({ days }),
    run: feedbackSummaryView,
  }),
  "feedback.patientEncounters": view({
    modules: ["feedback"],
    params: z.object({ patientId: id }),
    run: patientEncountersView,
  }),
  "wfm.staff": view({
    modules: ["wfm"],
    params: z.object({
      q: filter,
      departmentId: filter,
      role: filter,
      status: filter,
    }),
    run: staffListView,
  }),
  "wfm.profile": view({
    modules: ["wfm"],
    params: z.object({ id: maybeId }),
    run: staffProfileView,
  }),
  "wfm.roster": view({
    modules: ["wfm"],
    params: z.object({ weekStart: date, departmentId: filter, role: filter }),
    run: rosterView,
  }),

  /* Administration ------------------------------------------------- */
  "admin.users": view({
    modules: ["admin"],
    params: z.object({ q: filter, roleId: filter, status: filter }),
    run: adminUsersView,
  }),
  "admin.roles": view({
    modules: ["admin"],
    params: none,
    run: db => adminRolesView(db),
  }),
  "admin.audit": view({
    modules: ["admin"],
    params: z.object({ limit: z.number().int().min(1).max(500) }),
    run: adminAuditView,
  }),

  /* Cross-cutting -------------------------------------------------- */
  "search.records": view({
    modules: [],
    params: z.object({ query: z.string().max(100) }),
    run: searchRecordsView,
  }),
  /** Access follows the file's owner (see features/files/views). */
  "files.get": view({
    modules: [],
    params: z.object({ id }),
    run: fileView,
  }),
  "system.integrity": view({
    modules: [],
    params: none,
    run: db => integrityView(db),
  }),
  "session.directory": view({
    modules: [],
    params: none,
    run: db => loginDirectoryView(db),
    public: true,
  }),
} as const;

export type Views = typeof VIEWS;
export type ViewName = keyof Views;
export type ViewParams<N extends ViewName> = z.input<Views[N]["params"]>;
export type ViewResult<N extends ViewName> = ReturnType<Views[N]["run"]>;

export const VIEW_NAMES = Object.keys(VIEWS) as ViewName[];

export function isViewName(name: string): name is ViewName {
  return Object.prototype.hasOwnProperty.call(VIEWS, name);
}
