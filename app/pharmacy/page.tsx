"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";

import {
  AlertTriangle,
  CheckCheck,
  Hourglass,
  Pill,
  PrescriptionIcon,
  ShoppingBag,
} from "@/components/icons";
import { DataTable, type Column } from "@/components/shared/data-table";
import { PatientCell, RefCode } from "@/components/shared/entity";
import {
  ErrorBanner,
  PageHeader,
  PageShell,
  Panel,
  StatCard,
  StatusBadge,
} from "@/components/shared/page";
import { Button } from "@/components/ui/button";
import { CategorySwitcher } from "@/components/ui/category-switcher";
import { SearchInput } from "@/components/ui/search-input";
import { Tag } from "@/components/ui/tag";
import {
  useInventory,
  usePrescriptionQueue,
  type RxQueueRow,
} from "@/features/pharmacy/api";
import { CounterSaleDialog } from "@/features/pharmacy/counter-sale-dialog";
import { DispenseSheet } from "@/features/pharmacy/dispense-sheet";
import { useSession } from "@/lib/session";
import { formatDuration, formatTime, formatDateShort } from "@/lib/format";
import { isSameDay } from "@/lib/sim/time";

type View = "open" | "today" | "all";

export default function PharmacyPage() {
  return (
    <React.Suspense>
      <PharmacyQueue />
    </React.Suspense>
  );
}

function PharmacyQueue() {
  const params = useSearchParams();
  const { can } = useSession();
  const [counterOpen, setCounterOpen] = React.useState(false);
  const [view, setView] = React.useState<View>("open");
  const [q, setQ] = React.useState("");
  const [openId, setOpenId] = React.useState<string | null>(params.get("open"));
  const {
    data: rows = [],
    isLoading,
    error,
  } = usePrescriptionQueue({ view, q: q || undefined });
  const { data: open = [] } = usePrescriptionQueue({ view: "open" });
  const { data: today = [] } = usePrescriptionQueue({ view: "today" });
  const { data: inventory = [] } = useInventory();

  const low = inventory.filter(m => m.status !== "OK").length;
  const expiring = inventory.filter(
    m => m.nearExpiryQty > 0 || m.expiredQty > 0
  ).length;
  const oldest = open.length ? Math.max(...open.map(r => r.waitingMinutes)) : 0;

  const columns: Column<RxQueueRow>[] = [
    {
      id: "code",
      header: "Rx",
      sortValue: r => r.code,
      cell: r => <RefCode className="text-foreground">{r.code}</RefCode>,
    },
    {
      id: "patient",
      header: "Patient",
      sortValue: r => r.patient.name,
      cell: r => <PatientCell patient={r.patient} />,
    },
    {
      id: "setting",
      header: "Setting",
      sortValue: r => r.setting,
      cell: r => (
        <div className="min-w-0">
          <Tag tone={r.setting === "OPD" ? "neutral" : "progress"}>
            {r.setting}
          </Tag>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {r.location}
          </p>
        </div>
      ),
    },
    {
      id: "prescriber",
      header: "Prescriber",
      sortValue: r => r.prescriber,
      cell: r => r.prescriber,
    },
    {
      id: "created",
      header: "Received",
      sortValue: r => r.createdAt,
      cell: r => (
        <span className="tabular-nums">
          {isSameDay(r.createdAt, new Date())
            ? formatTime(r.createdAt)
            : formatDateShort(r.createdAt)}
        </span>
      ),
    },
    {
      id: "waiting",
      header: "Waiting",
      align: "right",
      sortValue: r => r.waitingMinutes,
      defaultHidden: view !== "open",
      cell: r => (
        <span
          className={
            r.waitingMinutes > 60 ? "font-semibold text-error-foreground" : ""
          }
        >
          {formatDuration(r.waitingMinutes)}
        </span>
      ),
    },
    {
      id: "items",
      header: "Items",
      align: "right",
      sortValue: r => r.items,
      cell: r => (
        <span className="tabular-nums">
          {r.remainingItems
            ? `${r.remainingItems} of ${r.items} open`
            : `${r.items}`}
        </span>
      ),
    },
    {
      id: "stock",
      header: "Stock",
      cell: r =>
        r.stockShort ? (
          <Tag tone="danger">Short</Tag>
        ) : r.remainingItems ? (
          <Tag tone="active">Available</Tag>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      id: "status",
      header: "Status",
      sortValue: r => r.status,
      cell: r => <StatusBadge status={r.status} />,
    },
    {
      id: "action",
      header: "",
      align: "right",
      cell: r => (
        <Button
          size="sm"
          variant={r.remainingItems ? "default" : "outline"}
          onClick={event => {
            event.stopPropagation();
            setOpenId(r.id);
          }}
        >
          {r.remainingItems ? "Dispense" : "View"}
        </Button>
      ),
    },
  ];

  return (
    <PageShell>
      <PageHeader
        title="Prescription queue"
        subtitle="Prescriptions from OPD visits and wards. Dispensing draws stock first-expiry-first-out and posts to the patient's bill."
        actions={
          can("pharmacy.dispense") ? (
            <Button variant="outline" onClick={() => setCounterOpen(true)}>
              <ShoppingBag className="size-4" />
              Counter sale
            </Button>
          ) : null
        }
      />
      <CounterSaleDialog open={counterOpen} onOpenChange={setCounterOpen} />
      <ErrorBanner error={error} />
      <section className="grid-auto-fit-sm gap-3" aria-label="Pharmacy summary">
        <StatCard
          label="Awaiting dispensing"
          value={open.length}
          icon={PrescriptionIcon}
          loading={isLoading}
          tone={open.length > 10 ? "warning" : "neutral"}
          hint={`${open.filter(r => r.status === "PARTIALLY_DISPENSED").length} partly dispensed`}
        />
        <StatCard
          label="Oldest waiting"
          value={open.length ? formatDuration(oldest) : "—"}
          icon={Hourglass}
          loading={isLoading}
          tone={oldest > 120 ? "warning" : "neutral"}
        />
        <StatCard
          label="Dispensed today"
          value={today.length}
          icon={CheckCheck}
          loading={isLoading}
          tone="positive"
        />
        <StatCard
          label="Low or out of stock"
          value={low}
          icon={Pill}
          tone={low ? "critical" : "neutral"}
          href="/pharmacy/inventory"
          hint="Below reorder level"
        />
        <StatCard
          label="Expiry watch"
          value={expiring}
          icon={AlertTriangle}
          tone={expiring ? "warning" : "neutral"}
          href="/pharmacy/inventory"
          hint="Expired or within 60 days"
        />
      </section>
      <Panel flush>
        <DataTable
          columns={columns}
          rows={rows}
          keyOf={r => r.id}
          isLoading={isLoading}
          initialSort={
            view === "open"
              ? { id: "created", direction: "asc" }
              : { id: "created", direction: "desc" }
          }
          empty={
            view === "open" ? "The queue is clear." : "No prescriptions match."
          }
          onRowClick={r => setOpenId(r.id)}
          toolbar={
            <>
              <CategorySwitcher
                label="Queue view"
                value={view}
                onValueChange={setView}
                items={[
                  { value: "open", label: "To dispense", count: open.length },
                  {
                    value: "today",
                    label: "Dispensed today",
                    count: today.length,
                  },
                  { value: "all", label: "All" },
                ]}
              />
              <SearchInput
                wrapperClassName="min-w-48 flex-1"
                placeholder="Patient, UHID or Rx number"
                value={q}
                onChange={e => setQ(e.target.value)}
              />
            </>
          }
        />
      </Panel>
      <DispenseSheet prescriptionId={openId} onClose={() => setOpenId(null)} />
    </PageShell>
  );
}
