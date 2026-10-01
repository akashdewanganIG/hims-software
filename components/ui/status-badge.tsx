import * as React from "react";

import { Tag, type TagTone } from "@/components/ui/tag";

export type SemanticTone = TagTone;

/**
 * One status vocabulary for the whole hospital. Tones carry meaning, never
 * decoration: green = done/good, blue = in progress, amber = waiting on
 * someone, red = stopped or needs attention, grey = closed/inactive.
 */
const TONE_BY_STATUS: Record<string, SemanticTone> = {
  // Done / healthy
  COMPLETED: "active",
  COMPLETE: "active",
  CONVERTED: "active",
  VERIFIED: "active",
  PAID: "active",
  DISPENSED: "active",
  RESOLVED: "active",
  AVAILABLE: "active",
  ACTIVE: "active",
  FINAL: "active",
  ON_DUTY: "active",

  // In progress
  CHECKED_IN: "progress",
  IN_CONSULTATION: "progress",
  APPOINTMENT_SCHEDULED: "progress",
  COLLECTED: "progress",
  PROCESSING: "progress",
  RESULT_READY: "progress",
  ADMITTED: "progress",
  OCCUPIED: "progress",
  PARTIALLY_PAID: "progress",
  PARTIALLY_DISPENSED: "progress",
  PARTIAL: "progress",
  ASSIGNED: "progress",
  IN_PROGRESS: "progress",
  PENDING_REVIEW: "progress",
  OPEN_VISIT: "progress",

  // Waiting on someone
  NEW: "pending",
  SCHEDULED: "pending",
  FOLLOW_UP_REQUIRED: "pending",
  ORDERED: "pending",
  SAMPLE_PENDING: "pending",
  TRANSFER_PENDING: "pending",
  DISCHARGE_PENDING: "pending",
  RESERVED: "pending",
  CLEANING: "pending",
  PENDING: "pending",
  OPEN: "pending",
  INCOMPLETE: "pending",
  DRAFT: "pending",
  ON_LEAVE: "pending",
  LEAVE: "pending",

  // Stopped / attention
  CANCELLED: "danger",
  NO_SHOW: "danger",
  MAINTENANCE: "danger",
  OVERDUE: "danger",

  // Closed / inactive
  CLOSED: "neutral",
  DISCHARGED: "neutral",
  REFUNDED: "neutral",
  ARCHIVED: "neutral",
  INACTIVE: "neutral",
  NOT_REQUIRED: "neutral",
  OFF: "neutral",
};

const LABEL_OVERRIDE: Record<string, string> = {
  FOLLOW_UP_REQUIRED: "Follow-up required",
  RESULT_READY: "Result ready",
  NO_SHOW: "No-show",
  PARTIALLY_DISPENSED: "Partly dispensed",
  PARTIALLY_PAID: "Partly paid",
  NOT_REQUIRED: "Not required",
  ON_LEAVE: "On leave",
};

function normalise(status: string) {
  return status
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, "_");
}

export function statusTone(status: string | null | undefined): SemanticTone {
  if (!status) return "neutral";
  return TONE_BY_STATUS[normalise(status)] ?? "neutral";
}

export function statusLabel(status: string) {
  const key = normalise(status);
  if (LABEL_OVERRIDE[key]) return LABEL_OVERRIDE[key];
  const words = key.toLowerCase().split("_");
  const [first = "", ...rest] = words;
  return [first.charAt(0).toUpperCase() + first.slice(1), ...rest].join(" ");
}

export function StatusBadge({
  status,
  label,
  tone,
  className,
}: {
  status: string | null | undefined;
  label?: React.ReactNode;
  tone?: SemanticTone;
  className?: string;
}) {
  if (!status && !label) {
    return <span className="text-muted-foreground">—</span>;
  }
  const resolved = tone ?? statusTone(status);
  return (
    <Tag tone={resolved} className={className}>
      {label ?? statusLabel(String(status))}
    </Tag>
  );
}

const PRIORITY_TONE: Record<string, SemanticTone> = {
  CRITICAL: "danger",
  STAT: "danger",
  HIGH: "danger",
  URGENT: "pending",
  MEDIUM: "pending",
  LOW: "neutral",
  ROUTINE: "neutral",
};

/** Complaint priority and lab order priority share one scale. */
export function PriorityBadge({
  priority,
  className,
}: {
  priority: string | null | undefined;
  className?: string;
}) {
  if (!priority) return <span className="text-muted-foreground">—</span>;
  return (
    <Tag
      tone={PRIORITY_TONE[normalise(priority)] ?? "neutral"}
      className={className}
    >
      {statusLabel(priority)}
    </Tag>
  );
}

const ROLE_TONE: Record<string, SemanticTone> = {
  ADMINISTRATOR: "danger",
  DOCTOR: "progress",
  NURSE: "progress",
  OPERATIONS_MANAGER: "pending",
};

export function roleTone(role: string | null | undefined): SemanticTone {
  if (!role) return "neutral";
  return ROLE_TONE[normalise(role)] ?? "neutral";
}
