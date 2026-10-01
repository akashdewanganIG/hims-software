"use client";

import * as React from "react";
import Link from "next/link";

import { ArrowLeft, Columns } from "@/components/icons";
import { LogoPlaceholder } from "@/components/layout/logo-placeholder";
import { Button } from "@/components/ui/button";
import { useTokenBoard } from "@/features/opd/api";
import { cn } from "@/lib/utils";

/**
 * Waiting-area token display for a TV: each doctor's room, the token being
 * seen and who is next. Covers the application chrome so it can run full
 * screen; refreshes every ten seconds.
 */
export default function TokenDisplayPage() {
  const { data: rows = [], dataUpdatedAt } = useTokenBoard();
  const [now, setNow] = React.useState(() => new Date());
  React.useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 15_000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <div className="fixed inset-0 z-[80] flex flex-col overflow-hidden bg-background">
      <header className="flex items-center justify-between gap-4 border-b border-border bg-surface px-6 py-4">
        <div className="flex items-center gap-4">
          <LogoPlaceholder />
          <div>
            <p className="font-display text-xl font-bold tracking-tight">
              OPD token display
            </p>
            <p className="text-xs text-muted-foreground">
              Please wait for your token to be called
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <p className="font-display text-3xl font-bold tabular-nums text-foreground">
            {now.toLocaleTimeString("en-IN", {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </p>
          <Button
            variant="outline"
            size="icon"
            aria-label="Full screen"
            title="Full screen"
            onClick={() =>
              void document.documentElement
                .requestFullscreen?.()
                .catch(() => {})
            }
          >
            <Columns className="size-4" />
          </Button>
          <Button asChild variant="outline">
            <Link href="/opd">
              <ArrowLeft className="size-4" />
              OPD queue
            </Link>
          </Button>
        </div>
      </header>

      <main className="grid flex-1 content-start gap-4 overflow-y-auto p-6 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {rows.map(row => (
          <section
            key={row.doctorId}
            className="flex flex-col rounded-2xl border border-border bg-surface p-5 shadow-sm"
          >
            <div className="min-w-0">
              <p className="truncate text-lg font-semibold text-foreground">
                {row.doctor}
              </p>
              <p className="truncate text-sm text-muted-foreground">
                {row.department}
                {row.room ? ` · ${row.room}` : ""}
              </p>
            </div>
            <div className="mt-5 flex items-end gap-8">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                  Now serving
                </p>
                <p
                  className={cn(
                    "mt-1 font-display font-bold tabular-nums leading-none",
                    row.serving
                      ? "text-7xl text-primary"
                      : "text-2xl text-muted-foreground"
                  )}
                >
                  {row.serving ?? "Calling next"}
                </p>
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                  Next
                </p>
                <p className="mt-1 flex flex-wrap gap-1.5">
                  {row.next.length ? (
                    row.next.map(token => (
                      <span
                        key={token}
                        className="rounded-lg border border-border bg-surface-subtle px-2.5 py-1 font-display text-xl font-bold tabular-nums"
                      >
                        {token}
                      </span>
                    ))
                  ) : (
                    <span className="text-sm text-muted-foreground">
                      No one waiting
                    </span>
                  )}
                </p>
                {row.waiting > row.next.length ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    +{row.waiting - row.next.length} more waiting
                  </p>
                ) : null}
              </div>
            </div>
          </section>
        ))}
        {!rows.length ? (
          <p className="col-span-full self-center text-center text-lg text-muted-foreground">
            No patients are waiting right now.
          </p>
        ) : null}
      </main>
      <footer className="border-t border-border bg-surface px-6 py-2 text-right text-[0.6875rem] text-muted-foreground">
        Updated{" "}
        {dataUpdatedAt
          ? new Date(dataUpdatedAt).toLocaleTimeString("en-IN")
          : "—"}{" "}
        · token numbers only, no patient names
      </footer>
    </div>
  );
}
