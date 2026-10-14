"use client";

import * as React from "react";
import Link from "next/link";

import {
  BedIcon,
  HospitalIcon,
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
import { SEVERITY_ICON, SEVERITY_SURFACE } from "@/components/ui/severity";
import { Tag } from "@/components/ui/tag";
import { useOperations } from "@/features/operations/api";
import {
  formatDuration,
  formatRelative,
  formatTime,
  humanize,
} from "@/lib/format";
import { cn } from "@/lib/utils";

export default function OperationsPage() {
  const { data, isLoading, error, refetch, isFetching } = useOperations();
  const [area, setArea] = React.useState("All");
  // "Issues": rule-generated from live data. Alerts are the staff messages
  // of the Alerts module.
  const areas = ["All", ...new Set((data?.alerts ?? []).map(a => a.area))];
  const issues = (data?.alerts ?? []).filter(
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

      <section
        className="grid grid-cols-2 gap-3 sm:grid-cols-3 2xl:grid-cols-6"
        aria-label="Live status"
      >
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
          label="IPD in-house"
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

      {/*
        Two columns from xl: the main column (issues, then the department
        table) and a rail (beds, staff, then live activity). Both stretch to
        the taller one, and the department panel and the activity feed absorb
        the difference, so neither column ends in a blank gap. Below xl the
        rail pairs its panels side by side instead of stretching them.
      */}
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_21rem]">
        <div className="flex min-w-0 flex-col gap-4">
          <Panel
            title={`Needs attention${data ? ` · ${data.alerts.length}` : ""}`}
            description="Issues spotted in live data by simple rules, most urgent first. Each links to where it can be resolved."
            actions={
              <CategorySwitcher
                label="Issue area"
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
            ) : issues.length ? (
              <ul className="grid gap-2 2xl:grid-cols-2">
                {issues.map(issue => {
                  const Icon = SEVERITY_ICON[issue.level];
                  return (
                    <li key={issue.id} className="min-w-0">
                      <Link
                        href={issue.href}
                        className={cn(
                          "flex h-full items-start gap-3 rounded-lg border px-3 py-2.5 outline-none transition-shadow hover:shadow-sm focus-visible:ring-2 focus-visible:ring-ring/30",
                          SEVERITY_SURFACE[issue.level]
                        )}
                      >
                        <Icon className="mt-0.5 size-4 shrink-0" />
                        <span className="min-w-0 flex-1">
                          <span className="block text-[0.8125rem] font-semibold">
                            {issue.title}
                          </span>
                          <span className="block text-xs opacity-90">
                            {issue.detail}
                          </span>
                        </span>
                        <Tag tone="neutral" className="shrink-0 bg-surface">
                          {issue.area}
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

          <Panel
            flush
            className="xl:flex-1"
            title="Department activity today"
            description="OPD queue pressure and inpatient census by clinical department."
          >
            <div className="overflow-x-auto overscroll-x-contain">
              <table className="w-full min-w-[36rem] text-sm">
                <thead>
                  <tr className="border-b border-border bg-surface-subtle text-left text-[0.6875rem] font-semibold uppercase leading-4 tracking-wide text-muted-foreground">
                    <th className="sticky left-0 z-10 h-10 w-[28%] bg-surface-subtle px-3 sm:px-4">
                      Department
                    </th>
                    <th className="px-2.5 text-right">Booked</th>
                    <th className="px-2.5 text-right">Waiting</th>
                    <th className="px-2.5 text-right">In consult</th>
                    <th className="px-2.5 text-right">Seen</th>
                    <th className="px-2.5 text-right">Longest wait</th>
                    <th className="px-2.5 text-right">Doctors on duty</th>
                    <th className="px-3 text-right sm:px-4">Inpatients</th>
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
                        <td className="sticky left-0 z-10 bg-card px-3 py-2.5 font-medium sm:px-4">
                          {d.name}
                        </td>
                        <td className="px-2.5 py-2.5 text-right tabular-nums">
                          {d.booked}
                        </td>
                        <td
                          className={cn(
                            "px-2.5 py-2.5 text-right tabular-nums",
                            pressure > 3 &&
                              "font-semibold text-error-foreground"
                          )}
                        >
                          {d.waiting}
                        </td>
                        <td className="px-2.5 py-2.5 text-right tabular-nums">
                          {d.inConsultation}
                        </td>
                        <td className="px-2.5 py-2.5 text-right tabular-nums">
                          {d.completed}
                        </td>
                        <td
                          className={cn(
                            "whitespace-nowrap px-2.5 py-2.5 text-right tabular-nums",
                            d.longestWait > 45 &&
                              "font-semibold text-error-foreground"
                          )}
                        >
                          {d.longestWait ? formatDuration(d.longestWait) : "—"}
                        </td>
                        <td
                          className={cn(
                            "px-2.5 py-2.5 text-right tabular-nums",
                            d.waiting > 0 &&
                              d.doctorsOnDuty === 0 &&
                              "font-semibold text-error-foreground"
                          )}
                        >
                          {d.doctorsOnDuty}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums sm:px-4">
                          {d.inpatients}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {data ? null : (
              <div className="p-3">
                <PanelRowsSkeleton rows={6} />
              </div>
            )}
          </Panel>
        </div>

        <div className="grid min-w-0 gap-4 md:grid-cols-2 xl:flex xl:flex-col">
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
            bodyClassName="flex flex-col justify-center"
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
          <Panel
            flush
            className="md:col-span-2 xl:flex-1"
            bodyClassName="relative h-80 flex-none xl:h-auto xl:min-h-40 xl:flex-1"
            title="Live activity"
            description="The latest actions recorded anywhere in the hospital."
          >
            {/* Scrolls inside whatever height the row leaves it. */}
            <div className="absolute inset-0 overflow-y-auto p-3">
              {data ? (
                <ul className="grid gap-x-6 gap-y-2.5 md:grid-cols-2 xl:grid-cols-1">
                  {data.activity.map(e => (
                    <li key={e.id} className="min-w-0 text-[0.8125rem]">
                      <p className="leading-5">{e.summary}</p>
                      <p className="text-xs text-muted-foreground">
                        {humanize(e.entityType)} · {e.actor} ·{" "}
                        {formatRelative(e.at)}
                      </p>
                    </li>
                  ))}
                </ul>
              ) : (
                <PanelRowsSkeleton rows={6} />
              )}
            </div>
          </Panel>
        </div>
      </div>

      <section aria-label="Pipelines" className="grid gap-4 md:grid-cols-3">
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
        Issues are computed from the same records every module uses; resolving
        the underlying item clears the issue.
      </p>
    </PageShell>
  );
}
