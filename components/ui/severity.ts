import {
  AlertCircle,
  AlertTriangle,
  Info,
  type IconComponent,
} from "@/components/icons";

/**
 * One colour language for "how urgent is this": the Operations issue list,
 * the dashboard's Needs attention card and the Alerts mailbox rows.
 */
export type Severity = "critical" | "warning" | "info";

export const SEVERITY_ICON: Record<Severity, IconComponent> = {
  critical: AlertCircle,
  warning: AlertTriangle,
  info: Info,
};

export const SEVERITY_TEXT: Record<Severity, string> = {
  critical: "text-error-foreground",
  warning: "text-warning-foreground",
  info: "text-info-foreground",
};

/** A bordered, tinted callout (one issue in a list). */
export const SEVERITY_SURFACE: Record<Severity, string> = {
  critical: "border-error-border bg-error-surface text-error-foreground",
  warning: "border-warning-border bg-warning-surface text-warning-foreground",
  info: "border-info-border bg-info-surface text-info-foreground",
};

/** The same tint for a table row, with a severity bar on its leading edge. */
export const SEVERITY_ROW: Record<Severity, string> = {
  critical:
    "border-error-border bg-error-surface hover:bg-error-border/45 [&>td:first-child]:shadow-[inset_3px_0_0_var(--error)]",
  warning:
    "border-warning-border bg-warning-surface hover:bg-warning-border/45 [&>td:first-child]:shadow-[inset_3px_0_0_var(--warning)]",
  info: "border-info-border bg-info-surface hover:bg-info-border/45 [&>td:first-child]:shadow-[inset_3px_0_0_var(--info)]",
};
