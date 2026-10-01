"use client";

import * as React from "react";
import Link from "next/link";

import type { IconComponent } from "@/components/icons";
import { cn } from "@/lib/utils";

export interface NavCardProps {
  label: string;
  hint?: React.ReactNode;
  icon?: IconComponent;
  href: string;
  className?: string;
}

/**
 * Compact card that points at a section of the app. Shares the metric card's
 * shell — same radius, border, padding and hover — so overview grids read as
 * one family whether a tile shows a number or a destination.
 */
export function NavCard({
  label,
  hint,
  icon: Icon,
  href,
  className,
}: NavCardProps) {
  return (
    <Link
      href={href}
      className={cn(
        "flex min-w-0 items-center gap-3 rounded-xl border border-border bg-card p-3.5 shadow-sm shadow-foreground/[0.02] outline-none",
        "transition-[background-color,border-color,box-shadow] duration-150",
        "hover:border-border-strong hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring/30",
        className
      )}
    >
      {Icon ? (
        <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-secondary text-muted-foreground">
          <Icon aria-hidden="true" className="size-4" />
        </span>
      ) : null}

      <span className="min-w-0 flex-1">
        <span className="block truncate text-[0.8125rem] font-semibold leading-5 text-foreground">
          {label}
        </span>
        {hint ? (
          <span className="mt-0.5 block truncate text-[0.6875rem] leading-4 text-muted-foreground">
            {hint}
          </span>
        ) : null}
      </span>
    </Link>
  );
}
