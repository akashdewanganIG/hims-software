"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { BedIcon, HospitalIcon, Plus } from "@/components/icons";
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
import { Button } from "@/components/ui/button";
import { CategorySwitcher } from "@/components/ui/category-switcher";
import { SearchInput } from "@/components/ui/search-input";
import { Tag } from "@/components/ui/tag";
import { useAdmissions, type AdmissionRow } from "@/features/ipd/api";
import { AdmitDialog } from "@/features/ipd/admit-dialog";
import {
  formatDate,
  formatDateShort,
  formatINR,
  humanize,
  pluralize,
} from "@/lib/format";
import { useSession } from "@/lib/session";
import { isSameDay } from "@/lib/sim/time";

type Scope = "inhouse" | "discharged" | "all";

export default function IpdPage() {
  const router = useRouter();
  const { can, staff } = useSession();
  const doctor = staff?.role === "DOCTOR";
  const [scope, setScope] = React.useState<Scope>("inhouse");
  const [q, setQ] = React.useState("");
  const [ward, setWard] = React.useState("");
  const [mine, setMine] = React.useState(doctor);
  const [admitOpen, setAdmitOpen] = React.useState(false);

  const {
    data: rows = [],
    isLoading,
    error,
  } = useAdmissions({
    scope,
    q: q || undefined,
    wardCode: ward || undefined,
    doctorId: mine && staff ? staff.id : undefined,
  });
  const { data: inHouse = [] } = useAdmissions({ scope: "inhouse" });
  const { data: all = [] } = useAdmissions({ scope: "all" });

  const now = new Date();
  const admittedToday = all.filter(a => isSameDay(a.admittedAt, now)).length;
  const dischargedToday = all.filter(
    a => a.dischargedAt && isSameDay(a.dischargedAt, now)
  ).length;
  const dischargePending = inHouse.filter(
    a => a.status === "DISCHARGE_PENDING"
  ).length;
  const transferPending = inHouse.filter(
    a => a.status === "TRANSFER_PENDING"
  ).length;
  const avgLos = inHouse.length
    ? inHouse.reduce((s, a) => s + a.lengthOfStay, 0) / inHouse.length
    : 0;
  const wards = [
    ...new Map(
      inHouse.filter(a => a.bed).map(a => [a.bed!.wardCode, a.bed!.ward])
    ).entries(),
  ];

  const columns: Column<AdmissionRow>[] = [
    {
      id: "code",
      header: "Admission",
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
      id: "bed",
      header: "Bed",
      sortValue: r => r.bed?.code,
      cell: r =>
        r.bed ? (
          <div className="min-w-0">
            <p className="font-medium">{r.bed.code}</p>
            <p className="truncate text-xs text-muted-foreground">
              {r.bed.ward}
            </p>
          </div>
        ) : (
          "—"
        ),
    },
    {
      id: "doctor",
      header: "Consultant",
      sortValue: r => r.doctor,
      cell: r => (
        <div className="min-w-0">
          <p className="truncate">{r.doctor}</p>
          <p className="truncate text-xs text-muted-foreground">
            {r.department}
          </p>
        </div>
      ),
    },
    {
      id: "diagnosis",
      header: "Diagnosis",
      cell: r => <span className="line-clamp-2 max-w-56">{r.diagnosis}</span>,
    },
    {
      id: "admitted",
      header: "Admitted",
      sortValue: r => r.admittedAt,
      cell: r => (
        <span className="tabular-nums">{formatDateShort(r.admittedAt)}</span>
      ),
    },
    {
      id: "los",
      header: "LOS",
      align: "right",
      sortValue: r => r.lengthOfStay,
      cell: r => `${r.lengthOfStay} d`,
    },
    {
      id: "edd",
      header: "Exp. discharge",
      defaultHidden: scope !== "inhouse",
      sortValue: r => r.expectedDischargeDate,
      cell: r => formatDate(r.expectedDischargeDate),
    },
    {
      id: "source",
      header: "Source",
      defaultHidden: true,
      cell: r => humanize(r.source),
    },
    {
      id: "pending",
      header: "Pending",
      cell: r =>
        r.pendingLabs || r.pendingRx ? (
          <div className="flex flex-wrap gap-1">
            {r.pendingLabs ? (
              <Tag tone="pending">{pluralize(r.pendingLabs, "lab")}</Tag>
            ) : null}
            {r.pendingRx ? (
              <Tag tone="pending">{pluralize(r.pendingRx, "Rx", "Rx")}</Tag>
            ) : null}
          </div>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      id: "charges",
      header: "Charges",
      align: "right",
      sortValue: r => r.charges,
      cell: r => formatINR(r.charges, true),
    },
    {
      id: "status",
      header: "Status",
      sortValue: r => r.status,
      cell: r => <StatusBadge status={r.status} />,
    },
  ];

  return (
    <PageShell>
      <PageHeader
        title="Inpatients"
        subtitle="Admissions from bed allocation to discharge. Every in-house patient holds exactly one bed."
        actions={
          can("ipd.admit") ? (
            <Button onClick={() => setAdmitOpen(true)}>
              <Plus className="size-4" />
              Admit patient
            </Button>
          ) : null
        }
      />
      <ErrorBanner error={error} />

      <section
        aria-label="Inpatient summary"
        className="grid-auto-fit-sm gap-3"
      >
        <StatCard
          label="In-house"
          value={inHouse.length}
          icon={HospitalIcon}
          loading={isLoading}
          hint={`Average stay so far ${avgLos.toFixed(1)} d`}
        />
        <StatCard
          label="Admitted today"
          value={admittedToday}
          loading={isLoading}
        />
        <StatCard
          label="Discharged today"
          value={dischargedToday}
          loading={isLoading}
          tone={dischargedToday ? "positive" : "neutral"}
        />
        <StatCard
          label="Awaiting discharge"
          value={dischargePending}
          loading={isLoading}
          tone={dischargePending ? "warning" : "neutral"}
          hint="Summary or bill outstanding"
        />
        <StatCard
          label="Transfers"
          value={transferPending}
          loading={isLoading}
          tone={transferPending ? "info" : "neutral"}
          hint="Awaiting bed move"
        />
        <StatCard
          label="Bed board"
          value="Open"
          icon={BedIcon}
          href="/beds"
          hint="Occupancy by ward"
        />
      </section>

      <Panel flush>
        <DataTable
          columns={columns}
          rows={rows}
          keyOf={r => r.id}
          isLoading={isLoading}
          initialSort={{ id: "admitted", direction: "desc" }}
          empty={
            scope === "inhouse"
              ? "No patients admitted."
              : "No admissions match."
          }
          onRowClick={r => router.push(`/ipd/${r.id}`)}
          toolbar={
            <>
              <CategorySwitcher
                label="Admission scope"
                value={scope}
                onValueChange={setScope}
                items={[
                  {
                    value: "inhouse",
                    label: "In-house",
                    count: inHouse.length,
                  },
                  { value: "discharged", label: "Discharged" },
                  { value: "all", label: "All" },
                ]}
              />
              <SearchInput
                wrapperClassName="min-w-48 flex-1"
                placeholder="Patient, UHID or ADM number"
                value={q}
                onChange={e => setQ(e.target.value)}
              />
              <SelectField
                className="w-full sm:w-48"
                aria-label="Ward"
                value={ward}
                onChange={e => setWard(e.target.value)}
              >
                <option value="">All wards</option>
                {wards.map(([code, name]) => (
                  <option key={code} value={code}>
                    {name}
                  </option>
                ))}
              </SelectField>
              {doctor ? (
                <CategorySwitcher
                  label="Whose patients"
                  value={mine ? "mine" : "all"}
                  onValueChange={v => setMine(v === "mine")}
                  items={[
                    { value: "mine", label: "My patients" },
                    { value: "all", label: "All" },
                  ]}
                />
              ) : null}
            </>
          }
        />
      </Panel>
      <AdmitDialog open={admitOpen} onOpenChange={setAdmitOpen} />
    </PageShell>
  );
}
