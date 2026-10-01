"use client";

import * as React from "react";

import { ArchitectureChart } from "@/components/architecture/architecture-chart";
import { UserFlowChartView } from "@/components/architecture/user-flow-chart-view";
import { Search, X } from "@/components/icons";
import { PageHeader, PageShell } from "@/components/shared/page";
import { CategorySwitcher } from "@/components/ui/category-switcher";
import { Input } from "@/components/ui/input";
import {
  ARCH_MODULES,
  ARCH_RELATIONS,
  USER_FLOWS,
  type ArchModule,
  type UserFlow,
} from "@/lib/architecture";
import { useSession } from "@/lib/session";

type View = "map" | "flows";

const includes = (query: string, ...values: Array<string | undefined>) => {
  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
  const text = values.join(" ").toLowerCase();
  return tokens.every(token => text.includes(token));
};

/** Interactive module architecture and real hospital workflows. */
export default function ArchitecturePage() {
  const { canAccess, can, role } = useSession();
  const [view, setView] = React.useState<View>("map");
  const [query, setQuery] = React.useState("");

  const modules = React.useMemo(
    () => ARCH_MODULES.filter(module => canAccess(module.module)),
    [canAccess]
  );
  const visible = React.useMemo(
    () => new Set(modules.map(module => module.module)),
    [modules]
  );
  const flows = React.useMemo(
    () =>
      USER_FLOWS.filter(flow =>
        flow.steps.some(step => step.module && visible.has(step.module))
      ),
    [visible]
  );

  const shownModules = React.useMemo(
    () => filterModules(modules, query),
    [modules, query]
  );
  const shownModuleIds = React.useMemo(
    () => new Set(shownModules.map(module => module.module)),
    [shownModules]
  );
  const shownRelations = React.useMemo(
    () =>
      ARCH_RELATIONS.filter(
        relation =>
          shownModuleIds.has(relation.from) && shownModuleIds.has(relation.to)
      ),
    [shownModuleIds]
  );
  const shownFlows = React.useMemo(
    () => filterFlows(flows, query),
    [flows, query]
  );

  return (
    <PageShell>
      <PageHeader
        title="Architecture & flows"
        subtitle="Explore how hospital modules hand work to one another, then follow each operational journey from start to completion."
        actions={
          <CategorySwitcher
            label="View"
            value={view}
            onValueChange={setView}
            items={[
              { value: "map", label: "Architecture", count: modules.length },
              { value: "flows", label: "Workflows", count: flows.length },
            ]}
          />
        }
      />

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-muted-foreground">
          Showing{" "}
          <span className="font-semibold text-foreground">
            {view === "map" ? shownModules.length : shownFlows.length} of{" "}
            {view === "map" ? modules.length : flows.length}
          </span>{" "}
          {view === "map" ? "modules" : "workflows"} available to{" "}
          {role ? `the ${role.name} role` : "your login"}.
        </p>
        <div className="relative w-full sm:w-72">
          <Search
            aria-hidden
            className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder={
              view === "map" ? "Find a module or record…" : "Find a workflow…"
            }
            aria-label={
              view === "map" ? "Search architecture" : "Search workflows"
            }
            className="h-9 pl-8 pr-8"
          />
          {query ? (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 inline-flex size-5 -translate-y-1/2 items-center justify-center rounded text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40"
            >
              <X className="size-3.5" />
            </button>
          ) : null}
        </div>
      </div>

      <div className="flex h-[clamp(38rem,72svh,60rem)] min-h-0 flex-col">
        {view === "map" ? (
          <ArchitectureChart
            modules={shownModules}
            relations={shownRelations}
            can={can}
            onOpenFlows={() => {
              setView("flows");
              setQuery("");
            }}
          />
        ) : (
          <UserFlowChartView flows={shownFlows} visible={visible} can={can} />
        )}
      </div>
    </PageShell>
  );
}

function filterModules(modules: ArchModule[], query: string) {
  if (!query.trim()) return modules;
  return modules.filter(module =>
    includes(
      query,
      module.label,
      module.description,
      ...module.owns,
      ...module.pages.flatMap(page => [page.label, page.description])
    )
  );
}

function filterFlows(flows: UserFlow[], query: string) {
  if (!query.trim()) return flows;
  return flows.filter(flow =>
    includes(
      query,
      flow.title,
      flow.summary,
      flow.category,
      ...flow.steps.flatMap(step => [step.label, step.note])
    )
  );
}
