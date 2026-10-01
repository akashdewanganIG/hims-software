"use client";

import Link from "next/link";
import * as React from "react";

import { AlertTriangle } from "@/components/icons";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { formatGender } from "@/lib/format";
import type { PatientRef } from "@/lib/api/lookup";
import { useSession } from "@/lib/session";
import { cn } from "@/lib/utils";

/** Monospace reference number (UHID, APT-…, INV-…). */
export function RefCode({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "whitespace-nowrap font-mono text-xs text-muted-foreground",
        className
      )}
    >
      {children}
    </span>
  );
}

export function AllergyFlag({ allergies }: { allergies: string[] }) {
  if (!allergies.length) return null;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          tabIndex={0}
          aria-label={`Allergies: ${allergies.join(", ")}`}
          className="inline-flex size-4 shrink-0 items-center justify-center rounded text-error-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
        >
          <AlertTriangle className="size-3.5" />
        </span>
      </TooltipTrigger>
      <TooltipContent>Allergic to {allergies.join(", ")}</TooltipContent>
    </Tooltip>
  );
}

/**
 * Patient cell for tables: name (linking to the EHR when the role may open
 * it), then UHID and age/sex. Clicks do not trigger the row's own action.
 */
export function PatientCell({
  patient,
  showPhone = false,
}: {
  patient: PatientRef;
  showPhone?: boolean;
}) {
  const { canAccess } = useSession();
  const name = <span className="font-medium">{patient.name}</span>;
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1">
        {canAccess("ehr") ? (
          <Link
            href={`/patients/${patient.id}`}
            onClick={event => event.stopPropagation()}
            className="truncate text-foreground outline-none hover:text-primary focus-visible:ring-2 focus-visible:ring-ring/30"
          >
            {name}
          </Link>
        ) : (
          <span className="truncate">{name}</span>
        )}
        <AllergyFlag allergies={patient.allergies} />
      </div>
      <p className="truncate text-xs text-muted-foreground">
        <span className="font-mono">{patient.uhid}</span> · {patient.age} y{" "}
        {formatGender(patient.gender)}
        {showPhone ? ` · ${patient.phone}` : ""}
      </p>
    </div>
  );
}

/** Inline link that respects role access; plain text otherwise. */
export function EntityLink({
  href,
  module,
  children,
  className,
}: {
  href: string;
  module?: Parameters<ReturnType<typeof useSession>["canAccess"]>[0];
  children: React.ReactNode;
  className?: string;
}) {
  const { canAccess } = useSession();
  if (module && !canAccess(module))
    return <span className={className}>{children}</span>;
  return (
    <Link
      href={href}
      onClick={event => event.stopPropagation()}
      className={cn(
        "font-medium text-primary outline-none hover:text-info focus-visible:ring-2 focus-visible:ring-ring/30",
        className
      )}
    >
      {children}
    </Link>
  );
}
