"use client";

import * as React from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { cn } from "@/lib/utils";

const AXIS_TICK = { fill: "var(--muted-foreground)", fontSize: 11 };

type TooltipRow = {
  label: string;
  value: string;
  color?: string;
};

function TooltipShell({
  heading,
  rows,
}: {
  heading?: string;
  rows: TooltipRow[];
}) {
  return (
    <div className="min-w-40 max-w-[16rem] rounded-lg border border-border bg-popover/95 px-3 py-2 text-xs shadow-lg shadow-black/10 backdrop-blur">
      {heading ? (
        <p className="mb-1 font-semibold text-foreground">{heading}</p>
      ) : null}
      <div className="space-y-1">
        {rows.map(row => (
          <div
            key={row.label}
            className="flex items-center justify-between gap-4"
          >
            <span className="flex min-w-0 items-center gap-2 text-muted-foreground">
              {row.color ? (
                <span
                  className="size-2 shrink-0 rounded-full"
                  style={{ backgroundColor: row.color }}
                />
              ) : null}
              <span className="truncate">{row.label}</span>
            </span>
            <span className="shrink-0 font-semibold tabular-nums text-foreground">
              {row.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

const HOVER_FILL = "color-mix(in srgb, var(--chart-track) 60%, transparent)";

export type MagnitudeDatum = {
  key: string;

  label: string;

  value: number;

  display: string;

  meta?: string;
};

/** Ranked horizontal bars: label and value above, a solid bar below. */
export function MagnitudeBars({
  data,
  className,
}: {
  data: MagnitudeDatum[];
  className?: string;
}) {
  const max = Math.max(1, ...data.map(datum => datum.value));

  return (
    <ul className={cn("flex flex-col gap-3", className)}>
      {data.map(datum => (
        <li key={datum.key}>
          <div className="flex items-baseline justify-between gap-3">
            <span className="min-w-0 truncate text-xs">
              <span className="font-medium text-foreground">{datum.label}</span>
              {datum.meta ? (
                <span className="text-muted-foreground"> · {datum.meta}</span>
              ) : null}
            </span>
            <span className="shrink-0 text-xs font-semibold tabular-nums text-foreground">
              {datum.display}
            </span>
          </div>
          <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-chart-track">
            <div
              className="h-full rounded-full bg-chart-mark"
              style={{ width: `${Math.max(2, (datum.value / max) * 100)}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

export function RatioGauge({
  value,
  caption,
  className,
  emphasis = "neutral",
}: {
  value: number;
  caption?: React.ReactNode;
  className?: string;

  emphasis?: "neutral" | "warning";
}) {
  const safe = Math.min(100, Math.max(0, Number.isFinite(value) ? value : 0));
  const size = 148;
  const stroke = 12;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;

  const sweep = 0.75;
  const arcLength = circumference * sweep;
  const arcColor =
    emphasis === "warning" ? "var(--warning)" : "var(--chart-mark)";

  return (
    <div className={cn("flex flex-col items-center", className)}>
      <div className="relative" style={{ width: size, height: size }}>
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          role="img"
          aria-label={`${Math.round(safe)} percent`}
          style={{ transform: "rotate(135deg)" }}
        >
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="var(--chart-track)"
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${arcLength} ${circumference}`}
          />

          {safe > 0 ? (
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke={arcColor}
              strokeWidth={stroke}
              strokeLinecap="round"
              strokeDasharray={`${(arcLength * safe) / 100} ${circumference}`}
              style={{ transition: "stroke-dasharray 500ms ease-out" }}
            />
          ) : null}
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-semibold leading-none tabular-nums text-foreground">
            {Math.round(safe)}
            <span className="text-base font-medium text-muted-foreground">
              %
            </span>
          </span>
        </div>
      </div>
      {caption ? (
        <p className="mt-2 text-center text-xs leading-4 text-muted-foreground">
          {caption}
        </p>
      ) : null}
    </div>
  );
}

export type CompositionSegment = {
  key: string;
  label: string;
  value: number;
  display: string;
};

const STEP_TOKENS = [
  "var(--chart-step-1)",
  "var(--chart-step-2)",
  "var(--chart-step-3)",
  "var(--chart-step-4)",
  "var(--chart-step-5)",
];

export function CompositionBar({
  segments,
}: {
  segments: CompositionSegment[];
}) {
  const sum = segments.reduce((acc, segment) => acc + segment.value, 0);
  const visible = segments.filter(segment => segment.value > 0);

  return (
    <div className="flex flex-col">
      <div
        className="flex h-3 w-full gap-0.5 overflow-hidden rounded-full bg-chart-track"
        role="img"
        aria-label={visible
          .map(segment => `${segment.label}: ${segment.display}`)
          .join(", ")}
      >
        {visible.map((segment, index) => (
          <span
            key={segment.key}
            className="h-full first:rounded-l-full last:rounded-r-full"
            style={{
              width: `${sum ? (segment.value / sum) * 100 : 0}%`,
              backgroundColor: STEP_TOKENS[index % STEP_TOKENS.length],
            }}
          />
        ))}
      </div>

      <ul className="mt-3 space-y-2">
        {segments.map((segment, index) => (
          <li
            key={segment.key}
            className="flex items-center justify-between gap-3 text-sm"
          >
            <span className="flex min-w-0 items-center gap-2">
              <span
                className="size-2.5 shrink-0 rounded-sm"
                style={{
                  backgroundColor: STEP_TOKENS[index % STEP_TOKENS.length],
                }}
              />
              <span className="truncate text-foreground">{segment.label}</span>
            </span>
            <span className="shrink-0 font-medium tabular-nums text-muted-foreground">
              {segment.display}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Column chart (HIMS addition, same tokens and tooltip as above)      */
/* ------------------------------------------------------------------ */

export type ColumnSeries = { key: string; label: string };

const COLUMN_COLORS = [
  "var(--chart-mark)",
  "var(--chart-step-2)",
  "var(--chart-step-4)",
  "var(--chart-step-1)",
];

const columnColor = (index: number) =>
  COLUMN_COLORS[index % COLUMN_COLORS.length];

/**
 * Grouped vertical columns for period comparisons such as admissions vs
 * discharges per day, keyed by each datum's `label`. A week gets broad,
 * rounded columns; a month packs them tighter so every day stays readable.
 */
export function ColumnChart({
  data,
  series,
  height = 220,
  formatValue = (v: number) => v.toLocaleString("en-IN"),
  className,
}: {
  data: Array<Record<string, string | number>>;
  series: ColumnSeries[];
  height?: number;
  formatValue?: (value: number) => string;
  className?: string;
}) {
  const dense = data.length > 10;
  return (
    <div className={cn("w-full", className)} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
        <BarChart
          data={data}
          margin={{ top: 8, right: 4, left: 0, bottom: 0 }}
          barGap={dense ? 1 : 4}
          barCategoryGap={dense ? "16%" : "28%"}
        >
          <CartesianGrid
            vertical={false}
            stroke="var(--chart-grid)"
            strokeDasharray="3 3"
          />
          <XAxis
            dataKey="label"
            axisLine={{ stroke: "var(--chart-grid)" }}
            tickLine={false}
            tick={AXIS_TICK}
            tickMargin={8}
            interval="preserveStartEnd"
            minTickGap={10}
          />
          <YAxis
            axisLine={false}
            tickLine={false}
            tick={AXIS_TICK}
            allowDecimals={false}
            width="auto"
            tickFormatter={v => formatValue(Number(v))}
          />
          <Tooltip
            cursor={{ fill: HOVER_FILL }}
            content={({ active, payload, label }) =>
              active && payload?.length ? (
                <TooltipShell
                  heading={String(label)}
                  rows={payload.map((p, i) => ({
                    label:
                      series.find(s => s.key === p.dataKey)?.label ??
                      String(p.dataKey),
                    value: formatValue(Number(p.value)),
                    color: columnColor(i),
                  }))}
                />
              ) : null
            }
          />
          {series.map((s, i) => (
            <Bar
              key={s.key}
              dataKey={s.key}
              name={s.label}
              fill={columnColor(i)}
              radius={dense ? [2, 2, 0, 0] : [4, 4, 0, 0]}
              maxBarSize={32}
              isAnimationActive={false}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function ChartLegend({ series }: { series: ColumnSeries[] }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {series.map((s, i) => (
        <span key={s.key} className="inline-flex items-center gap-1.5">
          <span
            className="size-2.5 rounded-sm"
            style={{ backgroundColor: columnColor(i) }}
          />
          {s.label}
        </span>
      ))}
    </div>
  );
}
