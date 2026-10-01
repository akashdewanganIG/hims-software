"use client";

import * as React from "react";
import Link from "next/link";

import { Printer, ReceiptText, RotateCcw, Wallet } from "@/components/icons";
import { DataTable, type Column } from "@/components/shared/data-table";
import { DownloadPdfButton } from "@/components/shared/download-pdf";
import { EntityLink, PatientCell, RefCode } from "@/components/shared/entity";
import {
  ErrorBanner,
  PageHeader,
  PageShell,
  Panel,
  PanelRowsSkeleton,
  StatCard,
} from "@/components/shared/page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tag } from "@/components/ui/tag";
import { useCollections, type CollectionRow } from "@/features/billing/api";
import { staffName } from "@/lib/api/lookup";
import { formatINR, formatTime, humanize } from "@/lib/format";
import { pdfName } from "@/lib/pdf/layout";
import { collectionsPdf } from "@/lib/pdf/records";
import { useSession } from "@/lib/session";
import { isoDate } from "@/lib/sim/time";

/**
 * Day-end collection (cashier closing): what came in and went out today, by
 * payment method, source and cashier — the figures handed over to accounts.
 */
export default function CollectionsPage() {
  const [date, setDate] = React.useState(() => isoDate(new Date()));
  const { data, isLoading, error } = useCollections(date);
  const { staff } = useSession();
  const t = data?.totals;

  const columns: Column<CollectionRow>[] = [
    {
      id: "at",
      header: "Time",
      sortValue: r => r.at,
      cell: r => <span className="tabular-nums">{formatTime(r.at)}</span>,
    },
    {
      id: "code",
      header: "Receipt",
      sortValue: r => r.code,
      cell: r => <RefCode>{r.code}</RefCode>,
    },
    {
      id: "patient",
      header: "Patient",
      cell: r =>
        r.patient ? <PatientCell patient={r.patient} /> : <span>—</span>,
    },
    {
      id: "bill",
      header: "Bill",
      cell: r => (
        <EntityLink
          href={`/billing/${r.invoiceId}`}
          module="billing"
          className="font-mono text-xs"
        >
          {r.invoiceCode}
        </EntityLink>
      ),
    },
    {
      id: "source",
      header: "Source",
      sortValue: r => r.source,
      cell: r => r.source,
    },
    {
      id: "method",
      header: "Method",
      sortValue: r => r.method,
      cell: r => (
        <span>
          {humanize(r.method)}
          {r.reference ? (
            <span className="block font-mono text-[0.6875rem] text-muted-foreground">
              {r.reference}
            </span>
          ) : null}
        </span>
      ),
    },
    {
      id: "amount",
      header: "Amount",
      align: "right",
      sortValue: r => (r.kind === "REFUND" ? -r.amount : r.amount),
      cell: r =>
        r.kind === "REFUND" ? (
          <span className="text-error-foreground">−{formatINR(r.amount)}</span>
        ) : (
          formatINR(r.amount)
        ),
    },
    {
      id: "by",
      header: "Cashier",
      sortValue: r => r.by,
      cell: r => r.by,
    },
  ];

  return (
    <PageShell>
      <PageHeader
        title="Day-end collection"
        subtitle="Receipts and refunds for the day by payment method, source and cashier — the closing handed over to accounts."
        breadcrumb={[
          { label: "Billing", href: "/billing" },
          { label: "Day-end collection" },
        ]}
        actions={
          <>
            <Input
              type="date"
              aria-label="Date"
              className="w-auto"
              max={isoDate(new Date())}
              value={date}
              onChange={e => e.target.value && setDate(e.target.value)}
            />
            <DownloadPdfButton
              fileName={pdfName("Collections", date)}
              disabled={!data}
              build={() =>
                collectionsPdf(data!, staff ? staffName(staff) : "—")
              }
            />
            <Button asChild variant="outline">
              <Link href={`/billing/collections/print?date=${date}`}>
                <Printer className="size-4" />
                Print closing
              </Link>
            </Button>
          </>
        }
      />
      <ErrorBanner error={error} />
      <section className="grid-auto-fit-sm gap-3">
        <StatCard
          label="Collected"
          value={t ? formatINR(t.collected) : "—"}
          icon={Wallet}
          loading={isLoading}
          hint={`${t?.receipts ?? 0} receipts`}
        />
        <StatCard
          label="Refunded"
          value={t ? formatINR(t.refunded) : "—"}
          icon={RotateCcw}
          loading={isLoading}
          tone={t?.refunded ? "warning" : "neutral"}
          hint={`${t?.refunds ?? 0} refunds`}
        />
        <StatCard
          label="Net collection"
          value={t ? formatINR(t.net) : "—"}
          icon={ReceiptText}
          loading={isLoading}
          tone="positive"
        />
      </section>

      <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-4">
        {(
          [
            ["By payment method", data?.byMethod, (k: string) => humanize(k)],
            ["By source", data?.bySource, (k: string) => k],
            ["By cashier", data?.byCashier, (k: string) => k],
          ] as const
        ).map(([title, groups, label]) => (
          <Panel key={title} title={title}>
            {!groups ? (
              <PanelRowsSkeleton rows={3} />
            ) : groups.length ? (
              <table className="w-full text-[0.8125rem]">
                <tbody className="divide-y divide-border">
                  {groups.map(g => (
                    <tr key={g.key}>
                      <td className="py-1.5 pr-2">
                        {label(g.key)}
                        <span className="block text-xs text-muted-foreground">
                          {g.receipts} receipt{g.receipts === 1 ? "" : "s"}
                          {g.refunds ? ` · ${g.refunds} refund(s)` : ""}
                        </span>
                      </td>
                      <td className="py-1.5 text-right tabular-nums font-medium">
                        {formatINR(g.net)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="py-4 text-center text-sm text-muted-foreground">
                Nothing collected.
              </p>
            )}
          </Panel>
        ))}
        <Panel
          title="Billed by category"
          description="Charges posted on the day."
        >
          {!data ? (
            <PanelRowsSkeleton rows={3} />
          ) : data.billed.length ? (
            <ul className="divide-y divide-border text-[0.8125rem]">
              {data.billed.map(b => (
                <li
                  key={b.category}
                  className="flex items-center justify-between gap-2 py-1.5"
                >
                  <Tag tone="neutral">{humanize(b.category)}</Tag>
                  <span className="tabular-nums">{formatINR(b.amount)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="py-4 text-center text-sm text-muted-foreground">
              Nothing billed.
            </p>
          )}
        </Panel>
      </div>

      <Panel flush title="Receipts and refunds">
        <DataTable
          columns={columns}
          rows={data?.rows ?? []}
          keyOf={r => r.id}
          isLoading={isLoading}
          initialSort={{ id: "at", direction: "desc" }}
          pageSize={20}
          empty="No receipts on this day."
        />
      </Panel>
    </PageShell>
  );
}
