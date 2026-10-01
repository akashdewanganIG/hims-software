"use client";

import * as React from "react";
import Link from "next/link";

import {
  AlertCircle,
  AlertTriangle,
  BedIcon,
  ChatText,
  FolderOpen,
  HospitalIcon,
  Info,
  Microscope,
  Phone,
  PrescriptionIcon,
  RefreshCw,
  ShieldCheck,
  Stethoscope,
  UsersThree,
  Wallet,
  type IconComponent,
} from "@/components/icons";
import {
  ErrorBanner,
  PageShell,
  Panel,
  PanelRowsSkeleton,
} from "@/components/shared/page";
import { Button } from "@/components/ui/button";
import { CardActionButton } from "@/components/ui/card-action-button";
import { LineChart } from "@/components/ui/line-chart";
import { MetricCard } from "@/components/ui/metric-card";
import { NavCard } from "@/components/ui/nav-card";
import { SkeletonMetricRow } from "@/components/ui/skeleton";
import { Tag } from "@/components/ui/tag";
import { useDashboard, useDashboardTrend } from "@/features/dashboard/api";
import { formatINRCompact } from "@/lib/format";
import { NAVIGATION } from "@/lib/navigation";
import type { Module } from "@/lib/rbac";
import { useSession } from "@/lib/session";
import { cn } from "@/lib/utils";

const LEVEL_ICON = {
  critical: AlertCircle,
  warning: AlertTriangle,
  info: Info,
} as const;
const LEVEL_TEXT = {
  critical: "text-error-foreground",
  warning: "text-warning-foreground",
  info: "text-info-foreground",
} as const;

/** A dashboard card in the wrapping "My work" row. */
const CARD = "min-w-0 flex-[1_1_20rem]";

const METRIC_ICON: Partial<Record<Module, IconComponent>> = {
  opd: Stethoscope,
  ipd: HospitalIcon,
  beds: BedIcon,
  lab: Microscope,
  pharmacy: PrescriptionIcon,
  billing: Wallet,
  enquiry: Phone,
  complaints: ChatText,
  mrd: FolderOpen,
  wfm: UsersThree,
  admin: ShieldCheck,
};

/**
 * The signed-in login's home: headline figures, work queues and alerts for
 * its own modules only — the server sends nothing else.
 */
export default function DashboardPage() {
  const { staff, role, canAccess } = useSession();
  const { data, isLoading, error, refetch, isFetching } = useDashboard();
  const { data: trend } = useDashboardTrend();
  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  const modules = NAVIGATION.flatMap(g => g.items)
    .filter(i => i.href !== "/" && canAccess(i.module))
    .map(i => ({ href: i.href, label: i.label, icon: i.icon }));

  // Reserve the chart's place for logins that will get one, so the page
  // does not jump when the trend arrives.
  const hasTrend =
    canAccess("opd") ||
    canAccess("ipd") ||
    canAccess("billing") ||
    canAccess("analytics");
  const series = trend
    ? [
        trend.daily.some(d => d.visits !== null)
          ? {
              label: "OPD visits",
              data: trend.daily.map(d => d.visits ?? 0),
            }
          : null,
        trend.daily.some(d => d.admissions !== null)
          ? {
              label: "Admissions",
              data: trend.daily.map(d => d.admissions ?? 0),
            }
          : null,
      ].filter(s => s !== null)
    : [];

  return (
    <PageShell gap="tight">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-medium text-muted-foreground">
            {greeting}
            {staff
              ? `, ${staff.role === "DOCTOR" ? "Dr " : ""}${staff.firstName}`
              : ""}
          </p>
          <h1 className="mt-0.5 text-base font-semibold leading-6 tracking-tight text-foreground sm:text-lg sm:leading-7">
            Dashboard
            {role ? (
              <span className="font-normal text-muted-foreground">
                {" "}
                · {role.name}
              </span>
            ) : null}
          </h1>
        </div>
        <Button
          variant="outline"
          onClick={() => void refetch()}
          disabled={isFetching}
        >
          <RefreshCw className={cn("size-4", isFetching && "animate-spin")} />
          Refresh
        </Button>
      </header>

      <ErrorBanner error={error} />

      {isLoading || !data ? (
        <SkeletonMetricRow count={4} />
      ) : data.metrics.length ? (
        <section
          aria-label="Your areas right now"
          className="grid-auto-fit-sm gap-3"
        >
          {data.metrics.map(metric => (
            <MetricCard
              key={metric.module}
              label={metric.label}
              value={metric.value}
              icon={METRIC_ICON[metric.module] ?? Info}
              href={metric.href}
              tone={metric.tone}
              hint={metric.hint}
            />
          ))}
        </section>
      ) : null}

      {/* Work queues, alerts and the week's trend share one wrapping row:
          each card is at least 20rem wide, and a row that is not full lets
          its cards widen to fill it instead of leaving empty columns. */}
      <section aria-label="My work" className="flex flex-wrap gap-3">
        {data?.queues.map(queue => (
          <Panel
            key={queue.title}
            className={CARD}
            title={`${queue.title} · ${queue.items.length}`}
            description={queue.description}
            footerAction={
              <CardActionButton href={queue.href}>Open</CardActionButton>
            }
          >
            {queue.items.length ? (
              // Wide cards list their items in two or three columns.
              <div className="@container overflow-hidden">
                <ul className="-mb-px grid grid-cols-1 @2xl:grid-cols-2 @2xl:gap-x-6 @5xl:grid-cols-3">
                  {queue.items.slice(0, 6).map(item => (
                    <li key={item.id} className="border-b border-border">
                      <Link
                        href={item.href}
                        className="flex items-center justify-between gap-3 rounded-md px-1 py-2 outline-none transition-colors hover:bg-surface-subtle focus-visible:ring-2 focus-visible:ring-ring/30"
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-[0.8125rem] font-medium">
                            {item.title}
                          </span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {item.detail}
                          </span>
                        </span>
                        {item.badge ? (
                          <Tag tone={item.badge.tone} className="shrink-0">
                            {item.badge.label}
                          </Tag>
                        ) : null}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="py-6 text-center text-sm text-muted-foreground">
                {queue.empty}
              </p>
            )}
          </Panel>
        ))}

        <Panel
          className={CARD}
          title="Needs attention"
          description="Alerts from the areas you work in."
          footerAction={
            canAccess("operations") ? (
              <CardActionButton href="/operations">
                Open command centre
              </CardActionButton>
            ) : undefined
          }
        >
          {!data ? (
            <PanelRowsSkeleton rows={4} />
          ) : data.alerts.length ? (
            <div className="@container">
              <ul className="grid grid-cols-1 gap-2 @2xl:grid-cols-2 @2xl:gap-x-6">
                {data.alerts.slice(0, 6).map(alert => {
                  const Icon = LEVEL_ICON[alert.level];
                  return (
                    <li key={alert.id}>
                      <Link
                        href={alert.href}
                        className="flex items-start gap-2.5 rounded-md p-1 outline-none transition-colors hover:bg-surface-subtle focus-visible:ring-2 focus-visible:ring-ring/30"
                      >
                        <Icon
                          className={cn(
                            "mt-0.5 size-4 shrink-0",
                            LEVEL_TEXT[alert.level]
                          )}
                        />
                        <span className="min-w-0">
                          <span className="block text-[0.8125rem] font-medium">
                            {alert.title}
                          </span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {alert.area} · {alert.detail}
                          </span>
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : (
            <p className="py-6 text-center text-sm text-success-foreground">
              Nothing needs attention in your areas right now.
            </p>
          )}
        </Panel>
        {hasTrend && !trend ? (
          <Panel className={CARD} title="Last 7 days" description="Loading…">
            <PanelRowsSkeleton rows={4} />
          </Panel>
        ) : series.length ? (
          <Panel
            className={CARD}
            bodyClassName="flex flex-col"
            title="Last 7 days"
            description={
              trend?.revenue
                ? `${series.map(s => s.label).join(" and ")} per day · ${formatINRCompact(trend.revenue.value)} collected`
                : `${series.map(s => s.label).join(" and ")} per day.`
            }
          >
            {/* Fills the card when its row is taller than the chart. */}
            <div className="grid min-h-56 flex-1">
              <LineChart
                showLegend
                data={{
                  labels: trend!.daily.map(d => d.label),
                  datasets: series,
                }}
              />
            </div>
          </Panel>
        ) : null}
      </section>

      <section className="space-y-3" aria-labelledby="modules-heading">
        <div>
          <h2
            id="modules-heading"
            className="text-sm font-semibold text-foreground"
          >
            Your modules
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            What your access lets you open.
          </p>
        </div>
        <div className="grid-auto-fit gap-3">
          {modules.map(m => (
            <NavCard
              key={m.href}
              href={m.href}
              label={m.label}
              icon={m.icon}
              hint={data?.hints[m.href]}
            />
          ))}
        </div>
      </section>
    </PageShell>
  );
}
