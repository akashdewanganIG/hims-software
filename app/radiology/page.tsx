"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ImageSquare, Plus, TriangleAlert, Wrench } from "@/components/icons";
import { DataTable, type Column } from "@/components/shared/data-table";
import {
  ErrorBanner,
  PageHeader,
  PageShell,
  SelectField,
  StatCard,
  StatusBadge,
} from "@/components/shared/page";
import { Button } from "@/components/ui/button";
import { CategorySwitcher } from "@/components/ui/category-switcher";
import { SearchInput } from "@/components/ui/search-input";
import {
  useRadiologySummary,
  useRadiologyWorklist,
  type RadiologyWorklistRow,
} from "@/features/radiology/api";
import { RadiologyOrderDialog } from "@/features/radiology/order-dialog";
import { formatDateTime, humanize } from "@/lib/format";
import { useSession } from "@/lib/session";
import { RADIOLOGY_MODALITIES } from "@/lib/sim/schema";

type Stage = "waiting" | "acquisition" | "reporting" | "completed" | "all";

export default function RadiologyPage() {
  const router = useRouter();
  const { can } = useSession();
  const [stage, setStage] = React.useState<Stage>("waiting");
  const [q, setQ] = React.useState("");
  const [modality, setModality] = React.useState("");
  const [orderOpen, setOrderOpen] = React.useState(false);
  const {
    data: rows = [],
    isLoading,
    error,
  } = useRadiologyWorklist({
    stage,
    q: q || undefined,
    modality: modality || undefined,
  });
  const { data: summary } = useRadiologySummary();
  const columns: Column<RadiologyWorklistRow>[] = [
    {
      id: "accession",
      header: "Accession",
      sortValue: row => row.accessionNumber,
      cell: row => (
        <div>
          <p className="font-mono text-xs">{row.accessionNumber}</p>
          <p className="text-xs text-muted-foreground">
            {humanize(row.source)}
          </p>
        </div>
      ),
    },
    {
      id: "patient",
      header: "Patient",
      sortValue: row => row.patient.name,
      cell: row => (
        <div>
          <p>{row.patient.name}</p>
          <p className="text-xs text-muted-foreground">{row.patient.uhid}</p>
        </div>
      ),
    },
    {
      id: "procedure",
      header: "Study",
      sortValue: row => row.procedure,
      cell: row => (
        <div>
          <p>{row.procedure}</p>
          <p className="text-xs text-muted-foreground">
            {humanize(row.modality)}
          </p>
        </div>
      ),
    },
    {
      id: "priority",
      header: "Priority",
      sortValue: row => row.priority,
      cell: row => <StatusBadge status={row.priority} />,
    },
    {
      id: "status",
      header: "Status",
      sortValue: row => row.status,
      cell: row => (
        <div className="flex items-center gap-2">
          <StatusBadge status={row.status} />
          {row.acknowledgementPending ? (
            <TriangleAlert
              className="size-4 text-error"
              aria-label="Critical acknowledgement pending"
            />
          ) : null}
        </div>
      ),
    },
    {
      id: "scheduled",
      header: "Scheduled",
      sortValue: row => row.scheduledAt ?? "",
      cell: row =>
        row.scheduledAt ? (
          formatDateTime(row.scheduledAt)
        ) : (
          <span className="text-muted-foreground">Unscheduled</span>
        ),
    },
    {
      id: "equipment",
      header: "Room / equipment",
      cell: row =>
        row.equipment ?? <span className="text-muted-foreground">—</span>,
    },
  ];
  return (
    <PageShell>
      <PageHeader
        title="Radiology & imaging"
        subtitle="Orders, safety, acquisition, PACS-ready studies and signed diagnostic reports."
        actions={
          can("radiology.order") ? (
            <Button onClick={() => setOrderOpen(true)}>
              <Plus className="size-4" />
              New imaging order
            </Button>
          ) : undefined
        }
      />
      <ErrorBanner error={error} />
      <section className="grid-auto-fit-sm gap-3">
        <StatCard
          label="Awaiting study"
          value={summary?.waiting ?? 0}
          icon={ImageSquare}
          loading={!summary}
        />
        <StatCard
          label="Awaiting report"
          value={summary?.reporting ?? 0}
          icon={ImageSquare}
          loading={!summary}
          tone={summary?.reporting ? "warning" : "neutral"}
        />
        <StatCard
          label="Completed today"
          value={summary?.completedToday ?? 0}
          icon={ImageSquare}
          loading={!summary}
          tone="positive"
        />
        <StatCard
          label="Critical unacknowledged"
          value={summary?.criticalUnacknowledged ?? 0}
          icon={TriangleAlert}
          loading={!summary}
          tone={summary?.criticalUnacknowledged ? "critical" : "neutral"}
        />
        <StatCard
          label="Equipment unavailable"
          value={summary?.equipmentUnavailable ?? 0}
          icon={Wrench}
          loading={!summary}
        />
      </section>
      <DataTable
        columns={columns}
        rows={rows}
        keyOf={row => row.id}
        isLoading={isLoading}
        onRowClick={row => router.push(`/radiology/studies/${row.id}`)}
        initialSort={{ id: "scheduled", direction: "asc" }}
        empty="No imaging orders in this work queue."
        toolbar={
          <>
            <CategorySwitcher
              label="Worklist stage"
              value={stage}
              onValueChange={setStage}
              items={[
                { value: "waiting", label: "Waiting", count: summary?.waiting },
                { value: "acquisition", label: "Acquisition" },
                {
                  value: "reporting",
                  label: "Reporting",
                  count: summary?.reporting,
                },
                { value: "completed", label: "Completed" },
                { value: "all", label: "All" },
              ]}
            />
            <SearchInput
              wrapperClassName="min-w-48 flex-1"
              placeholder="Patient, UHID, accession or study"
              value={q}
              onChange={event => setQ(event.target.value)}
            />
            <SelectField
              className="w-full sm:w-48"
              aria-label="Modality"
              value={modality}
              onChange={event => setModality(event.target.value)}
            >
              <option value="">All modalities</option>
              {RADIOLOGY_MODALITIES.map(value => (
                <option key={value} value={value}>
                  {humanize(value)}
                </option>
              ))}
            </SelectField>
          </>
        }
      />
      <RadiologyOrderDialog open={orderOpen} onOpenChange={setOrderOpen} />
    </PageShell>
  );
}
