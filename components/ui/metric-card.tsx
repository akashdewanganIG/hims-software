"use client";

import * as React from "react";
import Link from "next/link";

import type { IconComponent } from "@/components/icons";
import { InfoHint } from "@/components/ui/info-hint";
import { cn } from "@/lib/utils";

export type MetricTone =
  "neutral" | "positive" | "critical" | "warning" | "info";

/**
 * The state shows in the icon tile and the hint, never as decoration:
 * ordinary cards stay grey, and anything needing attention reads red.
 */
const TONE_ICON: Record<MetricTone, string> = {
  neutral: "bg-secondary text-muted-foreground",
  positive: "bg-success-surface text-success-foreground",
  critical: "bg-error-surface text-error-foreground",
  warning: "bg-error-surface text-error-foreground",
  info: "bg-info-surface text-info-foreground",
};

const TONE_HINT: Record<MetricTone, string> = {
  neutral: "text-muted-foreground",
  positive: "text-success-foreground",
  critical: "text-error-foreground",
  warning: "text-error-foreground",
  info: "text-info-foreground",
};

export interface MetricCardProps {
  label: string;
  value: React.ReactNode;

  hint?: React.ReactNode;

  description?: React.ReactNode;
  tone?: MetricTone;
  icon?: IconComponent;
  href?: string;
  className?: string;
}

export function MetricCard({
  label,
  value,
  hint,
  description,
  tone = "neutral",
  icon: Icon,
  href,
  className,
}: MetricCardProps) {
  const interactive = Boolean(href);

  const body = (
    <>
      {/* The label has the card's full width; the icon sits beside the value. */}
      <div className="flex min-w-0 items-center gap-1.5">
        <p className="min-w-0 truncate text-[0.6875rem] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
          {label}
        </p>
        {description ? <InfoHint label={description} /> : null}
      </div>
      <div className="mt-2 flex items-center justify-between gap-3">
        <p
          className="min-w-0 truncate text-2xl font-semibold leading-none tracking-tight tabular-nums text-foreground"
          title={
            typeof value === "string" || typeof value === "number"
              ? String(value)
              : undefined
          }
        >
          {value}
        </p>
        {Icon ? (
          <span
            className={cn(
              "flex size-11 shrink-0 items-center justify-center rounded-xl",
              TONE_ICON[tone]
            )}
          >
            <Icon aria-hidden="true" className="size-6" />
          </span>
        ) : null}
      </div>

      {hint ? (
        <p
          className={cn(
            "mt-2 text-[0.6875rem] font-medium leading-4",
            TONE_HINT[tone]
          )}
        >
          {hint}
        </p>
      ) : null}
    </>
  );

  const shell = cn(
    "flex min-w-0 flex-col rounded-xl border border-border bg-card p-3.5 shadow-sm shadow-foreground/[0.02]",
    "transition-[background-color,border-color,box-shadow] duration-150",
    interactive &&
      "outline-none hover:border-border-strong hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring/30",
    className
  );

  if (href) {
    return (
      <Link href={href} className={shell}>
        {body}
      </Link>
    );
  }

  return <div className={shell}>{body}</div>;
}
