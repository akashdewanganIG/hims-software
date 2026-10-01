import * as React from "react";
import {
  AlertCircle,
  CheckCircle2,
  Info,
  TriangleAlert,
} from "@/components/icons";
import { cn } from "@/lib/utils";

const tones = {
  info: "border-info/20 bg-info-surface text-info-foreground",
  success: "border-success/20 bg-success-surface text-success-foreground",
  warning: "border-warning/20 bg-warning-surface text-warning-foreground",
  error: "border-error/20 bg-error-surface text-error-foreground",
};

const icons = {
  info: Info,
  success: CheckCircle2,
  warning: TriangleAlert,
  error: AlertCircle,
};

export function Alert({
  tone = "info",
  title,
  children,
  action,
  className,
}: {
  tone?: keyof typeof tones;
  title?: React.ReactNode;
  children: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  const Icon = icons[tone];
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cn(
        "flex min-w-0 flex-col gap-3 rounded-xl border px-4 py-3 text-sm sm:flex-row sm:items-start",
        tones[tone],
        className
      )}
    >
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <div className="min-w-0 flex-1 break-words leading-5">
        {title ? <p className="font-semibold">{title}</p> : null}
        <div className={cn(title && "mt-0.5")}>{children}</div>
      </div>
      {action ? <div className="shrink-0 sm:self-center">{action}</div> : null}
    </div>
  );
}
