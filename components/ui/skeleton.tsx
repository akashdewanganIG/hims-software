import * as React from "react";

import { cn } from "@/lib/utils";

export function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden="true"
      role="presentation"
      className={cn(
        "motion-safe:animate-pulse rounded-md bg-skeleton",
        className
      )}
      {...props}
    />
  );
}

export function SkeletonRegion({
  label = "Loading",
  className,
  children,
}: {
  label?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      aria-busy="true"
      aria-live="polite"
      aria-label={label}
      className={className}
    >
      {children}
    </div>
  );
}

function SkeletonMetricCard({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex min-w-0 flex-col rounded-xl border border-border bg-card p-3.5",
        className
      )}
    >
      <Skeleton className="h-3 w-24" />
      <div className="mt-2 flex items-center justify-between gap-3">
        <Skeleton className="h-6 w-28" />
        <Skeleton className="size-11 rounded-xl" />
      </div>
      <Skeleton className="mt-2 h-3 w-20" />
    </div>
  );
}

export function SkeletonMetricRow({ count = 4 }: { count?: number }) {
  return (
    <SkeletonRegion label="Loading metrics" className="grid-auto-fit gap-3">
      {Array.from({ length: count }).map((_, index) => (
        <SkeletonMetricCard key={index} />
      ))}
    </SkeletonRegion>
  );
}
