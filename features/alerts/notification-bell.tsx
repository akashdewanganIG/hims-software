"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { AlertCircle, Bell, CheckCheck } from "@/components/icons";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tag } from "@/components/ui/tag";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

import { useAlerts, useAlertSummary } from "./api";

const SOUND_KEY = "hims-critical-alert-sound";

function playCriticalTone() {
  const AudioContextClass = window.AudioContext;
  const context = new AudioContextClass();
  const gain = context.createGain();
  const oscillator = context.createOscillator();
  oscillator.type = "sine";
  oscillator.frequency.setValueAtTime(880, context.currentTime);
  gain.gain.setValueAtTime(0.0001, context.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.16, context.currentTime + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.35);
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start();
  oscillator.stop(context.currentTime + 0.36);
  oscillator.addEventListener("ended", () => void context.close());
}

export function AlertNotificationBell() {
  const router = useRouter();
  const { data: summary } = useAlertSummary();
  const { data: unread = [] } = useAlerts({
    box: "inbox",
    unreadOnly: true,
    status: "OPEN",
  });
  const [soundEnabled, setSoundEnabled] = React.useState(false);
  const previousCriticalIds = React.useRef<Set<string> | null>(null);

  React.useEffect(() => {
    setSoundEnabled(window.localStorage.getItem(SOUND_KEY) === "on");
  }, []);

  React.useEffect(() => {
    const current = new Set(
      unread
        .filter(alert => alert.priority === "CRITICAL")
        .map(alert => alert.id)
    );
    const previous = previousCriticalIds.current;
    previousCriticalIds.current = current;
    if (
      soundEnabled &&
      previous &&
      [...current].some(alertId => !previous.has(alertId))
    )
      playCriticalTone();
  }, [unread, soundEnabled]);

  const setSound = (enabled: boolean) => {
    setSoundEnabled(enabled);
    window.localStorage.setItem(SOUND_KEY, enabled ? "on" : "off");
    if (enabled) playCriticalTone();
  };
  const unreadCount = summary?.unread ?? 0;
  const overdueSent = summary?.overdueSent ?? 0;
  const attentionCount = unreadCount + overdueSent;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="relative"
          aria-label={`${unreadCount} unread alert${unreadCount === 1 ? "" : "s"}${overdueSent ? ` and ${overdueSent} overdue sent alert${overdueSent === 1 ? "" : "s"}` : ""}`}
        >
          <Bell className="size-4" />
          {attentionCount ? (
            <span className="absolute -right-1.5 -top-1.5 flex min-h-5 min-w-5 items-center justify-center rounded-full bg-error px-1 text-[0.625rem] font-bold text-error-foreground shadow-sm ring-2 ring-navbar">
              {attentionCount > 99 ? "99+" : attentionCount}
            </span>
          ) : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[22rem] max-w-[90vw] p-0">
        <div className="flex items-center justify-between gap-3 px-3 py-2.5">
          <div>
            <p className="text-sm font-semibold text-foreground">Alerts</p>
            <p className="text-xs text-muted-foreground">
              {unreadCount
                ? `${unreadCount} unread${summary?.escalated ? ` · ${summary.escalated} escalated` : ""}`
                : "You are all caught up"}
            </p>
          </div>
          {summary?.unreadCritical ? (
            <Tag tone="danger">{summary.unreadCritical} critical</Tag>
          ) : (
            <CheckCheck className="size-4 text-success-foreground" />
          )}
        </div>
        <DropdownMenuSeparator className="m-0" />
        {overdueSent ? (
          <DropdownMenuItem
            className="h-auto cursor-pointer items-start gap-2 rounded-none border-b border-border bg-warning-surface px-3 py-2.5 text-warning-foreground"
            onSelect={() => router.push("/alerts?box=sent")}
          >
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
            <span>
              <span className="block text-sm font-medium">
                {overdueSent} sent alert{overdueSent === 1 ? " is" : "s are"}{" "}
                overdue
              </span>
              <span className="mt-0.5 block text-xs">
                Review delivery, acknowledgement and escalation status.
              </span>
            </span>
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuLabel>Recent unread</DropdownMenuLabel>
        {unread.length ? (
          unread.slice(0, 5).map(alert => (
            <DropdownMenuItem
              key={alert.id}
              className="h-auto cursor-pointer items-start gap-2 rounded-none px-3 py-2.5"
              onSelect={() => router.push(`/alerts?alert=${alert.id}`)}
            >
              <span
                className={cn(
                  "mt-1.5 block size-2 shrink-0 rounded-full",
                  alert.priority === "CRITICAL" ? "bg-error" : "bg-info"
                )}
              />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  <span className="truncate text-sm font-medium">
                    {alert.subject}
                  </span>
                  {alert.isEscalatedToMe ? (
                    <AlertCircle className="size-3.5 shrink-0 text-warning-foreground" />
                  ) : null}
                </span>
                <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                  {alert.sender} · {formatDateTime(alert.createdAt)}
                </span>
              </span>
            </DropdownMenuItem>
          ))
        ) : (
          <p className="px-3 py-5 text-center text-xs text-muted-foreground">
            No unread alerts.
          </p>
        )}
        <DropdownMenuSeparator className="m-0" />
        <DropdownMenuCheckboxItem
          checked={soundEnabled}
          onCheckedChange={setSound}
          onSelect={event => event.preventDefault()}
          className="rounded-none"
        >
          Sound for new critical alerts
        </DropdownMenuCheckboxItem>
        <DropdownMenuItem
          className="justify-center rounded-none border-t border-border font-medium"
          onSelect={() => router.push("/alerts")}
        >
          View all alerts
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
