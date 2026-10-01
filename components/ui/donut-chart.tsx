"use client";

import React from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

interface DonutChartProps {
  data: {
    labels: string[];
    datasets: Array<{ data: number[] }>;
  };
}

const SEGMENT_COLORS = [
  "var(--chart-step-2)",
  "var(--chart-step-3)",
  "var(--chart-step-4)",
  "var(--chart-step-5)",
  "var(--chart-step-1)",
];

/** Donut with its total in the middle and a percentage legend on the right. */
export function DonutChart({ data }: DonutChartProps) {
  const values = data.datasets[0]?.data ?? [];

  const rows = data.labels.map((name, index) => ({
    name,
    value: Number(values[index] ?? 0),
    color: SEGMENT_COLORS[index % SEGMENT_COLORS.length],
  }));
  const total = rows.reduce((sum, item) => sum + item.value, 0);

  return (
    <div className="flex h-full w-full items-center gap-4">
      <div className="relative h-full min-h-0 min-w-0 flex-1">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={rows}
              dataKey="value"
              nameKey="name"
              innerRadius="63%"
              outerRadius="88%"
              paddingAngle={2}
              cornerRadius={4}
              stroke="transparent"
              animationDuration={750}
            >
              {rows.map(item => (
                <Cell key={item.name} fill={item.color} />
              ))}
            </Pie>
            <Tooltip
              formatter={(value, name) => [
                `${Number(value).toLocaleString()} (${total ? ((Number(value) / total) * 100).toFixed(1) : 0}%)`,
                name,
              ]}
              contentStyle={{
                borderRadius: 8,
                border: "1px solid var(--border)",
                background: "var(--popover)",
                boxShadow: "0 8px 24px rgb(0 0 0 / 0.12)",
                fontSize: 12,
              }}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xl font-semibold tabular-nums text-foreground">
            {total.toLocaleString()}
          </span>
          <span className="text-[0.6875rem] uppercase tracking-widest text-muted-foreground">
            Total
          </span>
        </div>
      </div>
      <div className="grid min-w-36 gap-3">
        {rows.map(item => (
          <div key={item.name} className="flex items-center gap-2">
            <span
              className="size-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: item.color }}
            />
            <span className="text-xs font-semibold tabular-nums text-foreground">
              {total ? Math.round((item.value / total) * 100) : 0}%
            </span>
            <span className="text-xs text-muted-foreground">{item.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
