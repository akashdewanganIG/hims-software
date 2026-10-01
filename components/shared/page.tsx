"use client";

import * as React from "react";

import { Lock } from "@/components/icons";
import { Alert } from "@/components/ui/alert";
import { InfoHint } from "@/components/ui/info-hint";
import { MetricCard, type MetricTone } from "@/components/ui/metric-card";
import { Skeleton, SkeletonRegion } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/** Mirrors the Ralli Wolf `supply-chain/shared` page primitives. */
export { PageHeader } from "@/components/ui/page-header";
export { PageShell } from "@/components/ui/page-shell";
export { SelectField } from "@/components/ui/select-field";
export { StatusBadge, PriorityBadge } from "@/components/ui/status-badge";

export function Panel({
  title,
  description,
  actions,
  footerAction,
  flush = false,
  children,
  className,
  bodyClassName,
}: {
  title?: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  footerAction?: React.ReactNode;
  flush?: boolean;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  const hasHeader = Boolean(title || actions);
  return (
    <section
      className={cn(
        "flex min-w-0 flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm shadow-foreground/[0.02]",
        className
      )}
    >
      {hasHeader && (
        <header className="flex flex-col gap-2 border-b border-border p-3 lg:flex-row lg:items-center lg:gap-3">
          {title && (
            <div className="flex min-w-0 shrink-0 items-center gap-1.5">
              <h2 className="min-w-0 truncate text-sm font-semibold leading-5 text-foreground">
                {title}
              </h2>
              <InfoHint label={description} />
            </div>
          )}
          {actions && (
            <div className="flex w-full min-w-0 flex-1 flex-wrap items-center gap-2 lg:justify-end">
              {actions}
            </div>
          )}
        </header>
      )}
      <div className={cn("min-w-0 flex-1", !flush && "p-3", bodyClassName)}>
        {children}
      </div>
      {footerAction && (
        <div className="flex flex-col border-t border-border p-3 pt-2.5">
          {footerAction}
        </div>
      )}
    </section>
  );
}

export function StatCard(props: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  description?: React.ReactNode;
  tone?: MetricTone;
  href?: string;
  icon?: React.ComponentProps<typeof MetricCard>["icon"];
  loading?: boolean;
}) {
  const { loading, ...rest } = props;
  return (
    <MetricCard
      {...rest}
      value={loading ? "—" : rest.value}
      hint={loading ? "Loading…" : rest.hint}
    />
  );
}

/**
 * Label above control, hint or inline error below. The label, hint and error
 * are wired to the control (id / aria-describedby / aria-invalid) when the
 * child is a single form element, so every input has an accessible name.
 */
export function Field({
  label,
  children,
  hint,
  error,
  required,
  className,
  htmlFor,
}: {
  label: string;
  children: React.ReactNode;
  hint?: React.ReactNode;
  error?: string;
  required?: boolean;
  className?: string;
  htmlFor?: string;
}) {
  const generated = React.useId();
  const child =
    React.Children.count(children) === 1 && React.isValidElement(children)
      ? (children as React.ReactElement<Record<string, unknown>>)
      : null;
  const id = htmlFor ?? (child?.props.id as string | undefined) ?? generated;
  const describedBy = error || hint ? `${id}-note` : undefined;
  const control = child
    ? React.cloneElement(child, {
        id,
        "aria-describedby":
          [child.props["aria-describedby"], describedBy]
            .filter(Boolean)
            .join(" ") || undefined,
        "aria-invalid": error ? true : child.props["aria-invalid"],
      })
    : children;
  return (
    <div className={cn("block min-w-0", className)}>
      <label
        htmlFor={id}
        className="mb-1.5 block text-[0.8125rem] font-medium text-foreground"
      >
        {label}
        {required ? (
          <span aria-hidden="true" className="ml-0.5 text-error-foreground">
            *
          </span>
        ) : null}
      </label>
      {control}
      {error ? (
        <span
          id={describedBy}
          role="alert"
          className="mt-1 block text-xs text-error-foreground"
        >
          {error}
        </span>
      ) : hint ? (
        <span
          id={describedBy}
          className="mt-1 block text-xs text-muted-foreground"
        >
          {hint}
        </span>
      ) : null}
    </div>
  );
}

export function FormSection({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <fieldset className={cn("min-w-0 space-y-3", className)}>
      <legend className="mb-2">
        <span className="text-[0.6875rem] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
          {title}
        </span>
        {description ? (
          <span className="mt-0.5 block text-xs text-muted-foreground">
            {description}
          </span>
        ) : null}
      </legend>
      {children}
    </fieldset>
  );
}

export function DetailRow({
  label,
  value,
  className,
}: {
  label: string;
  value: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-0.5 py-1.5", className)}>
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="break-words text-sm font-medium text-foreground">
        {value === undefined || value === null || value === "" ? "—" : value}
      </span>
    </div>
  );
}

export function DetailGrid({
  children,
  columns = 3,
  className,
}: {
  children: React.ReactNode;
  columns?: 2 | 3 | 4;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid gap-x-6 gap-y-1",
        columns === 2 && "sm:grid-cols-2",
        columns === 3 && "sm:grid-cols-2 lg:grid-cols-3",
        columns === 4 && "sm:grid-cols-2 lg:grid-cols-4",
        className
      )}
    >
      {children}
    </div>
  );
}

export function ErrorBanner({
  error,
  className,
}: {
  error: unknown;
  className?: string;
}) {
  if (!error) return null;
  const message =
    error instanceof Error ? error.message : "Something went wrong";
  return (
    <Alert tone="error" title="Could not load this view" className={className}>
      {message}
    </Alert>
  );
}

export function EmptyState({
  title,
  description,
  action,
  className,
}: {
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border border-dashed border-border bg-surface-subtle/60 px-4 py-10 text-center",
        className
      )}
    >
      <p className="text-sm font-medium text-foreground">{title}</p>
      {description ? (
        <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
          {description}
        </p>
      ) : null}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

export function NoAccess({ module }: { module: string }) {
  return (
    <div className="flex min-h-[50vh] items-center justify-center px-4">
      <div className="max-w-sm text-center">
        <span className="mx-auto flex size-10 items-center justify-center rounded-lg bg-secondary text-muted-foreground">
          <Lock className="size-5" />
        </span>
        <h1 className="mt-3 text-base font-semibold text-foreground">
          No access to {module}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Your role does not include this module. Switch to a role that does
          from the profile menu.
        </p>
      </div>
    </div>
  );
}

export function PanelRowsSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <SkeletonRegion label="Loading" className="space-y-2">
      {Array.from({ length: rows }).map((_, index) => (
        <Skeleton key={index} className="h-10 w-full rounded-lg" />
      ))}
    </SkeletonRegion>
  );
}

/** Small headline number with a label, for dense summary strips. */
export function MiniStat({
  label,
  value,
  tone = "neutral",
  className,
}: {
  label: string;
  value: React.ReactNode;
  tone?: "neutral" | "critical" | "positive" | "info";
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border border-border bg-surface-subtle px-3 py-2.5",
        className
      )}
    >
      <p className="truncate text-xs leading-4 text-muted-foreground">
        {label}
      </p>
      <p
        className={cn(
          "mt-1 text-lg font-semibold leading-none tabular-nums",
          tone === "critical" && "text-error-foreground",
          tone === "positive" && "text-success-foreground",
          tone === "info" && "text-info-foreground"
        )}
      >
        {value}
      </p>
    </div>
  );
}

export interface TimelineEntry {
  id: string;
  at: string;
  title: React.ReactNode;
  meta?: React.ReactNode;
  body?: React.ReactNode;
  tone?: "neutral" | "info" | "success" | "warning" | "danger";
}

const DOT: Record<NonNullable<TimelineEntry["tone"]>, string> = {
  neutral: "bg-muted-foreground",
  info: "bg-info",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-error",
};

export function Timeline({
  entries,
  empty = "No activity yet.",
}: {
  entries: TimelineEntry[];
  empty?: string;
}) {
  if (!entries.length)
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">{empty}</p>
    );
  return (
    <ol className="relative space-y-0">
      {entries.map((entry, index) => (
        <li key={entry.id} className="relative flex gap-3 pb-4 last:pb-0">
          {index < entries.length - 1 ? (
            <span
              aria-hidden="true"
              className="absolute left-[5px] top-4 h-[calc(100%-0.5rem)] w-px bg-border"
            />
          ) : null}
          <span
            aria-hidden="true"
            className={cn(
              "mt-1.5 size-[11px] shrink-0 rounded-full border-2 border-card",
              DOT[entry.tone ?? "neutral"]
            )}
          />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
              <p className="min-w-0 text-[0.8125rem] font-medium text-foreground">
                {entry.title}
              </p>
              <time className="shrink-0 text-xs tabular-nums text-muted-foreground">
                {entry.meta}
              </time>
            </div>
            {entry.body ? (
              <div className="mt-0.5 text-xs leading-5 text-muted-foreground">
                {entry.body}
              </div>
            ) : null}
          </div>
        </li>
      ))}
    </ol>
  );
}
