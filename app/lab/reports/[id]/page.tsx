"use client";

import { useParams } from "next/navigation";

import { PrintDocument, PrintField } from "@/components/shared/print-document";
import {
  EmptyState,
  PageShell,
  PanelRowsSkeleton,
} from "@/components/shared/page";
import { useLabOrderDetail } from "@/features/lab/api";
import { pdfName } from "@/lib/pdf/layout";
import { labReportPdf } from "@/lib/pdf/records";
import { formatDateTime, formatGender, humanize } from "@/lib/format";
import { cn } from "@/lib/utils";

const FLAG_TEXT: Record<string, string> = {
  LOW: "L",
  HIGH: "H",
  CRITICAL_LOW: "LL",
  CRITICAL_HIGH: "HH",
  ABNORMAL: "*",
};

/**
 * The laboratory report on the letterhead: results with units, reference
 * ranges and flags, released only once a second person has verified them.
 */
export default function LabReportPrint() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading } = useLabOrderDetail(id);

  if (isLoading)
    return (
      <PageShell>
        <PanelRowsSkeleton rows={10} />
      </PageShell>
    );
  if (!data)
    return (
      <PageShell>
        <EmptyState title="Lab order not found" />
      </PageShell>
    );

  const { order, view, patient, timeline } = data;
  const verified = order.status === "VERIFIED";
  const at = (label: string) => timeline.find(t => t.label === label);
  const collected = at("Sample collected");
  const verifiedStep = at("Verified");

  return (
    <PrintDocument
      pdf={{
        fileName: pdfName("Lab-report", order.code),
        build: () => labReportPdf(data),
      }}
      title={verified ? "Laboratory report" : "Laboratory report — provisional"}
      reference={`${order.code}${order.sampleId ? ` · ${order.sampleId}` : ""}`}
      footer={
        verified ? (
          <div className="pt-8">
            <p className="border-t border-neutral-400 pt-1 font-medium text-neutral-800">
              {verifiedStep?.by ?? "Verified"}
            </p>
            <p>Verified {formatDateTime(verifiedStep?.at)}</p>
          </div>
        ) : (
          <p className="font-medium text-neutral-800">
            Not verified — for information only, not for clinical decisions.
          </p>
        )
      }
    >
      <section className="grid grid-cols-2 gap-x-8 gap-y-3 sm:grid-cols-4">
        <PrintField label="Patient" value={patient.name} />
        <PrintField label="UHID" value={patient.uhid} />
        <PrintField
          label="Age / sex"
          value={`${patient.age} y / ${formatGender(patient.gender)}`}
        />
        <PrintField label="Setting" value={data.setting} />
        <PrintField label="Referred by" value={view.orderedBy} />
        <PrintField label="Priority" value={humanize(order.priority)} />
        <PrintField
          label="Sample collected"
          value={collected?.at ? formatDateTime(collected.at) : "—"}
        />
        <PrintField label="Status" value={humanize(order.status)} />
      </section>

      {view.tests.map(test => (
        <div key={test.itemId}>
          <p className="border-b border-neutral-400 pb-1 text-[13px] font-semibold uppercase tracking-wide text-neutral-800">
            {test.name}
          </p>
          {test.results.length ? (
            <table className="mt-1 w-full border-collapse text-left text-[12.5px]">
              <thead>
                <tr className="text-[11px] uppercase tracking-wide text-neutral-500">
                  <th className="py-1 pr-2 font-semibold">Investigation</th>
                  <th className="py-1 pr-2 font-semibold">Result</th>
                  <th className="py-1 pr-2 font-semibold">Unit</th>
                  <th className="py-1 font-semibold">Reference range</th>
                </tr>
              </thead>
              <tbody>
                {test.results.map(result => {
                  const flagged = result.flag !== "NORMAL";
                  return (
                    <tr
                      key={result.parameter}
                      className="border-b border-neutral-200"
                    >
                      <td className="py-1 pr-2">{result.parameter}</td>
                      <td
                        className={cn(
                          "py-1 pr-2 tabular-nums",
                          flagged && "font-bold"
                        )}
                      >
                        {result.value}
                        {flagged ? (
                          <span className="ml-1 text-[11px]">
                            {FLAG_TEXT[result.flag] ?? "*"}
                          </span>
                        ) : null}
                      </td>
                      <td className="py-1 pr-2">{result.unit}</td>
                      <td className="py-1 text-neutral-600">
                        {result.reference || "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <p className="mt-1 text-neutral-600">Result awaited.</p>
          )}
        </div>
      ))}

      {data.clinicalNotes ? (
        <PrintField label="Clinical notes" value={data.clinicalNotes} />
      ) : null}
      <p className="text-[11px] text-neutral-500">
        L / H: below / above the reference range · LL / HH: critical — the
        clinician has been informed.
      </p>
    </PrintDocument>
  );
}
