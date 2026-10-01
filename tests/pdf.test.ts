/**
 * Every downloadable record renders to a real PDF: the document definitions
 * are built from the same views the screens read, on a seeded hospital, and
 * laid out by pdfmake (its Node build, with the same Roboto fonts the
 * browser download embeds).
 */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";

import type { TDocumentDefinitions } from "pdfmake/interfaces";

import {
  caseFilePdf,
  collectionsPdf,
  complaintPdf,
  dischargeSummaryPdf,
  invoicePdf,
  labReportPdf,
  patientRecordPdf,
  prescriptionPdf,
} from "../lib/pdf/records";
import { prepareView } from "../lib/views/execute";
import type { ViewName } from "../lib/views/registry";
import { Hospital } from "./helpers";

const require = createRequire(import.meta.url);
const pdfmake = require("pdfmake") as {
  addFonts: (fonts: Record<string, Record<string, string>>) => void;
  setLocalAccessPolicy: (allow: (path: string) => boolean) => void;
  setUrlAccessPolicy: (allow: (url: string) => boolean) => void;
  createPdf: (doc: TDocumentDefinitions) => {
    getBuffer: () => Promise<Buffer>;
  };
};
const fonts = require
  .resolve("pdfmake/fonts/Roboto/Roboto-Regular.ttf")
  .replace(/Roboto-Regular\.ttf$/, "");
pdfmake.addFonts({
  Roboto: {
    normal: `${fonts}Roboto-Regular.ttf`,
    bold: `${fonts}Roboto-Medium.ttf`,
    italics: `${fonts}Roboto-Italic.ttf`,
    bolditalics: `${fonts}Roboto-MediumItalic.ttf`,
  },
});
pdfmake.setLocalAccessPolicy(path => path.startsWith(fonts));
// Records embed their images as data URLs; nothing is fetched.
pdfmake.setUrlAccessPolicy(() => false);

const h = new Hospital();
const admin = h.login("ADMINISTRATOR");
const read = <N extends ViewName>(name: N, params: unknown) =>
  prepareView(h.db, admin, name, params).run(h.db, h.now) as never;

const PHOTO =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

async function render(doc: TDocumentDefinitions) {
  const pdf = await pdfmake.createPdf(doc).getBuffer();
  assert.equal(pdf.subarray(0, 5).toString("latin1"), "%PDF-");
  return pdf;
}

test("every record downloads as a PDF with its letterhead and page numbers", async () => {
  const visit = h.db.encounters.find(
    e =>
      e.type === "OPD" &&
      e.status === "CLOSED" &&
      h.db.prescriptions.some(p => p.encounterId === e.id)
  )!;
  const lab = h.db.labOrders.find(o => o.status === "VERIFIED")!;
  const discharged = h.db.dischargeSummaries.find(s => s.status === "FINAL")!;
  const bill = h.db.invoices.find(
    i =>
      i.admissionId &&
      i.status === "PAID" &&
      h.db.payments.some(p => p.invoiceId === i.id)
  )!;
  const patient = h.db.patients.find(p =>
    h.db.admissions.some(a => a.patientId === p.id)
  )!;
  const caseFile = h.db.medicalRecords.find(r => r.admissionId)!;
  const complaint = h.db.complaints.find(c => c.resolution)!;

  const docs: Array<[string, TDocumentDefinitions]> = [
    [
      "prescription",
      prescriptionPdf(read("opd.visit", { encounterId: visit.id })),
    ],
    ["lab report", labReportPdf(read("lab.order", { id: lab.id }))],
    [
      "discharge summary",
      dischargeSummaryPdf(
        read("ipd.admission", { id: discharged.admissionId })
      ),
    ],
    ["bill", invoicePdf(read("billing.invoice", { id: bill.id }))],
    [
      "collections",
      collectionsPdf(
        read("billing.collections", { date: h.today }),
        "Test Cashier"
      ),
    ],
    [
      "patient record",
      patientRecordPdf(read("patients.record", { id: patient.id })),
    ],
    ["case file", caseFilePdf(read("mrd.record", { id: caseFile.id }))],
    [
      "complaint",
      complaintPdf(read("complaints.detail", { id: complaint.id }), [PHOTO]),
    ],
  ];
  for (const [name, doc] of docs) {
    const pdf = await render(doc);
    assert.ok(pdf.length > 8_000, `${name} has content (${pdf.length} bytes)`);
    assert.equal(typeof doc.footer, "function", `${name} numbers its pages`);
  }
});

test("a long record breaks across pages and keeps a photo", async () => {
  const busiest = [...h.db.patients]
    .map(p => ({
      p,
      n: h.db.encounters.filter(e => e.patientId === p.id).length,
    }))
    .sort((a, b) => b.n - a.n)[0]!.p;
  const record = read("patients.record", { id: busiest.id });
  const pdf = await render(patientRecordPdf(record, PHOTO));
  const pages = (pdf.toString("latin1").match(/\/Type \/Page\b/g) ?? []).length;
  assert.ok(pages >= 2, `expected several pages, got ${pages}`);
});
