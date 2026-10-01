/**
 * The hospital's records as structured PDFs — the same content as the
 * printed letterhead documents, built from the same views the screens read.
 */
import type { TableCell } from "pdfmake/interfaces";

import type { collectionsView, InvoiceDetail } from "@/features/billing/views";
import type { AdmissionDetail } from "@/features/ipd/views";
import type { LabOrderDetail } from "@/features/lab/views";
import type { MrdDetail } from "@/features/mrd/views";
import type {
  LabOrderView,
  PrescriptionView,
  VisitDetail,
} from "@/features/opd/views";
import type { PatientRecord } from "@/features/patients/views";
import type { ComplaintDetail } from "@/features/quality/views";
import {
  formatDate,
  formatDateShort,
  formatDateTime,
  formatGender,
  formatINR,
  formatPhone,
  formatTime,
  humanize,
} from "@/lib/format";
import { HOSPITAL } from "@/lib/sim/reference";
import type { Vitals } from "@/lib/sim/schema";

import {
  dataTable,
  fields,
  paragraph,
  recordDocument,
  section,
  totals,
  type Content,
} from "./layout";

const FREQUENCY: Record<string, string> = {
  OD: "Once a day",
  BD: "Twice a day",
  TDS: "Three times a day",
  QID: "Four times a day",
  HS: "At bedtime",
  SOS: "When required",
  STAT: "Immediately",
};

const FLAG: Record<string, string> = {
  LOW: "L",
  HIGH: "H",
  CRITICAL_LOW: "LL",
  CRITICAL_HIGH: "HH",
  ABNORMAL: "*",
};

function vitalsText(v: Vitals | undefined) {
  if (!v) return "Not recorded";
  return (
    [
      v.temperatureC !== undefined && `T ${v.temperatureC} °C`,
      v.pulse !== undefined && `P ${v.pulse}/min`,
      v.systolic !== undefined && `BP ${v.systolic}/${v.diastolic ?? "—"}`,
      v.respiratoryRate !== undefined && `RR ${v.respiratoryRate}/min`,
      v.spo2 !== undefined && `SpO₂ ${v.spo2}%`,
      v.weightKg !== undefined && `Wt ${v.weightKg} kg`,
    ]
      .filter(Boolean)
      .join(" · ") || "Not recorded"
  );
}

function medicineRows(items: PrescriptionView["items"]) {
  return items.map((item, index) => [
    String(index + 1),
    {
      stack: [
        { text: `${item.medicine} ${item.strength}`, bold: true },
        {
          text: [humanize(item.form), humanize(item.route), item.instructions]
            .filter(Boolean)
            .join(" · "),
          style: "note",
        },
      ],
    } as Content,
    item.dose,
    FREQUENCY[item.frequency] ?? item.frequency,
    `${item.durationDays} day${item.durationDays === 1 ? "" : "s"}`,
    `${item.quantityPrescribed} ${item.unit}`,
  ]);
}

const MEDICINE_COLUMNS = [
  { header: "#", width: 16 },
  { header: "Medicine", width: "*" as const },
  { header: "Dose", width: 60 },
  { header: "When", width: 80 },
  { header: "Duration", width: 50 },
  { header: "Qty", width: 50, align: "right" as const },
];

/**
 * One lab order's results: a table per test, flags beside the values. A
 * test is never split from its title; an order that fits on a page stays
 * on one page.
 */
function labResults(order: LabOrderView, heading?: string): Content {
  const rows = order.tests.reduce((n, t) => n + t.results.length + 2, 0);
  return {
    unbreakable: rows <= 24,
    stack: [
      ...(heading
        ? [
            {
              text: heading,
              style: "note",
              margin: [0, 4, 0, 0] as [number, number, number, number],
            },
          ]
        : []),
      ...order.tests.map(test => testResults(test)),
    ],
  };
}

function testResults(test: LabOrderView["tests"][number]): Content {
  return {
    unbreakable: test.results.length <= 20,
    stack: [
      { text: test.name, bold: true, margin: [0, 4, 0, 3] },
      test.results.length
        ? dataTable(
            [
              { header: "Investigation", width: "*" },
              { header: "Result", width: 70, align: "right" },
              { header: "Flag", width: 28, align: "center" },
              { header: "Unit", width: 60 },
              { header: "Reference range", width: 110 },
            ],
            test.results.map(r => {
              const flagged = r.flag !== "NORMAL";
              return [
                r.parameter,
                { text: r.value, bold: flagged, alignment: "right" } as Content,
                {
                  text: flagged ? (FLAG[r.flag] ?? "*") : "",
                  bold: true,
                  alignment: "center",
                } as Content,
                r.unit,
                r.reference || "—",
              ];
            })
          )
        : { text: "Result awaited.", style: "note" },
    ],
  };
}

/**
 * A section heading kept on the page of the block it introduces. pdfmake
 * cannot see past a block that is kept together, so the heading joins it.
 */
function headed(title: string, blocks: Content[]): Content[] {
  const [first, ...rest] = blocks;
  if (first && (first as { unbreakable?: boolean }).unbreakable)
    return [{ unbreakable: true, stack: [section(title), first] }, ...rest];
  return [section(title), ...blocks];
}

/* ------------------------------------------------------------------ */
/* OPD prescription and consultation summary                           */
/* ------------------------------------------------------------------ */

export function prescriptionPdf(visit: VisitDetail) {
  const { encounter, patient, doctor, appointment } = visit;
  const items = visit.prescriptions
    .filter(p => p.status !== "CANCELLED")
    .flatMap(p => p.items.filter(i => i.status !== "CANCELLED"));
  const tests = visit.labOrders
    .filter(o => o.status !== "CANCELLED")
    .flatMap(o => o.tests.map(t => t.name));
  return recordDocument({
    title: "Prescription",
    reference: `${encounter.code}${appointment?.tokenNumber ? ` · token ${appointment.tokenNumber}` : ""}`,
    signature: [
      doctor.name,
      [doctor.qualification, doctor.specialisation]
        .filter(Boolean)
        .join(" · ") || doctor.designation,
      doctor.department,
    ],
    content: [
      fields([
        ["Patient", `${patient.firstName} ${patient.lastName}`],
        ["UHID", patient.uhid],
        ["Age / sex", `${patient.age} y / ${formatGender(patient.gender)}`],
        ["Date", formatDateTime(encounter.startedAt)],
        ["Allergies", patient.allergies.join(", ") || "None known"],
        ["Vitals", vitalsText(encounter.vitals)],
        ["Doctor", doctor.name],
        ["Department", doctor.department],
      ]),
      paragraph("Chief complaint", encounter.chiefComplaint),
      ...(encounter.diagnoses.length
        ? [
            paragraph(
              "Diagnosis",
              encounter.diagnoses
                .map(
                  d =>
                    `${d.description}${d.code ? ` (${d.code})` : ""}${d.type === "PROVISIONAL" ? " — provisional" : ""}`
                )
                .join("\n")
            ),
          ]
        : []),
      section("Rx — medicines"),
      dataTable(
        MEDICINE_COLUMNS,
        medicineRows(items),
        "No medicines prescribed."
      ),
      ...(tests.length
        ? [paragraph("Investigations advised", tests.join(", "))]
        : []),
      paragraph("Advice", encounter.advice),
      ...(encounter.followUpDate
        ? [paragraph("Review", `On ${formatDate(encounter.followUpDate)}`)]
        : []),
      ...(encounter.referral
        ? [paragraph("Referral", encounter.referral.note)]
        : []),
    ],
  });
}

/* ------------------------------------------------------------------ */
/* Laboratory report                                                   */
/* ------------------------------------------------------------------ */

export function labReportPdf(data: LabOrderDetail) {
  const { order, view, patient, timeline } = data;
  const verified = order.status === "VERIFIED";
  const step = (label: string) => timeline.find(t => t.label === label);
  const collected = step("Sample collected");
  const verifiedStep = step("Verified");
  return recordDocument({
    title: verified ? "Laboratory report" : "Laboratory report — provisional",
    reference: `${order.code}${order.sampleId ? ` · ${order.sampleId}` : ""}`,
    signature: verified
      ? [
          verifiedStep?.by ?? "Verified",
          `Verified ${formatDateTime(verifiedStep?.at)}`,
        ]
      : undefined,
    content: [
      fields([
        ["Patient", patient.name],
        ["UHID", patient.uhid],
        ["Age / sex", `${patient.age} y / ${formatGender(patient.gender)}`],
        ["Setting", data.setting],
        ["Referred by", view.orderedBy],
        ["Priority", humanize(order.priority)],
        [
          "Sample collected",
          collected?.at ? formatDateTime(collected.at) : "—",
        ],
        ["Status", humanize(order.status)],
      ]),
      ...headed("Results", [labResults(view)]),
      ...(data.clinicalNotes
        ? [paragraph("Clinical notes", data.clinicalNotes)]
        : []),
      {
        text: verified
          ? "L / H: below / above the reference range · LL / HH: critical — the clinician has been informed."
          : "Not verified — for information only, not for clinical decisions.",
        style: "note",
        margin: [0, 6, 0, 0],
      },
    ],
  });
}

/* ------------------------------------------------------------------ */
/* Discharge summary                                                   */
/* ------------------------------------------------------------------ */

export function dischargeSummaryPdf(data: AdmissionDetail) {
  const { summary, patient, admission, row } = data;
  if (!summary) throw new Error("This admission has no discharge summary yet.");
  const verified = data.labOrders.filter(o => o.status === "VERIFIED");
  return recordDocument({
    title: "Discharge summary",
    reference: `${admission.code}${summary.status === "DRAFT" ? " · DRAFT" : ""}`,
    signature: [summary.preparedBy, row.department],
    content: [
      fields([
        ["Patient", `${patient.firstName} ${patient.lastName}`],
        ["UHID", patient.uhid],
        ["Age / sex", `${patient.age} y / ${formatGender(patient.gender)}`],
        ["Consultant", row.doctor],
        ["Admitted", formatDateTime(admission.admittedAt)],
        [
          "Discharged",
          admission.dischargedAt
            ? formatDateTime(admission.dischargedAt)
            : "Pending",
        ],
        ["Ward / bed", row.bed ? `${row.bed.ward} · ${row.bed.code}` : "—"],
        ["Allergies", patient.allergies.join(", ") || "None known"],
      ]),
      paragraph("Reason for admission", admission.reason),
      paragraph("Final diagnosis", summary.finalDiagnosis),
      paragraph("Course in hospital", summary.courseInHospital),
      paragraph("Procedures", summary.proceduresDone || "Nil"),
      ...(verified.length
        ? [
            section("Key investigations"),
            dataTable(
              [
                { header: "Tests", width: 140 },
                { header: "Verified", width: 60 },
                { header: "Results", width: "*" },
              ],
              verified.slice(0, 8).map(o => [
                o.tests.map(t => t.name).join(", "),
                formatDateShort(o.verifiedAt),
                o.tests
                  .flatMap(t => t.results)
                  .map(
                    r =>
                      `${r.parameter} ${r.value}${r.unit ? ` ${r.unit}` : ""}${r.flag !== "NORMAL" ? " *" : ""}`
                  )
                  .join("; "),
              ])
            ),
            { text: "* outside reference range", style: "note" },
          ]
        : []),
      paragraph("Condition at discharge", summary.conditionAtDischarge),
      paragraph("Discharge medication", summary.dischargeMedications || "—"),
      paragraph(
        "Follow-up",
        `${summary.followUpInstructions}${summary.followUpDate ? `\nReview on ${formatDate(summary.followUpDate)}` : ""}`
      ),
    ],
  });
}

/* ------------------------------------------------------------------ */
/* Bill                                                                */
/* ------------------------------------------------------------------ */

export function invoicePdf(data: InvoiceDetail) {
  const { invoice, totals: t, patient } = data;
  const title =
    invoice.status === "DRAFT"
      ? "Interim bill"
      : invoice.admissionId
        ? "Final inpatient bill"
        : "OPD bill";
  return recordDocument({
    title,
    reference: `${invoice.code}${invoice.status === "CANCELLED" ? " · CANCELLED" : ""}`,
    signature: ["Authorised signatory", `GSTIN ${HOSPITAL.gstin}`],
    content: [
      fields([
        ["Patient", patient.name],
        ["UHID", patient.uhid],
        ["Age / sex", `${patient.age} y / ${humanize(patient.gender)}`],
        ["Bill date", formatDate(invoice.finalisedAt ?? invoice.createdAt)],
        ["Address", `${patient.address}, ${patient.city}`],
        ...(data.admission
          ? ([
              ["Admission", data.admission.code],
              ["Admitted", formatDateTime(data.admission.admittedAt)],
              [
                "Discharged",
                data.admission.dischargedAt
                  ? formatDateTime(data.admission.dischargedAt)
                  : "In-house",
              ],
            ] as Array<[string, string]>)
          : data.encounter
            ? ([
                ["Visit", data.encounter.code],
                ["Consultant", data.encounter.doctor],
                ["Department", data.encounter.department],
              ] as Array<[string, string]>)
            : []),
      ]),
      section("Particulars"),
      dataTable(
        [
          { header: "Date", width: 52 },
          { header: "Particulars", width: "*" },
          { header: "Qty", width: 30, align: "right" },
          { header: "Rate", width: 62, align: "right" },
          { header: "Disc.", width: 52, align: "right" },
          { header: "Amount", width: 70, align: "right" },
        ],
        data.items.map(item => [
          formatDateShort(item.serviceDate),
          `${humanize(item.category)} — ${item.description}`,
          String(item.quantity),
          formatINR(item.unitPrice),
          item.discount ? formatINR(item.discount) : "—",
          formatINR(item.amount),
        ]),
        "No charges on this bill."
      ),
      totals([
        ["Gross", formatINR(t.gross)],
        ["Discount", `−${formatINR(t.discount)}`],
        ["Net payable", formatINR(t.total), true],
        ["Received", formatINR(t.netPaid)],
        ["Balance due", formatINR(t.balance), true],
        ...(t.refundDue > 0
          ? ([["Refund due", formatINR(t.refundDue), true]] as Array<
              [string, string, boolean]
            >)
          : []),
      ]),
      ...(data.payments.length
        ? [
            section("Payments"),
            dataTable(
              [
                { header: "Receipt", width: 90 },
                { header: "Date", width: 100 },
                { header: "Mode", width: "*" },
                { header: "Amount", width: 80, align: "right" },
              ],
              data.payments.map(p => [
                p.code,
                formatDateTime(p.receivedAt),
                p.kind === "REFUND"
                  ? `Refund · ${humanize(p.method)}`
                  : `${humanize(p.method)}${p.reference ? ` · ${p.reference}` : ""}`,
                `${p.kind === "REFUND" ? "−" : ""}${formatINR(p.amount)}`,
              ])
            ),
          ]
        : []),
      {
        text: "Healthcare services are exempt from GST.",
        style: "note",
        margin: [0, 6, 0, 0],
      },
    ],
  });
}

/* ------------------------------------------------------------------ */
/* Day-end collection report                                           */
/* ------------------------------------------------------------------ */

export function collectionsPdf(
  data: ReturnType<typeof collectionsView>,
  preparedBy: string
) {
  const t = data.totals;
  const tally = (
    rows: Array<{ key: string; net: number; receipts: number }>,
    label: (key: string) => string
  ): TableCell[][] =>
    rows.map(r => [label(r.key), String(r.receipts), formatINR(r.net)]);
  const breakdown = (
    title: string,
    rows: Array<{ key: string; net: number; receipts: number }>,
    label: (key: string) => string
  ): Content => ({
    stack: [
      { text: title.toUpperCase(), style: "label", margin: [0, 0, 0, 3] },
      dataTable(
        [
          { header: title.replace(/^By /, ""), width: "*" },
          { header: "Receipts", width: 42, align: "right" },
          { header: "Net", width: 64, align: "right" },
        ],
        tally(rows, label) as Array<Array<string>>
      ),
    ],
  });
  return recordDocument({
    title: "Day-end collection report",
    reference: formatDate(data.date),
    signature: [
      `Prepared by ${preparedBy}`,
      "Received by (accounts): ____________",
    ],
    content: [
      fields([
        ["Collected", formatINR(t.collected)],
        ["Refunded", formatINR(t.refunded)],
        ["Net collection", formatINR(t.net)],
        ["Receipts / refunds", `${t.receipts} / ${t.refunds}`],
      ]),
      {
        columns: [
          breakdown("By payment method", data.byMethod, humanize),
          breakdown("By source", data.bySource, k => k),
          breakdown("By cashier", data.byCashier, k => k),
        ],
        columnGap: 12,
      },
      section("Receipts and refunds"),
      dataTable(
        [
          { header: "Time", width: 40 },
          { header: "Receipt", width: 80 },
          { header: "Bill", width: 80 },
          { header: "Patient", width: "*" },
          { header: "Mode", width: 60 },
          { header: "Amount", width: 66, align: "right" },
        ],
        data.rows.map(r => [
          formatTime(r.at),
          r.code,
          r.invoiceCode,
          r.patient ? `${r.patient.name} (${r.patient.uhid})` : "—",
          humanize(r.method),
          `${r.kind === "REFUND" ? "−" : ""}${formatINR(r.amount)}`,
        ]),
        "No receipts on this day."
      ),
    ],
  });
}

/* ------------------------------------------------------------------ */
/* Patient record (EHR summary)                                        */
/* ------------------------------------------------------------------ */

export function patientRecordPdf(record: PatientRecord, photo?: string) {
  const { patient } = record;
  const identity: Content = fields(
    [
      ["Name", `${patient.firstName} ${patient.lastName}`],
      ["UHID", patient.uhid],
      ["Age / sex", `${patient.age} y / ${formatGender(patient.gender)}`],
      ["Date of birth", formatDate(patient.dateOfBirth)],
      ["Blood group", patient.bloodGroup ?? "Unknown"],
      ["Mobile", formatPhone(patient.phone)],
      ["Email", patient.email],
      ["Registered", formatDate(patient.registeredAt)],
      ["Address", `${patient.address}, ${patient.city}`],
      [
        "Emergency contact",
        `${patient.emergencyContactName} · ${formatPhone(patient.emergencyContactPhone)}`,
      ],
      ["Allergies", patient.allergies.join(", ") || "None known"],
      [
        "Chronic conditions",
        patient.chronicConditions.join(", ") || "None recorded",
      ],
    ],
    photo ? 3 : 4
  );
  const labs = record.labOrders.filter(
    o => o.status === "VERIFIED" || o.status === "RESULT_READY"
  );
  return recordDocument({
    title: "Patient record",
    reference: patient.uhid,
    content: [
      photo
        ? {
            columns: [
              { width: "*", stack: [identity] },
              { width: 80, image: photo, fit: [80, 96], alignment: "right" },
            ],
            columnGap: 12,
          }
        : identity,
      ...(record.activeAdmission
        ? [
            {
              text: `Currently admitted: ${record.activeAdmission.code}${record.activeAdmission.bed ? ` · ${record.activeAdmission.bed}` : ""} · ${record.activeAdmission.doctor}`,
              bold: true,
              margin: [0, 0, 0, 6] as [number, number, number, number],
            },
          ]
        : []),
      section("Diagnoses"),
      dataTable(
        [
          { header: "Diagnosis", width: "*" },
          { header: "ICD-10", width: 50 },
          { header: "Times", width: 36, align: "right" },
          { header: "Last recorded", width: 70 },
        ],
        record.diagnoses.map(d => [
          d.description,
          d.code ?? "—",
          String(d.count),
          formatDate(d.lastSeen),
        ]),
        "No diagnoses recorded."
      ),
      section("Encounters"),
      dataTable(
        [
          { header: "Date", width: 52 },
          { header: "Type", width: 30 },
          { header: "Ref", width: 78 },
          { header: "Doctor", width: 100 },
          { header: "Complaint / diagnosis", width: "*" },
        ],
        record.encounters.map(e => [
          formatDateShort(e.startedAt),
          e.type,
          e.code,
          `${e.doctor}\n${e.department}`,
          e.diagnoses.map(d => d.description).join("; ") || e.chiefComplaint,
        ]),
        "No encounters."
      ),
      ...(record.admissions.length
        ? [
            section("Admissions"),
            dataTable(
              [
                { header: "Admission", width: 80 },
                { header: "Admitted", width: 60 },
                { header: "Discharged", width: 60 },
                { header: "Doctor", width: 100 },
                { header: "Diagnosis", width: "*" },
              ],
              record.admissions.map(a => [
                a.code,
                formatDateShort(a.admittedAt),
                a.dischargedAt ? formatDateShort(a.dischargedAt) : "In-house",
                a.doctor,
                a.diagnosis,
              ])
            ),
          ]
        : []),
      section("Prescriptions"),
      dataTable(
        [
          { header: "Prescription", width: 80 },
          { header: "Date", width: 52 },
          { header: "Prescriber", width: 90 },
          { header: "Medicines", width: "*" },
          { header: "Status", width: 62 },
        ],
        record.prescriptions.map(rx => [
          rx.code,
          formatDateShort(rx.createdAt),
          rx.prescriber,
          rx.items
            .map(
              i =>
                `${i.medicine} ${i.strength} — ${i.dose}, ${FREQUENCY[i.frequency] ?? i.frequency}, ${i.durationDays} d`
            )
            .join("\n"),
          humanize(rx.status),
        ]),
        "No prescriptions."
      ),
      ...headed(
        "Lab results",
        labs.length
          ? labs
              .slice(0, 12)
              .map(order =>
                labResults(
                  order,
                  `${order.code} · ${formatDateTime(order.orderedAt)} · ${order.orderedBy}${order.status === "RESULT_READY" ? " · preliminary" : ""}`
                )
              )
          : [{ text: "No reported lab results.", style: "note" }]
      ),
      section("Bills"),
      dataTable(
        [
          { header: "Bill", width: 80 },
          { header: "Date", width: 52 },
          { header: "For", width: "*" },
          { header: "Total", width: 64, align: "right" },
          { header: "Paid", width: 64, align: "right" },
          { header: "Balance", width: 64, align: "right" },
        ],
        record.bills.map(b => [
          b.code,
          formatDateShort(b.createdAt),
          `${b.context} · ${humanize(b.status)}`,
          formatINR(b.total),
          formatINR(b.paid),
          formatINR(b.balance),
        ]),
        "No bills."
      ),
      section("Documents"),
      dataTable(
        [
          { header: "Document", width: "*" },
          { header: "Type", width: 90 },
          { header: "Filed", width: 52 },
          { header: "By", width: 100 },
        ],
        record.documents.map(d => [
          `${d.title}${d.file || d.href ? "" : " (paper original)"}`,
          humanize(d.kind),
          formatDateShort(d.uploadedAt),
          d.uploadedBy,
        ]),
        "No documents."
      ),
      ...(record.upcoming.length
        ? [
            section("Upcoming appointments"),
            dataTable(
              [
                { header: "When", width: 100 },
                { header: "Doctor", width: "*" },
                { header: "Department", width: 110 },
                { header: "Ref", width: 80 },
              ],
              record.upcoming.map(a => [
                formatDateTime(a.scheduledAt),
                a.doctor,
                a.department,
                a.code,
              ])
            ),
          ]
        : []),
    ],
  });
}

/**
 * The case file's cover sheet as the MRD keeps it: what the file covers,
 * the completeness checklist, an index of its documents and the custody
 * trail of who retrieved or reviewed it.
 */
export function caseFilePdf(data: MrdDetail) {
  const { record, encounter, admission, patient } = data;
  const done = data.checklist.filter(i => i.done).length;
  return recordDocument({
    title: "Medical record — case file",
    reference: record.code,
    content: [
      fields([
        ["Patient", patient.name],
        ["UHID", patient.uhid],
        ["Age / sex", `${patient.age} y / ${formatGender(patient.gender)}`],
        ["Record type", humanize(record.recordType)],
        ["Encounter", `${encounter.code} · ${encounter.type}`],
        ["Department", data.department],
        ["Attending doctor", data.doctor],
        ["Status", humanize(record.status)],
        [
          admission ? "Admitted" : "Visit",
          formatDateTime(admission?.admittedAt ?? encounter.startedAt),
        ],
        [
          admission ? "Discharged" : "Closed",
          admission
            ? admission.dischargedAt
              ? formatDateTime(admission.dischargedAt)
              : "In-house"
            : encounter.closedAt
              ? formatDateTime(encounter.closedAt)
              : "Open",
        ],
        ["Admission", admission?.code],
        ["Shelf location", record.location],
      ]),
      paragraph("Diagnoses", encounter.diagnoses.join("; ")),
      section(`Completeness · ${done} of ${data.checklist.length}`),
      dataTable(
        [
          { header: "Item", width: "*" },
          { header: "Status", width: 80 },
        ],
        data.checklist.map(item => [
          item.label,
          { text: item.done ? "Complete" : "Missing", bold: !item.done },
        ])
      ),
      section("Documents in the file"),
      dataTable(
        [
          { header: "Document", width: "*" },
          { header: "Type", width: 90 },
          { header: "Filed", width: 52 },
          { header: "By", width: 100 },
        ],
        data.documents.map(d => [
          `${d.title}${d.file ? "" : " (paper original)"}`,
          humanize(d.kind),
          formatDateShort(d.uploadedAt),
          d.uploadedBy,
        ]),
        "No documents filed."
      ),
      section("Custody and access"),
      dataTable(
        [
          { header: "When", width: 100 },
          { header: "Action", width: 80 },
          { header: "By", width: 84 },
          { header: "Note", width: "*" },
        ],
        data.access.map(a => [
          formatDateTime(a.at),
          humanize(a.action),
          a.by,
          a.note ?? "",
        ]),
        "No access recorded."
      ),
    ],
    signature: [
      data.reviewedBy ?? "Medical records officer",
      "Medical Records",
    ],
  });
}

/**
 * A complaint as a record: who raised it and about what, its handling
 * against the response target, the resolution, the full activity trail and
 * the attached photos (passed in as data URLs).
 */
export function complaintPdf(data: ComplaintDetail, photos: string[] = []) {
  const c = data.complaint;
  return recordDocument({
    title: "Complaint record",
    reference: c.code,
    content: [
      fields([
        [
          "Complainant",
          `${c.complainantName} (${humanize(c.complainantType)})`,
        ],
        ["Contact", c.contact],
        [
          "Patient",
          data.patient && `${data.patient.name} · ${data.patient.uhid}`,
        ],
        ["Related visit", data.encounter?.code],
        ["Category", humanize(c.category)],
        ["Department", data.department],
        ["Priority", humanize(c.priority)],
        ["Status", humanize(c.status)],
        ["Logged", `${formatDateTime(c.createdAt)} by ${data.loggedBy}`],
        [
          "Response due",
          `${formatDate(c.dueDate)}${data.overdue ? " (overdue)" : ""}`,
        ],
        ["Owner", data.assignedTo ?? "Unassigned"],
        ["Resolved", c.resolvedAt ? formatDateTime(c.resolvedAt) : undefined],
      ]),
      paragraph("Complaint", `${c.title}\n${c.description}`),
      ...(c.resolution ? [paragraph("Resolution", c.resolution)] : []),
      section("Activity"),
      dataTable(
        [
          { header: "When", width: 112 },
          { header: "By", width: 100 },
          { header: "Entry", width: "*" },
        ],
        [...data.notes]
          .reverse()
          .map(n => [formatDateTime(n.at), n.by, n.text]),
        "No activity recorded."
      ),
      ...(photos.length
        ? [
            section(`Photos · ${photos.length}`),
            {
              columns: photos.map(image => ({
                width: 160,
                image,
                fit: [160, 160] as [number, number],
              })),
              columnGap: 8,
            },
          ]
        : []),
    ],
    signature: [data.assignedTo ?? "Patient relations", data.department],
  });
}
