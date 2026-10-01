"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";

import { PrintDocument, PrintField } from "@/components/shared/print-document";
import { PageShell, PanelRowsSkeleton } from "@/components/shared/page";
import { useCollections } from "@/features/billing/api";
import { pdfName } from "@/lib/pdf/layout";
import { collectionsPdf } from "@/lib/pdf/records";
import { staffName } from "@/lib/api/lookup";
import { formatDate, formatINR, formatTime, humanize } from "@/lib/format";
import { useSession } from "@/lib/session";
import { isoDate } from "@/lib/sim/time";

export default function CollectionsPrintPage() {
  return (
    <React.Suspense>
      <CollectionsPrint />
    </React.Suspense>
  );
}

function CollectionsPrint() {
  const params = useSearchParams();
  const date = params.get("date") ?? isoDate(new Date());
  const { data } = useCollections(date);
  const { staff } = useSession();
  if (!data)
    return (
      <PageShell>
        <PanelRowsSkeleton rows={10} />
      </PageShell>
    );
  const t = data.totals;
  const table = (
    title: string,
    rows: Array<{ key: string; net: number; receipts: number }>,
    label: (k: string) => string
  ) => (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
        {title}
      </p>
      <table className="mt-1 w-full border-collapse text-[12.5px]">
        <tbody>
          {rows.map(r => (
            <tr key={r.key} className="border-b border-neutral-200">
              <td className="py-1 pr-2">{label(r.key)}</td>
              <td className="py-1 pr-2 text-neutral-600">{r.receipts}</td>
              <td className="py-1 text-right tabular-nums">
                {formatINR(r.net)}
              </td>
            </tr>
          ))}
          {!rows.length ? (
            <tr>
              <td className="py-1 text-neutral-600">—</td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );

  return (
    <PrintDocument
      pdf={{
        fileName: pdfName("Collections", date),
        build: () => collectionsPdf(data, staff ? staffName(staff) : "—"),
      }}
      title="Day-end collection report"
      reference={formatDate(date)}
      footer={
        <div className="grid grid-cols-2 gap-10 pt-8">
          <p className="border-t border-neutral-400 pt-1">
            Prepared by {staff ? staffName(staff) : "—"}
          </p>
          <p className="border-t border-neutral-400 pt-1">
            Received by (accounts)
          </p>
        </div>
      }
    >
      <section className="grid grid-cols-2 gap-x-8 gap-y-3 sm:grid-cols-4">
        <PrintField label="Collected" value={formatINR(t.collected)} />
        <PrintField label="Refunded" value={formatINR(t.refunded)} />
        <PrintField label="Net collection" value={formatINR(t.net)} />
        <PrintField
          label="Receipts / refunds"
          value={`${t.receipts} / ${t.refunds}`}
        />
      </section>
      <section className="grid gap-6 sm:grid-cols-3">
        {table("By payment method", data.byMethod, humanize)}
        {table("By source", data.bySource, k => k)}
        {table("By cashier", data.byCashier, k => k)}
      </section>
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
          Receipts and refunds
        </p>
        <table className="mt-1 w-full border-collapse text-left text-[11.5px]">
          <thead>
            <tr className="border-b border-neutral-400 text-[10.5px] uppercase tracking-wide text-neutral-500">
              <th className="py-1 pr-2 font-semibold">Time</th>
              <th className="py-1 pr-2 font-semibold">Receipt</th>
              <th className="py-1 pr-2 font-semibold">Bill</th>
              <th className="py-1 pr-2 font-semibold">Patient</th>
              <th className="py-1 pr-2 font-semibold">Method</th>
              <th className="py-1 text-right font-semibold">Amount</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map(r => (
              <tr key={r.id} className="border-b border-neutral-200">
                <td className="py-0.5 pr-2 tabular-nums">{formatTime(r.at)}</td>
                <td className="py-0.5 pr-2 font-mono">{r.code}</td>
                <td className="py-0.5 pr-2 font-mono">{r.invoiceCode}</td>
                <td className="py-0.5 pr-2">
                  {r.patient ? `${r.patient.name} (${r.patient.uhid})` : "—"}
                </td>
                <td className="py-0.5 pr-2">{humanize(r.method)}</td>
                <td className="py-0.5 text-right tabular-nums">
                  {r.kind === "REFUND" ? "−" : ""}
                  {formatINR(r.amount)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </PrintDocument>
  );
}
