"use client";

import * as React from "react";

import { FLOW_CATEGORIES, type UserFlow } from "@/lib/architecture";
import type { Action, Module } from "@/lib/rbac";
import { cn } from "@/lib/utils";

import { FlowChart } from "./flow-chart";

export function UserFlowChartView({
  flows,
  visible,
  can,
}: {
  flows: UserFlow[];
  visible: Set<Module>;
  can: (action: Action) => boolean;
}) {
  const [selectedId, setSelectedId] = React.useState(flows[0]?.id ?? "");

  React.useEffect(() => {
    if (flows.length && !flows.some(flow => flow.id === selectedId))
      setSelectedId(flows[0]!.id);
  }, [flows, selectedId]);

  const selected = flows.find(flow => flow.id === selectedId) ?? flows[0];
  const grouped = React.useMemo(
    () =>
      FLOW_CATEGORIES.map(category => ({
        category,
        items: flows.filter(flow => flow.category === category),
      })).filter(group => group.items.length),
    [flows]
  );

  if (!selected) {
    return (
      <div className="grid h-full place-items-center rounded-xl border border-border bg-surface-subtle p-8 text-center text-sm text-muted-foreground">
        No workflows match this search or your current access.
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-2 lg:flex-row">
      <div className="-mx-1 flex shrink-0 gap-1.5 overflow-x-auto px-1 pb-1 lg:hidden">
        {flows.map(flow => (
          <FlowButton
            key={flow.id}
            flow={flow}
            active={flow.id === selected.id}
            onClick={() => setSelectedId(flow.id)}
          />
        ))}
      </div>

      <nav
        aria-label="Workflows"
        className="hidden w-64 shrink-0 overflow-y-auto rounded-xl border border-border bg-surface p-1.5 shadow-sm shadow-foreground/[0.02] lg:block"
      >
        {grouped.map(group => (
          <div key={group.category} className="mb-2 last:mb-0">
            <h3 className="px-2 py-1 text-[0.625rem] font-semibold uppercase tracking-[0.07em] text-muted-foreground">
              {group.category}
            </h3>
            <ul className="space-y-0.5">
              {group.items.map(flow => (
                <li key={flow.id}>
                  <FlowButton
                    flow={flow}
                    active={flow.id === selected.id}
                    onClick={() => setSelectedId(flow.id)}
                    full
                  />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
        <header className="shrink-0 rounded-xl border border-border bg-surface px-3 py-2.5 shadow-sm shadow-foreground/[0.02]">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <h2 className="text-sm font-semibold text-foreground">
              {selected.title}
            </h2>
            <span className="text-[0.6875rem] text-muted-foreground">
              {selected.category} · {selected.steps.length} steps
            </span>
          </div>
          <p className="mt-0.5 text-xs leading-4 text-muted-foreground">
            {selected.summary}
          </p>
        </header>
        <FlowChart
          key={selected.id}
          flow={selected}
          visible={visible}
          can={can}
        />
      </div>
    </div>
  );
}

function FlowButton({
  flow,
  active,
  onClick,
  full = false,
}: {
  flow: UserFlow;
  active: boolean;
  onClick: () => void;
  full?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "true" : undefined}
      className={cn(
        "flex items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[0.78125rem] font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/40",
        full ? "w-full" : "shrink-0 whitespace-nowrap border",
        active
          ? full
            ? "bg-selected text-selected-foreground"
            : "border-border-strong bg-selected text-selected-foreground"
          : full
            ? "text-foreground hover:bg-hover"
            : "border-border bg-surface text-muted-foreground hover:text-foreground"
      )}
    >
      <span className={cn("min-w-0 flex-1", full && "truncate")}>
        {flow.title}
      </span>
      <span className="shrink-0 text-[0.625rem] tabular-nums text-muted-foreground">
        {flow.steps.length}
      </span>
    </button>
  );
}
