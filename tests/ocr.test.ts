import assert from "node:assert/strict";
import { test } from "node:test";

import {
  extractDocumentFields,
  extractPatientFields,
  extractStockReceiptFields,
} from "../lib/ocr";

test("OCR maps a scanned patient identity document into registration fields", () => {
  const result = extractPatientFields(`
    Patient Name: Asha Kulkarni
    Date of Birth: 05/02/2005
    Sex: Female
    Blood Group: B+
    Mobile: +91 98765 43210
    Email: asha@example.com
    Address: 14 Lake Road
    City: Pune
    Emergency Contact: Ravi Kulkarni
    Emergency Phone: 99887 76655
  `);
  assert.deepEqual(result, {
    firstName: "Asha",
    lastName: "Kulkarni",
    gender: "FEMALE",
    dateOfBirth: "2005-02-05",
    bloodGroup: "B+",
    phone: "9876543210",
    email: "asha@example.com",
    address: "14 Lake Road",
    city: "Pune",
    emergencyContactName: "Ravi Kulkarni",
    emergencyContactPhone: "9988776655",
  });
});

test("OCR classifies uploaded clinical documents", () => {
  assert.deepEqual(
    extractDocumentFields("LABORATORY REPORT\nComplete Blood Count"),
    { title: "LABORATORY REPORT", kind: "LAB_REPORT" }
  );
  assert.equal(
    extractDocumentFields("Referral Letter\nTo Cardiology").kind,
    "REFERRAL_LETTER"
  );
});

test("OCR maps a supplier invoice into stock receipt fields", () => {
  assert.deepEqual(
    extractStockReceiptFields(`
      Supplier: Medico Distributors
      Invoice No: INV-8871
      Batch No: PCM24A
      Expiry: 08/28
      Quantity: 500
      Unit Cost: 1.75
    `),
    {
      supplier: "Medico Distributors",
      invoiceNumber: "INV-8871",
      batchNumber: "PCM24A",
      expiryDate: "2028-08-01",
      quantity: "500",
      costPrice: "1.75",
    }
  );
});
