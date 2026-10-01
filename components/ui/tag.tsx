import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const ACRONYMS = new Set([
  "OPD",
  "IPD",
  "HDU",
  "MRD",
  "EHR",
  "EMR",
  "UHID",
  "UPI",
  "IV",
  "IM",
  "SC",
  "STAT",
  "ENT",
  "OBG",
  "ICD",
  "SMS",
  "OTP",
  "ID",
  "GST",
  "SLA",
  "KPI",
  "N/A",
  "NA",
]);

function toSentenceCase(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return trimmed;

  if (!/[a-zA-Z]/.test(trimmed)) return trimmed;

  return trimmed
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((word, index) => {
      const upper = word.toUpperCase();
      if (ACRONYMS.has(upper)) return upper;

      if (/[a-z][A-Z]/.test(word)) return word;
      const lower = word.toLowerCase();
      return index === 0
        ? lower.charAt(0).toUpperCase() + lower.slice(1)
        : lower;
    })
    .join(" ");
}

const tagVariants = cva(
  [
    "inline-flex max-w-full items-center gap-1 rounded-md border align-middle",
    "min-h-5 px-1.5 py-0.5 text-[0.6875rem] font-medium leading-none",
    "whitespace-nowrap transition-colors duration-150",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30",
    "[&>svg]:size-3 [&>svg]:shrink-0",
  ].join(" "),
  {
    variants: {
      tone: {
        neutral: "border-border bg-secondary text-secondary-foreground",
        active: "border-success/20 bg-success-surface text-success-foreground",
        progress: "border-info/20 bg-info-surface text-info-foreground",
        pending: "border-warning/20 bg-warning-surface text-warning-foreground",
        danger: "border-error/20 bg-error-surface text-error-foreground",
      },
    },
    defaultVariants: { tone: "neutral" },
  }
);

const TONE_DOT = {
  neutral: "bg-muted-foreground",
  active: "bg-success",
  progress: "bg-info",
  pending: "bg-warning",
  danger: "bg-error",
} as const;

export type TagTone = keyof typeof TONE_DOT;

export interface TagProps
  extends
    Omit<React.HTMLAttributes<HTMLSpanElement>, "onCopy">,
    VariantProps<typeof tagVariants> {
  dot?: boolean;
}

export function Tag({
  className,
  tone = "neutral",
  dot = false,
  children,
  ...props
}: TagProps) {
  // Only enum-like values (SEMI_PRIVATE, IN_PROGRESS) are re-cased; free
  // text such as a bed code or an allergy is shown exactly as written.
  const label =
    typeof children === "string" && /^[A-Z0-9_s-]+$/.test(children)
      ? toSentenceCase(children)
      : children;

  return (
    <span className={cn(tagVariants({ tone }), className)} {...props}>
      {dot ? (
        <span
          aria-hidden="true"
          className={cn(
            "size-1.5 shrink-0 rounded-full",
            TONE_DOT[(tone ?? "neutral") as TagTone]
          )}
        />
      ) : null}
      <span className="min-w-0 truncate">{label}</span>
    </span>
  );
}
