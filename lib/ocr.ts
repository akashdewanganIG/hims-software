import type { DocumentKind } from "@/lib/sim/schema";

const labelled = (text: string, labels: string[]) => {
  const names = labels.map(label => label.replace(/\s+/g, "\\s*")).join("|");
  return text
    .match(new RegExp(`(?:${names})\\s*[:\\-]\\s*([^\\n\\r]+)`, "i"))?.[1]
    ?.trim();
};

const isoDateFromText = (value: string | undefined) => {
  if (!value) return undefined;
  const match = value.match(/(\d{1,4})[/.-](\d{1,2})[/.-](\d{1,4})/);
  if (!match) return undefined;
  let a = match[1];
  const b = match[2];
  let c = match[3];
  if (!a || !b || !c) return undefined;
  if (a.length === 4) [a, c] = [c, a];
  const shortYear = Number(c);
  const currentShortYear = new Date().getFullYear() % 100;
  const year =
    c.length === 2
      ? String((shortYear <= currentShortYear ? 2000 : 1900) + shortYear)
      : c;
  const result = `${year}-${b.padStart(2, "0")}-${a.padStart(2, "0")}`;
  const parsed = new Date(`${result}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) ||
    parsed.getUTCFullYear() !== Number(year) ||
    parsed.getUTCMonth() + 1 !== Number(b) ||
    parsed.getUTCDate() !== Number(a)
    ? undefined
    : result;
};

const isoExpiryFromText = (value: string | undefined) => {
  const full = isoDateFromText(value);
  if (full || !value) return full;
  const match = value.match(/\b(\d{1,2})[/.-](\d{2}|\d{4})\b/);
  if (!match) return undefined;
  const month = Number(match[1]);
  const shortYear = Number(match[2]);
  const year = match[2]!.length === 2 ? 2000 + shortYear : shortYear;
  return month >= 1 && month <= 12
    ? `${year}-${String(month).padStart(2, "0")}-01`
    : undefined;
};

export interface PatientOcrFields {
  firstName?: string;
  lastName?: string;
  gender?: "MALE" | "FEMALE" | "OTHER";
  dateOfBirth?: string;
  bloodGroup?: string;
  phone?: string;
  email?: string;
  address?: string;
  city?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
}

export function extractPatientFields(text: string): PatientOcrFields {
  const fullName = labelled(text, ["patient name", "full name", "name"]);
  const parts = fullName?.replace(/\s+/g, " ").trim().split(" ") ?? [];
  const genderText = labelled(text, ["gender", "sex"]) ?? text;
  const phoneText = labelled(text, ["mobile", "phone", "contact no"]);
  const phone = phoneText?.replace(/\D/g, "").slice(-10);
  const emergencyPhone = labelled(text, [
    "emergency contact no",
    "emergency phone",
  ])
    ?.replace(/\D/g, "")
    .slice(-10);
  const blood = (labelled(text, ["blood group", "blood type"]) ?? "")
    .toUpperCase()
    .match(/\b(?:AB|A|B|O)[+-]/)?.[0];
  const email = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0];
  const gender = /\bfemale\b|\bF\b/i.test(genderText)
    ? "FEMALE"
    : /\bmale\b|\bM\b/i.test(genderText)
      ? "MALE"
      : /\bother\b|non.?binary/i.test(genderText)
        ? "OTHER"
        : undefined;
  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(" ") || undefined,
    gender,
    dateOfBirth: isoDateFromText(
      labelled(text, ["date of birth", "dob", "birth date"])
    ),
    bloodGroup: blood,
    phone: phone?.length === 10 ? phone : undefined,
    email,
    address: labelled(text, ["address", "residential address"]),
    city: labelled(text, ["city", "town"]),
    emergencyContactName: labelled(text, ["emergency contact", "next of kin"]),
    emergencyContactPhone:
      emergencyPhone?.length === 10 ? emergencyPhone : undefined,
  };
}

export function extractDocumentFields(text: string): {
  title?: string;
  kind: Exclude<DocumentKind, "DISCHARGE_SUMMARY">;
} {
  const lower = text.toLowerCase();
  const kind = lower.includes("prescription")
    ? "PRESCRIPTION"
    : lower.includes("consent")
      ? "CONSENT_FORM"
      : lower.includes("referral")
        ? "REFERRAL_LETTER"
        : lower.includes("laboratory") || lower.includes("lab report")
          ? "LAB_REPORT"
          : lower.includes("aadhaar") || lower.includes("identity")
            ? "ID_PROOF"
            : "EXTERNAL_REPORT";
  const title = text
    .split(/\r?\n/)
    .map(line => line.trim())
    .find(line => line.length >= 4 && line.length <= 100);
  return { title, kind };
}

export function extractStockReceiptFields(text: string) {
  return {
    supplier: labelled(text, ["supplier", "vendor", "distributor"]),
    invoiceNumber: labelled(text, ["invoice no", "invoice number", "bill no"]),
    batchNumber: labelled(text, ["batch no", "batch number", "lot no"]),
    expiryDate: isoExpiryFromText(labelled(text, ["expiry", "exp date"])),
    quantity: labelled(text, ["quantity", "qty"])?.match(/\d+/)?.[0],
    costPrice: labelled(text, ["cost price", "unit cost", "rate"])?.match(
      /\d+(?:\.\d{1,2})?/
    )?.[0],
  };
}
