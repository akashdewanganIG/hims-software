"use client";

import { useParams } from "next/navigation";
import { PrintDocument, PrintField } from "@/components/shared/print-document";
import {
  EmptyState,
  PageShell,
  PanelRowsSkeleton,
} from "@/components/shared/page";
import { useRadiologyOrder } from "@/features/radiology/api";
import { formatDateTime, humanize } from "@/lib/format";

export default function RadiologyReportPrintPage() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading } = useRadiologyOrder(id);
  if (isLoading)
    return (
      <PageShell>
        <PanelRowsSkeleton rows={8} />
      </PageShell>
    );
  const report = data?.reports.find(
    row => row.status === "FINAL" || row.status === "AMENDED"
  );
  if (!data || !report)
    return (
      <PageShell>
        <EmptyState title="Final radiology report not found" />
      </PageShell>
    );
  return (
    <PrintDocument
      title={
        report.status === "AMENDED"
          ? "Radiology report · amended"
          : "Radiology report"
      }
      reference={`${data.order.accessionNumber} · Version ${report.version}`}
      footer={
        <div className="pt-8">
          <p className="border-t border-neutral-400 pt-1 font-medium">
            {report.radiologist}
          </p>
          <p>Electronically signed {formatDateTime(report.finalisedAt)}</p>
        </div>
      }
    >
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <PrintField label="Patient" value={data.patient.name} />
        <PrintField label="UHID" value={data.patient.uhid} />
        <PrintField
          label="Age / sex"
          value={`${data.patient.age} y / ${humanize(data.patient.gender)}`}
        />
        <PrintField label="Priority" value={humanize(data.order.priority)} />
        <PrintField label="Study" value={data.procedure.name} />
        <PrintField
          label="Modality"
          value={humanize(data.procedure.modality)}
        />
        <PrintField label="Ordered by" value={data.orderedBy} />
        <PrintField
          label="Study date"
          value={formatDateTime(
            data.studies.find(row => row.accepted)?.completedAt
          )}
        />
      </section>
      <section>
        <h2 className="border-b border-neutral-300 pb-1 font-semibold uppercase">
          Clinical indication
        </h2>
        <p className="mt-2 whitespace-pre-line">
          {data.order.clinicalIndication}
        </p>
      </section>
      <section>
        <h2 className="border-b border-neutral-300 pb-1 font-semibold uppercase">
          Findings
        </h2>
        <p className="mt-2 whitespace-pre-line">{report.findings}</p>
      </section>
      <section>
        <h2 className="border-b border-neutral-300 pb-1 font-semibold uppercase">
          Impression
        </h2>
        <p className="mt-2 whitespace-pre-line font-medium">
          {report.impression}
        </p>
      </section>
      {report.recommendations ? (
        <section>
          <h2 className="border-b border-neutral-300 pb-1 font-semibold uppercase">
            Recommendations
          </h2>
          <p className="mt-2 whitespace-pre-line">{report.recommendations}</p>
        </section>
      ) : null}
      {report.criticality === "CRITICAL" ? (
        <p className="rounded border border-red-400 bg-red-50 p-3 font-medium">
          Critical result communication documented in the patient record.
        </p>
      ) : null}
      <p className="text-xs text-neutral-500">
        Diagnostic images are retained in PACS under Study UID{" "}
        {data.studies.find(row => row.accepted)?.studyInstanceUid}.
      </p>
    </PrintDocument>
  );
}
