"use client";

import * as React from "react";
import Link from "next/link";

import type { IconComponent } from "@/components/icons";
import { InfoHint } from "@/components/ui/info-hint";
import { cn } from "@/lib/utils";

export type MetricTone =
  "neutral" | "positive" | "critical" | "warning" | "info";

/**
 * The card itself carries the state colour, so a row of metrics can be
 * scanned before its labels are read. The icon remains a high-contrast cue.
 */
const TONE_ICON: Record<MetricTone, string> = {
  neutral: "bg-white/80 text-muted-foreground shadow-sm ring-1 ring-black/5",
  positive:
    "bg-white/75 text-success-foreground shadow-sm ring-1 ring-success/10",
  critical: "bg-white/75 text-error-foreground shadow-sm ring-1 ring-error/10",
  warning:
    "bg-white/75 text-warning-foreground shadow-sm ring-1 ring-warning/10",
  info: "bg-white/75 text-info-foreground shadow-sm ring-1 ring-info/10",
};

const TONE_CARD: Record<MetricTone, string> = {
  neutral: "border-border bg-card shadow-foreground/[0.05]",
  positive:
    "border-success-border bg-gradient-to-br from-success-surface via-success-surface to-white shadow-success/10",
  critical:
    "border-error-border bg-gradient-to-br from-error-surface via-error-surface to-white shadow-error/10",
  warning:
    "border-warning-border bg-gradient-to-br from-warning-surface via-warning-surface to-white shadow-warning/10",
  info: "border-info-border bg-gradient-to-br from-info-surface via-info-surface to-white shadow-info/10",
};

const TONE_HINT: Record<MetricTone, string> = {
  neutral: "text-muted-foreground",
  positive: "text-success-foreground",
  critical: "text-error-foreground",
  warning: "text-warning-foreground",
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
      <span
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute -right-7 -top-7 size-24 rounded-full opacity-40 blur-2xl",
          tone === "positive" && "bg-success",
          tone === "critical" && "bg-error",
          tone === "warning" && "bg-warning",
          tone === "info" && "bg-info"
        )}
      />
      {/* The label has the card's full width; the icon sits beside the value. */}
      <div className="relative z-10 flex min-w-0 items-center gap-1.5">
        <p className="min-w-0 truncate text-[0.6875rem] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
          {label}
        </p>
        {description ? <InfoHint label={description} /> : null}
      </div>
      <div className="relative z-10 mt-2 flex items-center justify-between gap-3">
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
            "relative z-10 mt-2 text-[0.6875rem] font-medium leading-4",
            TONE_HINT[tone]
          )}
        >
          {hint}
        </p>
      ) : null}
    </>
  );

  const shell = cn(
    "relative flex min-w-0 flex-col overflow-hidden rounded-xl border p-3.5 shadow-md",
    TONE_CARD[tone],
    "transition-[background-color,border-color,box-shadow,transform] duration-200",
    interactive &&
      "outline-none hover:-translate-y-0.5 hover:shadow-lg focus-visible:ring-2 focus-visible:ring-ring/30",
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
