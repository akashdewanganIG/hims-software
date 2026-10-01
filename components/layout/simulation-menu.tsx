"use client";

import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";

import { Activity, RotateCcw, ShieldCheck } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ROOT_KEY,
  fetchStatus,
  fetchView,
  loadConfig,
  resetData,
  type AppConfig,
  type DataStatus,
} from "@/lib/api/data-source";
import { formatDateTime, pluralize } from "@/lib/format";
import { useSession } from "@/lib/session";
import type { IntegrityIssue } from "@/lib/sim/integrity";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";

/**
 * Header control in the spot Ralli Wolf uses for system status: where the
 * data lives, the cross-module integrity check on demand and (for
 * administrators) a reset of the hospital.
 */
export function SimulationMenu() {
  const queryClient = useQueryClient();
  const { can, user } = useSession();
  const [issues, setIssues] = React.useState<IntegrityIssue[] | null>(null);
  const [checking, setChecking] = React.useState(false);
  const [confirmReset, setConfirmReset] = React.useState(false);
  const [status, setStatus] = React.useState<DataStatus | null>(null);
  const [config, setConfig] = React.useState<AppConfig | null>(null);

  const refreshStatus = () => {
    void loadConfig().then(setConfig);
    fetchStatus()
      .then(setStatus)
      .catch(() => setStatus(null));
  };

  const runCheck = async () => {
    setChecking(true);
    try {
      const result = (await fetchView(
        "system.integrity",
        {},
        user?.id ?? null
      )) as {
        issues: IntegrityIssue[];
      };
      setIssues(result.issues);
    } catch (error) {
      toast.error(error, "Integrity check failed");
    } finally {
      setChecking(false);
    }
  };

  const healthy = issues === null || issues.length === 0;
  const server = config?.mode === "server";
  const canReset =
    can("simulation.reset") && (!server || (config?.resetAllowed ?? false));

  return (
    <>
      <DropdownMenu onOpenChange={open => open && refreshStatus()}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="relative inline-flex size-9 shrink-0 items-center justify-center rounded-lg border border-border bg-surface text-muted-foreground outline-none transition-[background-color,border-color,color] duration-150 hover:border-border-strong hover:bg-surface-subtle hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/30"
            aria-label="Simulation status"
          >
            <Activity aria-hidden="true" className="size-4" />
            <span
              aria-hidden="true"
              className={cn(
                "absolute -right-0.5 -top-0.5 size-2.5 rounded-full border-2 border-surface",
                healthy ? "bg-success" : "bg-error"
              )}
            />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          sideOffset={6}
          className="w-[min(19rem,calc(100vw-2rem))] p-1"
        >
          <div className="flex items-center justify-between gap-3 px-2 py-1.5">
            <p className="text-[0.8125rem] font-semibold leading-5 text-foreground">
              Simulation
            </p>
            <span className="text-[0.6875rem] font-medium text-success-foreground">
              {server ? "PostgreSQL · shared" : "Running locally"}
            </span>
          </div>
          <div className="space-y-1 border-t border-border-subtle px-2 py-2 text-xs text-muted-foreground">
            {status ? (
              <>
                <p>
                  Data anchored to{" "}
                  <span className="font-medium text-foreground">
                    {formatDateTime(status.anchoredAt)}
                  </span>
                </p>
                <p>
                  {status.userChanges
                    ? `${pluralize(status.userChanges, "change")} made${server ? " by all users" : " in this sandbox"}`
                    : "No changes made yet — seeded state"}
                </p>
              </>
            ) : (
              <p>Loading status…</p>
            )}
            <p>
              {server
                ? `Stored in the hospital database${status?.version !== undefined ? ` · version ${status.version}` : ""}. Fictional data.`
                : "Stored in this browser only. Fictional data."}
            </p>
          </div>
          <div className="border-t border-border-subtle px-2 py-2">
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 text-xs font-medium text-foreground">
                <ShieldCheck className="size-4 text-muted-foreground" />
                Data integrity
              </span>
              <Button
                size="sm"
                variant="outline"
                onClick={() => void runCheck()}
                disabled={checking}
              >
                {checking ? "Checking…" : "Run check"}
              </Button>
            </div>
            {issues !== null ? (
              issues.length === 0 ? (
                <p className="mt-2 text-xs text-success-foreground">
                  All cross-module rules hold: beds, stock, bills, labs and
                  records reconcile.
                </p>
              ) : (
                <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto text-xs text-error-foreground">
                  {issues.slice(0, 12).map((issue, index) => (
                    <li key={index}>
                      <span className="font-medium">{issue.rule}</span> —{" "}
                      {issue.detail}
                    </li>
                  ))}
                </ul>
              )
            ) : null}
          </div>
          {canReset ? (
            <div className="border-t border-border-subtle p-1">
              <button
                type="button"
                onClick={() => setConfirmReset(true)}
                className="flex min-h-9 w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[0.8125rem] font-medium text-error-foreground outline-none transition-colors hover:bg-error-surface focus-visible:ring-2 focus-visible:ring-ring/25"
              >
                <RotateCcw className="size-4" />
                Reset simulation
              </button>
            </div>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      <ConfirmationDialog
        open={confirmReset}
        onOpenChange={setConfirmReset}
        variant="destructive"
        title="Reset the simulation?"
        description={
          server
            ? "Every change made by every user is discarded and a fresh 30-day hospital history is written to the database. This takes a few seconds."
            : "Every change made in this browser is discarded and a fresh 30-day hospital history is replayed up to now. This takes a few seconds."
        }
        confirmText="Reset simulation"
        onConfirm={async () => {
          try {
            await resetData();
          } catch (error) {
            toast.error(error, "Reset failed");
            return;
          }
          setIssues(null);
          await queryClient.invalidateQueries({ queryKey: [ROOT_KEY] });
          toast.success("Simulation reset", {
            description: "A fresh hospital history has been generated.",
          });
        }}
      />
    </>
  );
}
