"use client";

import * as React from "react";
import Link from "next/link";

import {
  AlertCircle,
  AlertTriangle,
  BedIcon,
  HospitalIcon,
  Info,
  Microscope,
  PrescriptionIcon,
  RefreshCw,
  Stethoscope,
  UsersThree,
} from "@/components/icons";
import {
  ErrorBanner,
  MiniStat,
  PageHeader,
  PageShell,
  Panel,
  PanelRowsSkeleton,
  StatCard,
} from "@/components/shared/page";
import { Button } from "@/components/ui/button";
import { CategorySwitcher } from "@/components/ui/category-switcher";
import { MagnitudeBars } from "@/components/ui/chart-primitives";
import { Tag } from "@/components/ui/tag";
import { useOperations, type AlertLevel } from "@/features/operations/api";
import {
  formatDuration,
  formatRelative,
  formatTime,
  humanize,
} from "@/lib/format";
import { cn } from "@/lib/utils";

const LEVEL_ICON: Record<AlertLevel, typeof Info> = {
  critical: AlertCircle,
  warning: AlertTriangle,
  info: Info,
};
const LEVEL_STYLE: Record<AlertLevel, string> = {
  critical: "border-error-border bg-error-surface text-error-foreground",
  warning: "border-warning-border bg-warning-surface text-warning-foreground",
  info: "border-info-border bg-info-surface text-info-foreground",
};

export default function OperationsPage() {
  const { data, isLoading, error, refetch, isFetching } = useOperations();
  const [area, setArea] = React.useState("All");
  const areas = ["All", ...new Set((data?.alerts ?? []).map(a => a.area))];
  const alerts = (data?.alerts ?? []).filter(
    a => area === "All" || a.area === area
  );

  return (
    <PageShell>
      <PageHeader
        title="Operations command centre"
        subtitle="What needs attention right now across the hospital. Refreshes every 30 seconds. Trends over time live in Hospital Performance."
        actions={
          <Button
            variant="outline"
            onClick={() => void refetch()}
            disabled={isFetching}
          >
            <RefreshCw className={cn("size-4", isFetching && "animate-spin")} />
            {data ? `Updated ${formatTime(data.at)}` : "Refresh"}
          </Button>
        }
      />
      <ErrorBanner error={error} />

      <section className="grid-auto-fit-sm gap-3" aria-label="Live status">
        <StatCard
          label="OPD waiting"
          value={data?.opd.waiting ?? 0}
          icon={Stethoscope}
          loading={isLoading}
          tone={(data?.opd.avgWaitNow ?? 0) > 30 ? "warning" : "neutral"}
          hint={
            data
              ? `${data.opd.inConsultation} in consultation · avg wait ${formatDuration(data.opd.avgWaitNow)}`
              : undefined
          }
          href="/opd"
        />
        <StatCard
          label="Inpatients"
          value={data?.ipd.inHouse ?? 0}
          icon={HospitalIcon}
          loading={isLoading}
          hint={
            data
              ? `+${data.ipd.admittedToday} admitted · −${data.ipd.dischargedToday} discharged today`
              : undefined
          }
          href="/ipd"
        />
        <StatCard
          label="Beds free"
          value={data?.beds.AVAILABLE ?? 0}
          icon={BedIcon}
          loading={isLoading}
          tone={(data?.beds.occupancy ?? 0) >= 85 ? "critical" : "positive"}
          hint={
            data
              ? `${data.beds.occupancy.toFixed(0)}% occupied · ${data.beds.CLEANING} cleaning`
              : undefined
          }
          href="/beds"
        />
        <StatCard
          label="Lab pipeline"
          value={
            (data?.lab.collection ?? 0) +
            (data?.lab.processing ?? 0) +
            (data?.lab.verification ?? 0)
          }
          icon={Microscope}
          loading={isLoading}
          tone={data?.lab.overdue ? "warning" : "neutral"}
          hint={data ? `${data.lab.overdue} past target TAT` : undefined}
          href="/lab"
        />
        <StatCard
          label="Rx to dispense"
          value={data?.pharmacy.pending ?? 0}
          icon={PrescriptionIcon}
          loading={isLoading}
          hint={data ? `${data.pharmacy.lowStock} medicines low` : undefined}
          href="/pharmacy"
        />
        <StatCard
          label="Open complaints"
          value={data?.complaints.open ?? 0}
          loading={isLoading}
          tone={data?.complaints.overdue ? "critical" : "neutral"}
          hint={data ? `${data.complaints.overdue} overdue` : undefined}
          href="/complaints"
        />
      </section>

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <Panel
          title={`Alerts${data ? ` · ${data.alerts.length}` : ""}`}
          description="Generated from live data by simple rules. Each alert links to where it can be resolved."
          actions={
            <CategorySwitcher
              label="Alert area"
              value={area}
              onValueChange={setArea}
              items={areas.map(a => ({
                value: a,
                label: a,
                count:
                  a === "All"
                    ? data?.alerts.length
                    : data?.alerts.filter(x => x.area === a).length,
              }))}
            />
          }
        >
          {isLoading ? (
            <PanelRowsSkeleton rows={6} />
          ) : alerts.length ? (
            <ul className="space-y-2">
              {alerts.map(alert => {
                const Icon = LEVEL_ICON[alert.level];
                return (
                  <li key={alert.id}>
                    <Link
                      href={alert.href}
                      className={cn(
                        "flex items-start gap-3 rounded-lg border px-3 py-2.5 outline-none transition-shadow hover:shadow-sm focus-visible:ring-2 focus-visible:ring-ring/30",
                        LEVEL_STYLE[alert.level]
                      )}
                    >
                      <Icon className="mt-0.5 size-4 shrink-0" />
                      <span className="min-w-0 flex-1">
                        <span className="block text-[0.8125rem] font-semibold">
                          {alert.title}
                        </span>
                        <span className="block text-xs opacity-90">
                          {alert.detail}
                        </span>
                      </span>
                      <Tag tone="neutral" className="shrink-0 bg-surface">
                        {alert.area}
                      </Tag>
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="py-8 text-center text-sm text-success-foreground">
              Nothing needs attention right now.
            </p>
          )}
        </Panel>

        <div className="flex flex-col gap-4">
          <Panel title="Free beds by ward">
            {data ? (
              <MagnitudeBars
                data={data.wards.map(w => ({
                  key: w.id,
                  label: w.name,
                  value: w.free,
                  display: `${w.free} free`,
                  meta: `${w.occupied}/${w.total} occ.`,
                }))}
              />
            ) : (
              <PanelRowsSkeleton rows={5} />
            )}
          </Panel>
          <Panel
            title="Staff on duty now"
            description="From the published roster."
            footerAction={
              <Button asChild variant="outline" size="sm">
                <Link href="/wfm/roster">Open roster</Link>
              </Button>
            }
          >
            {data ? (
              <div className="grid grid-cols-3 gap-2">
                <MiniStat label="Doctors" value={data.staff.doctors} />
                <MiniStat
                  label="Nurses"
                  value={data.staff.nurses}
                  tone={data.staff.nurses < 3 ? "critical" : "neutral"}
                />
                <MiniStat label="Pharmacy" value={data.staff.pharmacists} />
                <MiniStat label="Lab" value={data.staff.lab} />
                <MiniStat label="Front office" value={data.staff.frontOffice} />
                <MiniStat label="Billing" value={data.staff.billing} />
              </div>
            ) : (
              <PanelRowsSkeleton rows={3} />
            )}
          </Panel>
        </div>
      </div>

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <Panel
          flush
          title="Department activity today"
          description="OPD queue pressure and inpatient census by clinical department."
        >
          <div className="overflow-x-auto">
            <table className="w-full min-w-[44rem] text-sm">
              <thead>
                <tr className="border-b border-border bg-surface-subtle text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <th className="h-10 px-4">Department</th>
                  <th className="px-3 text-right">Booked</th>
                  <th className="px-3 text-right">Waiting</th>
                  <th className="px-3 text-right">In consult</th>
                  <th className="px-3 text-right">Seen</th>
                  <th className="px-3 text-right">Longest wait</th>
                  <th className="px-3 text-right">Doctors on duty</th>
                  <th className="px-4 text-right">Inpatients</th>
                </tr>
              </thead>
              <tbody>
                {(data?.departments ?? []).map(d => {
                  const pressure = d.doctorsOnDuty
                    ? d.waiting / d.doctorsOnDuty
                    : d.waiting;
                  return (
                    <tr
                      key={d.id}
                      className="border-b border-border/80 last:border-0"
                    >
                      <td className="px-4 py-2.5 font-medium">{d.name}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">
                        {d.booked}
                      </td>
                      <td
                        className={cn(
                          "px-3 py-2.5 text-right tabular-nums",
                          pressure > 3 && "font-semibold text-error-foreground"
                        )}
                      >
                        {d.waiting}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums">
                        {d.inConsultation}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums">
                        {d.completed}
                      </td>
                      <td
                        className={cn(
                          "px-3 py-2.5 text-right tabular-nums",
                          d.longestWait > 45 &&
                            "font-semibold text-error-foreground"
                        )}
                      >
                        {d.longestWait ? formatDuration(d.longestWait) : "—"}
                      </td>
                      <td
                        className={cn(
                          "px-3 py-2.5 text-right tabular-nums",
                          d.waiting > 0 &&
                            d.doctorsOnDuty === 0 &&
                            "font-semibold text-error-foreground"
                        )}
                      >
                        {d.doctorsOnDuty}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums">
                        {d.inpatients}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Panel>
        <Panel
          title="Live activity"
          description="The latest actions recorded anywhere in the hospital."
        >
          {data ? (
            <ul className="max-h-[26rem] space-y-2.5 overflow-y-auto pr-1">
              {data.activity.map(e => (
                <li key={e.id} className="text-[0.8125rem]">
                  <p className="leading-5">{e.summary}</p>
                  <p className="text-xs text-muted-foreground">
                    {humanize(e.entityType)} · {e.actor} ·{" "}
                    {formatRelative(e.at)}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <PanelRowsSkeleton rows={8} />
          )}
        </Panel>
      </div>

      <section aria-label="Pipelines" className="grid gap-4 lg:grid-cols-3">
        <Panel title="Lab pipeline">
          {data ? (
            <MagnitudeBars
              data={[
                {
                  key: "c",
                  label: "Awaiting collection",
                  value: data.lab.collection,
                  display: String(data.lab.collection),
                },
                {
                  key: "p",
                  label: "In processing",
                  value: data.lab.processing,
                  display: String(data.lab.processing),
                },
                {
                  key: "v",
                  label: "Awaiting verification",
                  value: data.lab.verification,
                  display: String(data.lab.verification),
                },
              ]}
            />
          ) : null}
        </Panel>
        <Panel title="Inpatient flow today">
          {data ? (
            <MagnitudeBars
              data={[
                {
                  key: "a",
                  label: "Admitted",
                  value: data.ipd.admittedToday,
                  display: String(data.ipd.admittedToday),
                },
                {
                  key: "d",
                  label: "Discharged",
                  value: data.ipd.dischargedToday,
                  display: String(data.ipd.dischargedToday),
                },
                {
                  key: "p",
                  label: "Discharge pending",
                  value: data.ipd.dischargePending,
                  display: String(data.ipd.dischargePending),
                },
                {
                  key: "t",
                  label: "Transfer pending",
                  value: data.ipd.transferPending,
                  display: String(data.ipd.transferPending),
                },
              ]}
            />
          ) : null}
        </Panel>
        <Panel title="OPD today">
          {data ? (
            <MagnitudeBars
              data={[
                {
                  key: "b",
                  label: "Booked",
                  value: data.opd.booked,
                  display: String(data.opd.booked),
                },
                {
                  key: "s",
                  label: "Seen",
                  value: data.opd.completed,
                  display: String(data.opd.completed),
                },
                {
                  key: "w",
                  label: "Waiting",
                  value: data.opd.waiting,
                  display: String(data.opd.waiting),
                },
                {
                  key: "u",
                  label: "Still to arrive",
                  value: data.opd.upcoming,
                  display: String(data.opd.upcoming),
                },
              ]}
            />
          ) : null}
        </Panel>
      </section>
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <UsersThree className="size-3.5" />
        Alerts are computed from the same records every module uses; resolving
        the underlying item clears the alert.
      </p>
    </PageShell>
  );
}
