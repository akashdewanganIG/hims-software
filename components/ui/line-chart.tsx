"use client";

import React from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

interface LineChartProps {
  data: {
    labels: string[];
    datasets: Array<{ label: string; data: number[] }>;
  };
  showLegend?: boolean;
}

const AXIS_TICK = { fill: "var(--muted-foreground)", fontSize: 11 };

const SERIES_COLORS = [
  "var(--chart-mark)",
  "var(--chart-step-4)",
  "var(--chart-step-2)",
];

export function LineChart({ data, showLegend = false }: LineChartProps) {
  const rows = data.labels.map((label, index) => ({
    label,
    ...Object.fromEntries(
      data.datasets.map((dataset, datasetIndex) => [
        `series${datasetIndex}`,
        Number(dataset.data[index] ?? 0),
      ])
    ),
  }));

  const gradientId = React.useId();

  return (
    <div className="h-full w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={rows}
          margin={{ top: 8, right: 10, left: -6, bottom: 0 }}
        >
          <defs>
            {data.datasets.map((_, index) => {
              const color = SERIES_COLORS[index % SERIES_COLORS.length];
              return (
                <linearGradient
                  key={index}
                  id={`${gradientId}-${index}`}
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <stop offset="0%" stopColor={color} stopOpacity={0.22} />
                  <stop offset="100%" stopColor={color} stopOpacity={0} />
                </linearGradient>
              );
            })}
          </defs>

          <CartesianGrid
            vertical={false}
            stroke="var(--chart-grid)"
            strokeOpacity={0.7}
          />
          <XAxis
            dataKey="label"
            axisLine={false}
            tickLine={false}
            tick={AXIS_TICK}
            tickMargin={10}
          />
          <YAxis
            axisLine={false}
            tickLine={false}
            allowDecimals={false}
            tick={AXIS_TICK}
            tickMargin={8}
            width={44}
          />
          <Tooltip
            cursor={{
              stroke: "var(--chart-mark)",
              strokeDasharray: "4 4",
              strokeOpacity: 0.5,
            }}
            contentStyle={{
              borderRadius: 8,
              border: "1px solid var(--border)",
              background: "var(--popover)",
              boxShadow: "0 8px 24px rgb(0 0 0 / 0.12)",
              fontSize: 12,
              padding: "8px 10px",
            }}
            labelStyle={{ color: "var(--muted-foreground)", fontSize: 11 }}
          />
          {showLegend && (
            <Legend
              iconType="circle"
              iconSize={8}
              wrapperStyle={{ fontSize: 12 }}
            />
          )}
          {data.datasets.map((dataset, index) => {
            const color = SERIES_COLORS[index % SERIES_COLORS.length];
            return (
              <Area
                key={`${dataset.label}-${index}`}
                type="monotone"
                dataKey={`series${index}`}
                name={dataset.label}
                stroke={color}
                strokeWidth={2}
                fill={`url(#${gradientId}-${index})`}
                dot={false}
                activeDot={{
                  r: 4,
                  fill: color,
                  stroke: "var(--surface)",
                  strokeWidth: 2,
                }}
                animationDuration={600}
              />
            );
          })}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
