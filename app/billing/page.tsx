"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import {
  CreditCard,
  Hourglass,
  ReceiptText,
  RotateCcw,
  Wallet,
} from "@/components/icons";
import { DataTable, type Column } from "@/components/shared/data-table";
import { PatientCell, RefCode } from "@/components/shared/entity";
import {
  ErrorBanner,
  PageHeader,
  PageShell,
  Panel,
  SelectField,
  StatCard,
  StatusBadge,
} from "@/components/shared/page";
import { CategorySwitcher } from "@/components/ui/category-switcher";
import { SearchInput } from "@/components/ui/search-input";
import { Tag } from "@/components/ui/tag";
import {
  useBillingSummary,
  useInvoices,
  type BillView,
  type InvoiceRow,
} from "@/features/billing/api";
import {
  formatDateShort,
  formatINR,
  formatINRCompact,
  humanize,
  pluralize,
} from "@/lib/format";

export default function BillingPage() {
  const router = useRouter();
  const [view, setView] = React.useState<BillView>("due");
  const [setting, setSetting] = React.useState("");
  const [q, setQ] = React.useState("");
  const {
    data: rows = [],
    isLoading,
    error,
  } = useInvoices({
    view,
    q: q || undefined,
    setting: setting || undefined,
    days: view === "paid" || view === "all" ? 30 : undefined,
  });
  const { data: summary } = useBillingSummary();

  const columns: Column<InvoiceRow>[] = [
    {
      id: "code",
      header: "Bill",
      sortValue: r => r.code,
      cell: r => <RefCode className="text-foreground">{r.code}</RefCode>,
    },
    {
      id: "date",
      header: "Date",
      sortValue: r => r.createdAt,
      cell: r => (
        <span className="tabular-nums">{formatDateShort(r.createdAt)}</span>
      ),
    },
    {
      id: "patient",
      header: "Patient",
      sortValue: r => r.patient.name,
      cell: r => <PatientCell patient={r.patient} />,
    },
    {
      id: "context",
      header: "For",
      cell: r => (
        <div className="min-w-0">
          <Tag tone={r.setting === "IPD" ? "progress" : "neutral"}>
            {r.setting}
          </Tag>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {r.context}
          </p>
        </div>
      ),
    },
    {
      id: "categories",
      header: "Charges",
      cell: r => (
        <span className="line-clamp-1 max-w-56 text-muted-foreground">
          {r.categories.map(c => humanize(c)).join(", ")}
        </span>
      ),
    },
    {
      id: "total",
      header: "Total",
      align: "right",
      sortValue: r => r.total,
      cell: r => <span className="font-medium">{formatINR(r.total)}</span>,
    },
    {
      id: "paid",
      header: "Paid",
      align: "right",
      sortValue: r => r.netPaid,
      cell: r => formatINR(r.netPaid),
    },
    {
      id: "balance",
      header: view === "refund" ? "Refund due" : "Balance",
      align: "right",
      sortValue: r => (view === "refund" ? r.refundDue : r.balance),
      cell: r =>
        view === "refund" ? (
          <span className="font-semibold text-info-foreground">
            {formatINR(r.refundDue)}
          </span>
        ) : (
          <span
            className={
              r.balance > 0
                ? "font-semibold text-error-foreground"
                : "text-muted-foreground"
            }
          >
            {formatINR(r.balance)}
          </span>
        ),
    },
    {
      id: "status",
      header: "Status",
      sortValue: r => r.status,
      cell: r => (
        <StatusBadge
          status={r.status}
          label={r.status === "DRAFT" ? "Running" : undefined}
        />
      ),
    },
  ];

  return (
    <PageShell>
      <PageHeader
        title="Billing"
        subtitle="One ledger for OPD, IPD, lab and pharmacy. Charges arrive from the services that raise them; totals are always computed from the lines."
      />
      <ErrorBanner error={error} />
      <section className="grid-auto-fit-sm gap-3">
        <StatCard
          label="Collected today"
          value={summary ? formatINRCompact(summary.collectedToday) : "—"}
          icon={Wallet}
          tone="positive"
          hint={
            summary
              ? `Refunded ${formatINR(summary.refundedToday, true)}`
              : undefined
          }
        />
        <StatCard
          label="Outstanding"
          value={summary ? formatINRCompact(summary.outstanding) : "—"}
          icon={Hourglass}
          tone={summary?.outstandingCount ? "warning" : "neutral"}
          hint={
            summary
              ? `${pluralize(summary.outstandingCount, "bill")} with a balance`
              : undefined
          }
        />
        <StatCard
          label="Running IPD bills"
          value={summary ? formatINRCompact(summary.running) : "—"}
          icon={ReceiptText}
          tone="info"
          hint={
            summary
              ? `${pluralize(summary.runningCount, "admission")} accruing`
              : undefined
          }
        />
        <StatCard
          label="Refunds due"
          value={summary?.refundDue ?? 0}
          icon={RotateCcw}
          tone={summary?.refundDue ? "warning" : "neutral"}
          hint="Paid more than the bill"
        />
        <StatCard
          label="Bills raised today"
          value={summary?.billsToday ?? 0}
          icon={CreditCard}
        />
      </section>
      <Panel flush>
        <DataTable
          columns={columns}
          rows={rows}
          keyOf={r => r.id}
          isLoading={isLoading}
          initialSort={{ id: "date", direction: "desc" }}
          pageSize={15}
          empty={view === "due" ? "No outstanding bills." : "No bills match."}
          onRowClick={r => router.push(`/billing/${r.id}`)}
          toolbar={
            <>
              <CategorySwitcher
                label="Bill view"
                value={view}
                onValueChange={setView}
                items={[
                  {
                    value: "due",
                    label: "Due",
                    count: summary?.outstandingCount,
                  },
                  {
                    value: "running",
                    label: "Running (IPD)",
                    count: summary?.runningCount,
                  },
                  {
                    value: "refund",
                    label: "Refund due",
                    count: summary?.refundDue,
                  },
                  { value: "paid", label: "Paid · 30 d" },
                  { value: "all", label: "All" },
                ]}
              />
              <SearchInput
                wrapperClassName="min-w-48 flex-1"
                placeholder="Bill no., patient, UHID or phone"
                value={q}
                onChange={e => setQ(e.target.value)}
              />
              <SelectField
                className="w-full sm:w-32"
                aria-label="Setting"
                value={setting}
                onChange={e => setSetting(e.target.value)}
              >
                <option value="">OPD & IPD</option>
                <option value="OPD">OPD</option>
                <option value="IPD">IPD</option>
              </SelectField>
            </>
          }
        />
      </Panel>
    </PageShell>
  );
}
