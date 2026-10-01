"use client";

import * as React from "react";

import { DataTable, type Column } from "@/components/shared/data-table";
import { EntityLink, PatientCell, RefCode } from "@/components/shared/entity";
import {
  ErrorBanner,
  PageHeader,
  PageShell,
  Panel,
  SelectField,
  StatCard,
} from "@/components/shared/page";
import { CategorySwitcher } from "@/components/ui/category-switcher";
import { SearchInput } from "@/components/ui/search-input";
import { Tag, type TagTone } from "@/components/ui/tag";
import { useTransactions, type TxnRow } from "@/features/pharmacy/api";
import {
  formatDateTime,
  formatINR,
  formatINRCompact,
  formatNumber,
  humanize,
  pluralize,
} from "@/lib/format";
import { PHARMACY_TXN_TYPES } from "@/lib/sim/schema";

const TYPE_TONE: Record<string, TagTone> = {
  DISPENSE: "progress",
  RETURN: "pending",
  RECEIPT: "active",
  WRITE_OFF: "danger",
  SALE: "progress",
};

export default function TransactionsPage() {
  const [type, setType] = React.useState("");
  const [days, setDays] = React.useState(7);
  const [q, setQ] = React.useState("");
  const {
    data: rows = [],
    isLoading,
    error,
  } = useTransactions({ type: type || undefined, days, q: q || undefined });

  const sum = (t: string) =>
    rows.filter(r => r.type === t).reduce((s, r) => s + r.value, 0);
  const columns: Column<TxnRow>[] = [
    {
      id: "at",
      header: "When",
      sortValue: r => r.at,
      cell: r => <span className="tabular-nums">{formatDateTime(r.at)}</span>,
    },
    {
      id: "type",
      header: "Type",
      sortValue: r => r.type,
      cell: r => <Tag tone={TYPE_TONE[r.type]}>{humanize(r.type)}</Tag>,
    },
    {
      id: "medicine",
      header: "Medicine",
      sortValue: r => r.medicine,
      cell: r => <span className="font-medium">{r.medicine}</span>,
    },
    { id: "batch", header: "Batch", cell: r => <RefCode>{r.batch}</RefCode> },
    {
      id: "qty",
      header: "Qty",
      align: "right",
      sortValue: r => r.quantity,
      cell: r => (
        <span
          className={
            r.type === "RECEIPT" || r.type === "RETURN"
              ? "text-success-foreground"
              : ""
          }
        >
          {r.type === "RECEIPT" || r.type === "RETURN" ? "+" : "−"}
          {formatNumber(r.quantity)}
        </span>
      ),
    },
    {
      id: "patient",
      header: "Patient",
      cell: r =>
        r.patient ? (
          <PatientCell patient={r.patient} />
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      id: "rx",
      header: "Rx / supplier",
      cell: r =>
        r.prescriptionCode ? (
          <RefCode>{r.prescriptionCode}</RefCode>
        ) : r.supplier ? (
          <span className="block min-w-0 text-xs">
            <span className="block truncate">{r.supplier}</span>
            <span className="font-mono text-muted-foreground">
              {r.reference}
            </span>
          </span>
        ) : r.type === "SALE" ? (
          <span className="text-xs text-muted-foreground">
            Over the counter
          </span>
        ) : (
          "—"
        ),
    },
    {
      id: "bill",
      header: "Bill",
      cell: r =>
        r.invoiceId ? (
          <EntityLink
            href={`/billing/${r.invoiceId}`}
            module="billing"
            className="font-mono text-xs"
          >
            {r.invoiceCode}
          </EntityLink>
        ) : (
          "—"
        ),
    },
    {
      id: "value",
      header: "Value",
      align: "right",
      sortValue: r => r.value,
      cell: r => formatINR(r.value),
    },
    { id: "by", header: "By", defaultHidden: true, cell: r => r.by },
    {
      id: "note",
      header: "Note",
      defaultHidden: true,
      cell: r => <span className="text-muted-foreground">{r.note}</span>,
    },
    {
      id: "code",
      header: "Ref",
      defaultHidden: true,
      cell: r => <RefCode>{r.code}</RefCode>,
    },
  ];

  return (
    <PageShell>
      <PageHeader
        title="Pharmacy transactions"
        subtitle="Every stock movement: dispensing, counter sales, returns, goods receipts (with supplier invoice) and write-offs, with the bill each sale posted to."
        breadcrumb={[
          { label: "Pharmacy", href: "/pharmacy" },
          { label: "Transactions" },
        ]}
      />
      <ErrorBanner error={error} />
      <section className="grid-auto-fit-sm gap-3">
        <StatCard
          label="Dispensed (MRP)"
          value={formatINRCompact(sum("DISPENSE"))}
          loading={isLoading}
          hint={pluralize(
            rows.filter(r => r.type === "DISPENSE").length,
            "draw"
          )}
        />
        <StatCard
          label="Counter sales (MRP)"
          value={formatINRCompact(sum("SALE"))}
          loading={isLoading}
          hint={`${rows.filter(r => r.type === "SALE").length} OTC lines`}
        />
        <StatCard
          label="Returned (MRP)"
          value={formatINRCompact(sum("RETURN"))}
          loading={isLoading}
        />
        <StatCard
          label="Received (cost)"
          value={formatINRCompact(sum("RECEIPT"))}
          loading={isLoading}
        />
        <StatCard
          label="Written off (cost)"
          value={formatINRCompact(sum("WRITE_OFF"))}
          loading={isLoading}
          tone={sum("WRITE_OFF") ? "warning" : "neutral"}
        />
      </section>
      <Panel flush>
        <DataTable
          columns={columns}
          rows={rows}
          keyOf={r => r.id}
          isLoading={isLoading}
          initialSort={{ id: "at", direction: "desc" }}
          pageSize={20}
          empty="No transactions in this period."
          toolbar={
            <>
              <CategorySwitcher
                label="Period"
                value={String(days)}
                onValueChange={v => setDays(Number(v))}
                items={[
                  { value: "1", label: "24 h" },
                  { value: "7", label: "7 days" },
                  { value: "30", label: "30 days" },
                ]}
              />
              <SearchInput
                wrapperClassName="min-w-48 flex-1"
                placeholder="Medicine, batch, patient, Rx or supplier"
                value={q}
                onChange={e => setQ(e.target.value)}
              />
              <SelectField
                className="w-full sm:w-44"
                aria-label="Type"
                value={type}
                onChange={e => setType(e.target.value)}
              >
                <option value="">All types</option>
                {PHARMACY_TXN_TYPES.map(t => (
                  <option key={t} value={t}>
                    {humanize(t)}
                  </option>
                ))}
              </SelectField>
            </>
          }
        />
      </Panel>
    </PageShell>
  );
}
