"use client";

import { useParams } from "next/navigation";

import { PrintDocument, PrintField } from "@/components/shared/print-document";
import {
  EmptyState,
  PageShell,
  PanelRowsSkeleton,
} from "@/components/shared/page";
import { useInvoice } from "@/features/billing/api";
import { pdfName } from "@/lib/pdf/layout";
import { invoicePdf } from "@/lib/pdf/records";
import {
  formatDate,
  formatDateShort,
  formatDateTime,
  formatINR,
  humanize,
} from "@/lib/format";
import { HOSPITAL } from "@/lib/sim/reference";

export default function InvoicePrint() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading } = useInvoice(id);
  if (isLoading) {
    return (
      <PageShell>
        <PanelRowsSkeleton rows={10} />
      </PageShell>
    );
  }
  if (!data) {
    return (
      <PageShell>
        <EmptyState title="Bill not found" />
      </PageShell>
    );
  }
  const { invoice, totals, patient } = data;
  const title =
    invoice.status === "DRAFT"
      ? "Interim bill"
      : invoice.admissionId
        ? "Final inpatient bill"
        : "OPD bill";

  return (
    <PrintDocument
      pdf={{
        fileName: pdfName("Bill", invoice.code),
        build: () => invoicePdf(data),
      }}
      title={title}
      reference={invoice.code}
      footer={
        <div>
          <p>
            Healthcare services are exempt from GST. GSTIN {HOSPITAL.gstin}.
          </p>
          <p className="mt-6 border-t border-neutral-400 pt-1 font-medium text-neutral-800">
            Authorised signatory
          </p>
        </div>
      }
    >
      <section className="grid grid-cols-2 gap-x-8 gap-y-3 sm:grid-cols-4">
        <PrintField label="Patient" value={patient.name} />
        <PrintField label="UHID" value={patient.uhid} />
        <PrintField
          label="Age / sex"
          value={`${patient.age} y / ${humanize(patient.gender)}`}
        />
        <PrintField
          label="Bill date"
          value={formatDate(invoice.finalisedAt ?? invoice.createdAt)}
        />
        <PrintField
          label="Address"
          value={`${patient.address}, ${patient.city}`}
        />
        {data.admission ? (
          <>
            <PrintField label="Admission" value={data.admission.code} />
            <PrintField
              label="Admitted"
              value={formatDateTime(data.admission.admittedAt)}
            />
            <PrintField
              label="Discharged"
              value={
                data.admission.dischargedAt
                  ? formatDateTime(data.admission.dischargedAt)
                  : "In-house"
              }
            />
          </>
        ) : data.encounter ? (
          <>
            <PrintField label="Visit" value={data.encounter.code} />
            <PrintField label="Consultant" value={data.encounter.doctor} />
            <PrintField label="Department" value={data.encounter.department} />
          </>
        ) : null}
      </section>

      <table className="w-full border-collapse text-[12px]">
        <thead>
          <tr className="border-y border-neutral-900 text-left">
            <th className="py-1.5 pr-2">Date</th>
            <th className="py-1.5 pr-2">Particulars</th>
            <th className="py-1.5 pr-2 text-right">Qty</th>
            <th className="py-1.5 pr-2 text-right">Rate</th>
            <th className="py-1.5 pr-2 text-right">Disc.</th>
            <th className="py-1.5 text-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          {data.items.map(item => (
            <tr key={item.id} className="border-b border-neutral-200">
              <td className="py-1 pr-2 tabular-nums">
                {formatDateShort(item.serviceDate)}
              </td>
              <td className="py-1 pr-2">
                {humanize(item.category)} — {item.description}
              </td>
              <td className="py-1 pr-2 text-right tabular-nums">
                {item.quantity}
              </td>
              <td className="py-1 pr-2 text-right tabular-nums">
                {formatINR(item.unitPrice)}
              </td>
              <td className="py-1 pr-2 text-right tabular-nums">
                {item.discount ? formatINR(item.discount) : "—"}
              </td>
              <td className="py-1 text-right tabular-nums">
                {formatINR(item.amount)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="ml-auto w-64 space-y-1 text-[12px]">
        {[
          ["Gross", formatINR(totals.gross)],
          ["Discount", `−${formatINR(totals.discount)}`],
          ["Net payable", formatINR(totals.total)],
          ["Received", formatINR(totals.netPaid)],
          ["Balance due", formatINR(totals.balance)],
        ].map(([label, value]) => (
          <div
            key={label}
            className={
              label === "Net payable" || label === "Balance due"
                ? "flex justify-between border-t border-neutral-900 pt-1 font-semibold"
                : "flex justify-between"
            }
          >
            <span>{label}</span>
            <span className="tabular-nums">{value}</span>
          </div>
        ))}
      </div>

      {data.payments.length ? (
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
            Payments
          </p>
          <ul className="mt-1 space-y-0.5 text-[12px]">
            {data.payments.map(p => (
              <li key={p.id} className="flex justify-between">
                <span>
                  {p.code} · {formatDateTime(p.receivedAt)} ·{" "}
                  {p.kind === "REFUND" ? "Refund" : humanize(p.method)}
                </span>
                <span className="tabular-nums">
                  {p.kind === "REFUND" ? "−" : ""}
                  {formatINR(p.amount)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </PrintDocument>
  );
}
