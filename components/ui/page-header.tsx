import * as React from "react";
import Link from "next/link";
import { InfoHint } from "@/components/ui/info-hint";

export function PageHeader({
  title,
  subtitle,
  actions,
  breadcrumb,
}: {
  title: React.ReactNode;
  /** Shown behind an info hint next to the title. */
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  breadcrumb?: Array<{ label: string; href?: string }>;
}) {
  return (
    <header className="space-y-1.5">
      {breadcrumb?.length ? (
        <nav
          aria-label="Breadcrumb"
          className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground"
        >
          {breadcrumb.map((crumb, index) => (
            <React.Fragment key={`${crumb.label}-${index}`}>
              {crumb.href ? (
                <Link
                  href={crumb.href}
                  className="rounded-sm outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/30"
                >
                  {crumb.label}
                </Link>
              ) : (
                <span>{crumb.label}</span>
              )}
              {index < breadcrumb.length - 1 ? (
                <span aria-hidden="true">/</span>
              ) : null}
            </React.Fragment>
          ))}
        </nav>
      ) : null}
      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-center gap-1.5">
          <h1 className="min-w-0 text-base font-semibold leading-6 tracking-tight text-foreground sm:text-lg sm:leading-7">
            {title}
          </h1>
          {subtitle ? <InfoHint label={subtitle} /> : null}
        </div>
        {actions ? (
          <div className="grid w-full min-w-0 shrink-0 grid-cols-1 items-center gap-2 sm:w-auto sm:grid-cols-none sm:flex sm:flex-wrap sm:justify-end [&>*]:min-w-0">
            {actions}
          </div>
        ) : null}
      </div>
    </header>
  );
}
