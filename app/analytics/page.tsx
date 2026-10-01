"use client";

import * as React from "react";

import {
  ErrorBanner,
  PageHeader,
  PageShell,
  Panel,
  PanelRowsSkeleton,
} from "@/components/shared/page";
import { CategorySwitcher } from "@/components/ui/category-switcher";
import {
  ChartLegend,
  ColumnChart,
  CompositionBar,
  MagnitudeBars,
} from "@/components/ui/chart-primitives";
import { DonutChart } from "@/components/ui/donut-chart";
import { LineChart } from "@/components/ui/line-chart";
import { MetricCard, type MetricTone } from "@/components/ui/metric-card";
import { SkeletonMetricRow } from "@/components/ui/skeleton";
import { useAnalytics, type Kpi } from "@/features/analytics/api";
import {
  formatDuration,
  formatINR,
  formatINRCompact,
  formatNumber,
  humanize,
} from "@/lib/format";

type Range = "7" | "15" | "30";

/** "▲ 12% vs previous 7 days" — `goodWhenUp` decides the colour. */
function delta(
  k: Kpi,
  days: number,
  goodWhenUp = true,
  comparable = true
): { hint: string; tone: MetricTone } {
  if (!comparable)
    return { hint: "No earlier period to compare", tone: "neutral" };
  if (!k.previous)
    return { hint: `No data for the previous ${days} days`, tone: "neutral" };
  const change = ((k.value - k.previous) / Math.abs(k.previous)) * 100;
  if (Math.abs(change) < 1)
    return { hint: `Flat vs previous ${days} days`, tone: "neutral" };
  const up = change > 0;
  const good = up === goodWhenUp;
  return {
    hint: `${up ? "▲" : "▼"} ${Math.abs(change).toFixed(0)}% vs previous ${days} days`,
    tone: good ? "positive" : "warning",
  };
}

export default function AnalyticsPage() {
  const [range, setRange] = React.useState<Range>("7");
  const days = Number(range);
  const { data, isLoading, error } = useAnalytics(days);
  const k = data?.kpis;
  const cmp = data?.comparable ?? false;
  const d = (x: Kpi, goodWhenUp = true) => delta(x, days, goodWhenUp, cmp);

  const card = (
    label: string,
    value: string,
    d?: { hint: string; tone: MetricTone },
    description?: string
  ) => (
    <MetricCard
      label={label}
      value={value}
      hint={d?.hint}
      tone={d?.tone ?? "neutral"}
      description={description}
    />
  );

  return (
    <PageShell>
      <PageHeader
        title="Hospital performance"
        subtitle={`Performance over time, aggregated from the operational records${data && !data.comparable ? ` — simulated history starts ${new Date(data.historyStart).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}, so ${days}-day comparisons are not shown` : ""}. For what needs attention now, use Operations.`}
        actions={
          <CategorySwitcher
            label="Period"
            value={range}
            onValueChange={setRange}
            items={[
              { value: "7", label: "7 days" },
              { value: "15", label: "15 days" },
              { value: "30", label: "30 days" },
            ]}
          />
        }
      />
      <ErrorBanner error={error} />

      {isLoading || !k || !data ? (
        <>
          <SkeletonMetricRow count={8} />
          <PanelRowsSkeleton rows={6} />
        </>
      ) : (
        <>
          <section aria-label="Volume" className="grid-auto-fit-sm gap-3">
            {card(
              "OPD visits",
              formatNumber(k.opdVisits.value),
              d(k.opdVisits)
            )}
            {card(
              "Admissions",
              formatNumber(k.admissions.value),
              d(k.admissions)
            )}
            {card(
              "Discharges",
              formatNumber(k.discharges.value),
              d(k.discharges)
            )}
            {card("Current inpatients", formatNumber(k.inpatients), {
              hint: `${k.availableBeds} beds available now`,
              tone: "neutral",
            })}
            {card(
              "Bed occupancy",
              `${k.occupancy.toFixed(0)}%`,
              d(k.avgOccupancy),
              "Right now; the hint compares the period's average occupancy."
            )}
            {card(
              "Avg stay",
              `${k.alos.toFixed(1)} d`,
              undefined,
              "Average length of stay for patients discharged in the period."
            )}
          </section>
          <section aria-label="Service" className="grid-auto-fit-sm gap-3">
            {card(
              "Collected",
              formatINRCompact(k.revenue.value),
              d(k.revenue),
              "Revenue collected: payments received less refunds."
            )}
            {card("Pending bills", formatINRCompact(k.pendingBills), {
              hint: "Outstanding on issued bills",
              tone: k.pendingBills > 0 ? "warning" : "neutral",
            })}
            {card(
              "Avg OPD wait",
              formatDuration(k.opdWait.value),
              d(k.opdWait, false),
              "Check-in to consultation start."
            )}
            {card(
              "Lab orders",
              formatNumber(k.labOrders.value),
              d(k.labOrders)
            )}
            {card(
              "Lab TAT",
              formatDuration(k.labTat.value * 60),
              d(k.labTat, false),
              "Turnaround: order to verified report, all priorities."
            )}
            {card(
              "Dispenses",
              formatNumber(k.dispenses.value),
              d(k.dispenses),
              "Pharmacy batch draws against prescriptions."
            )}
            {card(
              "Complaints",
              formatNumber(k.complaints.value),
              d(k.complaints, false),
              `${k.resolvedComplaints.value} of them resolved`
            )}
            {card(
              "Patient rating",
              k.rating.value ? `${k.rating.value.toFixed(2)} ★` : "—",
              d(k.rating)
            )}
          </section>

          <div className="grid gap-4 xl:grid-cols-2">
            <Panel
              title="OPD visits per day"
              description="Closed and open OPD encounters by day of visit."
            >
              <div className="h-60">
                <LineChart
                  data={{
                    labels: data.daily.map(d => d.label),
                    datasets: [
                      {
                        label: "OPD visits",
                        data: data.daily.map(d => d.visits),
                      },
                    ],
                  }}
                />
              </div>
            </Panel>
            <Panel
              title="Admissions vs discharges"
              description="Inpatient flow per day."
            >
              <ChartLegend
                series={[
                  { key: "admissions", label: "Admissions" },
                  { key: "discharges", label: "Discharges" },
                ]}
              />
              <ColumnChart
                className="mt-2"
                height={216}
                data={data.daily.map(d => ({
                  label: d.label,
                  admissions: d.admissions,
                  discharges: d.discharges,
                }))}
                series={[
                  { key: "admissions", label: "Admissions" },
                  { key: "discharges", label: "Discharges" },
                ]}
              />
            </Panel>
            <Panel
              title="Bed occupancy trend"
              description="Share of beds occupied at the end of each day, from bed-assignment history."
            >
              <div className="h-60">
                <LineChart
                  data={{
                    labels: data.daily.map(d => d.label),
                    datasets: [
                      {
                        label: "Occupancy %",
                        data: data.daily.map(d => d.occupancy),
                      },
                    ],
                  }}
                />
              </div>
            </Panel>
            <Panel
              title="Revenue collected per day"
              description="Net of refunds, all settings."
            >
              <ColumnChart
                height={240}
                data={data.daily.map(d => ({
                  label: d.label,
                  revenue: d.revenue,
                }))}
                series={[{ key: "revenue", label: "Collected" }]}
                formatValue={v => formatINRCompact(v)}
              />
            </Panel>
          </div>

          <div className="grid gap-4 xl:grid-cols-3">
            <Panel title="OPD volume by department">
              <MagnitudeBars
                data={data.deptVolume.map(([name, value]) => ({
                  key: name,
                  label: name,
                  value,
                  display: `${formatNumber(value)} visits`,
                }))}
              />
            </Panel>
            <Panel
              title="Billed by service"
              description="Charges raised in the period, by category."
            >
              <CompositionBar
                segments={data.revenueByCategory
                  .slice(0, 5)
                  .map(([category, value]) => ({
                    key: category,
                    label: humanize(category),
                    value,
                    display: formatINRCompact(value),
                  }))}
              />
              {data.revenueByCategory.length > 5 ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  +{" "}
                  {data.revenueByCategory
                    .slice(5)
                    .map(([c]) => humanize(c))
                    .join(", ")}
                  :{" "}
                  {formatINR(
                    data.revenueByCategory
                      .slice(5)
                      .reduce((s, [, v]) => s + v, 0),
                    true
                  )}
                </p>
              ) : null}
            </Panel>
            <Panel title="Payment mix">
              <div className="h-56">
                <DonutChart
                  data={{
                    labels: data.paymentMethods.map(([m]) => humanize(m)),
                    datasets: [
                      {
                        data: data.paymentMethods.map(([, v]) => Math.round(v)),
                      },
                    ],
                  }}
                />
              </div>
            </Panel>
          </div>

          <div className="grid gap-4 xl:grid-cols-3">
            <Panel
              title="Lab workload"
              description="Orders per day with average turnaround (hours)."
            >
              <ColumnChart
                height={200}
                data={data.daily.map(d => ({
                  label: d.label,
                  orders: d.labOrders,
                }))}
                series={[{ key: "orders", label: "Orders" }]}
              />
              <div className="mt-3 border-t border-border pt-3">
                <MagnitudeBars
                  data={data.labBySection.map(([section, value]) => ({
                    key: section,
                    label: section,
                    value,
                    display: `${value} tests`,
                  }))}
                />
              </div>
            </Panel>
            <Panel
              title="Complaint trend"
              description="Logged vs resolved per day, and categories in the period."
            >
              <ChartLegend
                series={[
                  { key: "complaints", label: "Logged" },
                  { key: "resolved", label: "Resolved" },
                ]}
              />
              <ColumnChart
                className="mt-2"
                height={176}
                data={data.daily.map(d => ({
                  label: d.label,
                  complaints: d.complaints,
                  resolved: d.resolved,
                }))}
                series={[
                  { key: "complaints", label: "Logged" },
                  { key: "resolved", label: "Resolved" },
                ]}
              />
              <div className="mt-3 border-t border-border pt-3">
                <MagnitudeBars
                  data={data.complaintCategories.slice(0, 5).map(([c, v]) => ({
                    key: c,
                    label: humanize(c),
                    value: v,
                    display: String(v),
                  }))}
                />
              </div>
            </Panel>
            <Panel title="Admissions by department">
              <MagnitudeBars
                data={data.ipdVolume.map(([name, value]) => ({
                  key: name,
                  label: name,
                  value,
                  display: `${formatNumber(value)} admitted`,
                }))}
              />
            </Panel>
          </div>

          <Panel
            title="Average OPD wait per day"
            description="Minutes from check-in to the start of consultation."
          >
            <div className="h-52">
              <LineChart
                data={{
                  labels: data.daily.map(d => d.label),
                  datasets: [
                    { label: "Wait (min)", data: data.daily.map(d => d.wait) },
                  ],
                }}
              />
            </div>
          </Panel>
        </>
      )}
    </PageShell>
  );
}
