"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";

import {
  CheckCheck,
  Hourglass,
  Microscope,
  TestTube,
  Timer,
} from "@/components/icons";
import { DataTable, type Column } from "@/components/shared/data-table";
import { PatientCell, RefCode } from "@/components/shared/entity";
import {
  ErrorBanner,
  PageHeader,
  PageShell,
  Panel,
  PriorityBadge,
  SelectField,
  StatCard,
  StatusBadge,
} from "@/components/shared/page";
import { Button } from "@/components/ui/button";
import { CategorySwitcher } from "@/components/ui/category-switcher";
import { SearchInput } from "@/components/ui/search-input";
import { Tag } from "@/components/ui/tag";
import { useLabWorklist, type LabRow, type LabStage } from "@/features/lab/api";
import { LabOrderSheet } from "@/features/lab/order-sheet";
import {
  formatDateShort,
  formatDuration,
  formatTime,
  humanize,
} from "@/lib/format";
import { useSession } from "@/lib/session";
import { isSameDay } from "@/lib/sim/time";

export default function LabPage() {
  return (
    <React.Suspense>
      <LabWorklist />
    </React.Suspense>
  );
}

function LabWorklist() {
  const params = useSearchParams();
  const { staff } = useSession();
  const [stage, setStage] = React.useState<LabStage>(
    params.get("open")
      ? "all"
      : staff?.role === "DOCTOR"
        ? "reporting"
        : "collection"
  );
  const [q, setQ] = React.useState("");
  const [priority, setPriority] = React.useState("");
  const [openId, setOpenId] = React.useState<string | null>(params.get("open"));

  const {
    data: rows = [],
    isLoading,
    error,
  } = useLabWorklist({
    stage,
    q: q || undefined,
    priority: priority || undefined,
  });
  const { data: all = [] } = useLabWorklist({ stage: "all" });
  const count = (statuses: string[]) =>
    all.filter(r => statuses.includes(r.status)).length;
  const { data: verifiedToday = [] } = useLabWorklist({ stage: "completed" });
  const open = all.filter(
    r => r.status !== "VERIFIED" && r.status !== "CANCELLED"
  );
  const overdue = open.filter(r => r.overdue).length;
  const avgTat = verifiedToday.length
    ? verifiedToday.reduce((s, r) => s + r.elapsedHours, 0) /
      verifiedToday.length
    : null;

  const columns: Column<LabRow>[] = [
    {
      id: "code",
      header: "Order",
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
      id: "tests",
      header: "Tests",
      cell: r => (
        <div className="min-w-0 max-w-72">
          <p className="line-clamp-1">{r.tests.join(", ")}</p>
          <p className="text-xs text-muted-foreground">
            {r.sampleTypes.map(s => humanize(s)).join(" · ")}
            {r.sampleId ? ` · ${r.sampleId}` : ""}
          </p>
        </div>
      ),
    },
    {
      id: "priority",
      header: "Priority",
      sortValue: r =>
        r.priority === "STAT" ? 0 : r.priority === "URGENT" ? 1 : 2,
      cell: r => <PriorityBadge priority={r.priority} />,
    },
    {
      id: "setting",
      header: "From",
      sortValue: r => r.setting,
      cell: r => <span className="text-muted-foreground">{r.setting}</span>,
    },
    {
      id: "ordered",
      header: "Ordered",
      sortValue: r => r.orderedAt,
      cell: r => (
        <span className="tabular-nums">
          {isSameDay(r.orderedAt, new Date())
            ? formatTime(r.orderedAt)
            : formatDateShort(r.orderedAt)}
        </span>
      ),
    },
    {
      id: "tat",
      header: "TAT",
      align: "right",
      sortValue: r => r.elapsedHours - r.expectedHours,
      cell: r => (
        <span
          className={r.overdue ? "font-semibold text-error-foreground" : ""}
          title={`Target ${formatDuration(r.expectedHours * 60)}`}
        >
          {formatDuration(r.elapsedHours * 60)}
        </span>
      ),
    },
    {
      id: "flags",
      header: "Flags",
      cell: r =>
        r.critical ? (
          <Tag tone="danger">{`${r.critical} critical`}</Tag>
        ) : r.abnormal ? (
          <Tag tone="pending">{`${r.abnormal} abnormal`}</Tag>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      id: "status",
      header: "Status",
      sortValue: r => r.status,
      cell: r => (
        <StatusBadge
          status={r.status}
          label={r.status === "RESULT_READY" ? "To verify" : undefined}
        />
      ),
    },
    {
      id: "by",
      header: "Ordered by",
      defaultHidden: true,
      cell: r => r.orderedBy,
    },
    {
      id: "action",
      header: "",
      align: "right",
      cell: r => (
        <Button
          size="sm"
          variant="outline"
          onClick={e => {
            e.stopPropagation();
            setOpenId(r.id);
          }}
        >
          Open
        </Button>
      ),
    },
  ];

  return (
    <PageShell>
      <PageHeader
        title="Lab services"
        subtitle="Order worklist from sample collection to verified report. Verified results appear in the patient's record automatically."
      />
      <ErrorBanner error={error} />
      <section className="grid-auto-fit-sm gap-3">
        <StatCard
          label="Awaiting collection"
          value={count(["ORDERED", "SAMPLE_PENDING"])}
          icon={TestTube}
          loading={isLoading}
        />
        <StatCard
          label="In processing"
          value={count(["COLLECTED", "PROCESSING"])}
          icon={Microscope}
          loading={isLoading}
          tone="info"
        />
        <StatCard
          label="To verify"
          value={count(["RESULT_READY"])}
          icon={Hourglass}
          loading={isLoading}
          tone={count(["RESULT_READY"]) ? "warning" : "neutral"}
        />
        <StatCard
          label="Verified today"
          value={verifiedToday.length}
          icon={CheckCheck}
          loading={isLoading}
          tone="positive"
        />
        <StatCard
          label="Past target TAT"
          value={overdue}
          icon={Timer}
          loading={isLoading}
          tone={overdue ? "critical" : "positive"}
          hint={
            avgTat !== null
              ? `Today's average ${formatDuration(avgTat * 60)}`
              : undefined
          }
        />
      </section>
      <Panel flush>
        <DataTable
          columns={columns}
          rows={rows}
          keyOf={r => r.id}
          isLoading={isLoading}
          initialSort={
            stage === "completed" || stage === "all"
              ? { id: "ordered", direction: "desc" }
              : { id: "priority", direction: "asc" }
          }
          rowClassName={r => (r.overdue ? "bg-error-surface/30" : undefined)}
          empty="Nothing in this stage."
          onRowClick={r => setOpenId(r.id)}
          toolbar={
            <>
              <CategorySwitcher
                label="Stage"
                value={stage}
                onValueChange={setStage}
                items={[
                  {
                    value: "collection",
                    label: "Collection",
                    count: count(["ORDERED", "SAMPLE_PENDING"]),
                  },
                  {
                    value: "processing",
                    label: "Processing",
                    count: count(["COLLECTED", "PROCESSING"]),
                  },
                  {
                    value: "reporting",
                    label: "Verification",
                    count: count(["RESULT_READY"]),
                  },
                  { value: "completed", label: "Verified today" },
                  { value: "all", label: "All" },
                ]}
              />
              <SearchInput
                wrapperClassName="min-w-48 flex-1"
                placeholder="Patient, UHID, order or sample ID"
                value={q}
                onChange={e => setQ(e.target.value)}
              />
              <SelectField
                className="w-full sm:w-36"
                aria-label="Priority"
                value={priority}
                onChange={e => setPriority(e.target.value)}
              >
                <option value="">Any priority</option>
                <option value="STAT">STAT</option>
                <option value="URGENT">Urgent</option>
                <option value="ROUTINE">Routine</option>
              </SelectField>
            </>
          }
        />
      </Panel>
      <LabOrderSheet orderId={openId} onClose={() => setOpenId(null)} />
    </PageShell>
  );
}
