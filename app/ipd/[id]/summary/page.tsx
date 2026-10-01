"use client";

import { useParams } from "next/navigation";

import { PrintDocument, PrintField } from "@/components/shared/print-document";
import {
  EmptyState,
  PageShell,
  PanelRowsSkeleton,
} from "@/components/shared/page";
import { useAdmission } from "@/features/ipd/api";
import { pdfName } from "@/lib/pdf/layout";
import { dischargeSummaryPdf } from "@/lib/pdf/records";
import { formatDate, formatDateTime, formatGender } from "@/lib/format";

export default function DischargeSummaryPrint() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading } = useAdmission(id);

  if (isLoading) {
    return (
      <PageShell>
        <PanelRowsSkeleton rows={10} />
      </PageShell>
    );
  }
  if (!data?.summary) {
    return (
      <PageShell>
        <EmptyState
          title="No discharge summary"
          description="The summary is created when discharge is initiated."
        />
      </PageShell>
    );
  }
  const { summary, patient, admission, row } = data;
  const verified = data.labOrders.filter(o => o.status === "VERIFIED");

  return (
    <PrintDocument
      pdf={{
        fileName: pdfName("Discharge-summary", admission.code),
        build: () => dischargeSummaryPdf(data),
      }}
      title="Discharge summary"
      reference={`${admission.code}${summary.status === "DRAFT" ? " · DRAFT" : ""}`}
      footer={
        <div className="pt-8">
          <p className="border-t border-neutral-400 pt-1 font-medium text-neutral-800">
            {summary.preparedBy}
          </p>
          <p>{row.department}</p>
        </div>
      }
    >
      <section className="grid grid-cols-2 gap-x-8 gap-y-3 sm:grid-cols-4">
        <PrintField
          label="Patient"
          value={`${patient.firstName} ${patient.lastName}`}
        />
        <PrintField label="UHID" value={patient.uhid} />
        <PrintField
          label="Age / sex"
          value={`${patient.age} y / ${formatGender(patient.gender)}`}
        />
        <PrintField label="Consultant" value={row.doctor} />
        <PrintField
          label="Admitted"
          value={formatDateTime(admission.admittedAt)}
        />
        <PrintField
          label="Discharged"
          value={
            admission.dischargedAt
              ? formatDateTime(admission.dischargedAt)
              : "Pending"
          }
        />
        <PrintField
          label="Ward / bed"
          value={row.bed ? `${row.bed.ward} · ${row.bed.code}` : "—"}
        />
        <PrintField
          label="Allergies"
          value={patient.allergies.join(", ") || "None known"}
        />
      </section>
      <PrintField label="Reason for admission" value={admission.reason} />
      <PrintField label="Final diagnosis" value={summary.finalDiagnosis} />
      <PrintField label="Course in hospital" value={summary.courseInHospital} />
      <PrintField label="Procedures" value={summary.proceduresDone || "Nil"} />
      {verified.length ? (
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
            Key investigations
          </p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            {verified.slice(0, 6).map(o => (
              <li key={o.id}>
                {o.tests.map(t => t.name).join(", ")} (
                {formatDate(o.verifiedAt)}):{" "}
                {o.tests
                  .flatMap(t => t.results)
                  .map(
                    r =>
                      `${r.parameter} ${r.value}${r.unit ? ` ${r.unit}` : ""}${r.flag !== "NORMAL" ? " *" : ""}`
                  )
                  .join("; ")}
              </li>
            ))}
          </ul>
          <p className="mt-1 text-[11px] text-neutral-500">
            * outside reference range
          </p>
        </div>
      ) : null}
      <PrintField
        label="Condition at discharge"
        value={summary.conditionAtDischarge}
      />
      <PrintField
        label="Discharge medication"
        value={summary.dischargeMedications || "—"}
      />
      <PrintField
        label="Follow-up"
        value={`${summary.followUpInstructions}${summary.followUpDate ? `\nReview on ${formatDate(summary.followUpDate)}` : ""}`}
      />
    </PrintDocument>
  );
}
