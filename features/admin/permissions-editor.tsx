"use client";

import * as React from "react";

import { ShieldCheck } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { MODULE_ICON } from "@/lib/navigation";
import {
  ACTIONS,
  ACTION_INFO,
  ACTION_MODULE,
  MODULES,
  MODULE_DESCRIPTION,
  MODULE_LABEL,
  normaliseGrants,
  type Action,
  type Module,
} from "@/lib/rbac";
import { cn } from "@/lib/utils";

export interface Grants {
  modules: Module[];
  actions: Action[];
}

const ACTIONS_OF = new Map<Module, Action[]>(
  MODULES.map(m => [m, ACTIONS.filter(a => ACTION_MODULE[a] === m)])
);

/**
 * Module-by-module permissions: each module opens its pages; each action
 * under it adds a button. Ticking an action opens its module, closing a
 * module drops its actions, and every login keeps its dashboard — the same
 * rules the server applies when it saves.
 */
export function PermissionsEditor({
  value,
  onChange,
  disabled,
  className,
}: {
  value: Grants;
  onChange: (next: Grants) => void;
  disabled?: boolean;
  className?: string;
}) {
  const modules = React.useMemo(() => new Set(value.modules), [value.modules]);
  const actions = React.useMemo(() => new Set(value.actions), [value.actions]);

  const commit = (
    nextModules: Iterable<Module>,
    nextActions: Iterable<Action>
  ) => onChange(normaliseGrants([...nextModules], [...nextActions]));

  const setModule = (module: Module, on: boolean) => {
    const nextModules = new Set(modules);
    const nextActions = new Set(actions);
    if (on) nextModules.add(module);
    else {
      nextModules.delete(module);
      for (const action of ACTIONS_OF.get(module) ?? [])
        nextActions.delete(action);
    }
    commit(nextModules, nextActions);
  };
  const setAction = (action: Action, on: boolean) => {
    const nextActions = new Set(actions);
    if (on) nextActions.add(action);
    else nextActions.delete(action);
    commit(modules, nextActions);
  };
  const setAll = (module: Module, on: boolean) => {
    const nextModules = new Set(modules);
    const nextActions = new Set(actions);
    if (on) nextModules.add(module);
    for (const action of ACTIONS_OF.get(module) ?? [])
      if (on) nextActions.add(action);
      else nextActions.delete(action);
    commit(nextModules, nextActions);
  };

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <p>
          <span className="font-semibold tabular-nums text-foreground">
            {value.modules.length}
          </span>{" "}
          of {MODULES.length} modules ·{" "}
          <span className="font-semibold tabular-nums text-foreground">
            {value.actions.length}
          </span>{" "}
          of {ACTIONS.length} actions
        </p>
        <p className="flex items-center gap-1.5">
          <ShieldCheck className="size-3.5" />
          Anything left unticked is refused by the server, not just hidden.
        </p>
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        {MODULES.map(module => {
          const open = modules.has(module);
          const own = ACTIONS_OF.get(module) ?? [];
          const granted = own.filter(a => actions.has(a)).length;
          const Icon = MODULE_ICON.get(module);
          const always = module === "dashboard";
          return (
            <section
              key={module}
              className={cn(
                "rounded-xl border bg-card transition-colors",
                open ? "border-border-strong" : "border-border"
              )}
            >
              <header className="flex items-start gap-3 px-3.5 py-3">
                <Checkbox
                  className="mt-0.5"
                  aria-label={`Open ${MODULE_LABEL[module]}`}
                  checked={open}
                  disabled={disabled || always}
                  onCheckedChange={on => setModule(module, on)}
                />
                <div className="min-w-0 flex-1">
                  <h4 className="flex items-center gap-1.5 text-[0.8125rem] font-semibold text-foreground">
                    {Icon ? (
                      <Icon
                        className={cn(
                          "size-4",
                          open ? "text-primary" : "text-muted-foreground"
                        )}
                      />
                    ) : null}
                    {MODULE_LABEL[module]}
                    {always ? (
                      <span className="text-[0.6875rem] font-normal text-muted-foreground">
                        · every login
                      </span>
                    ) : null}
                  </h4>
                  <p className="mt-0.5 text-xs leading-4 text-muted-foreground">
                    {MODULE_DESCRIPTION[module]}
                  </p>
                </div>
                {own.length && !disabled ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="shrink-0 px-2 text-xs"
                    onClick={() => setAll(module, granted < own.length)}
                  >
                    {granted < own.length ? "All" : "None"}
                  </Button>
                ) : null}
              </header>
              {own.length ? (
                <ul className="divide-y divide-border/70 border-t border-border/70">
                  {own.map(action => (
                    <li key={action}>
                      <label
                        className={cn(
                          "flex items-start gap-3 px-3.5 py-2 transition-colors",
                          disabled
                            ? "cursor-default"
                            : "cursor-pointer hover:bg-surface-subtle"
                        )}
                      >
                        <Checkbox
                          className="mt-0.5"
                          checked={actions.has(action)}
                          disabled={disabled}
                          onCheckedChange={on => setAction(action, on)}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block text-[0.8125rem] text-foreground">
                            {ACTION_INFO[action].label}
                          </span>
                          {ACTION_INFO[action].hint ? (
                            <span className="mt-0.5 block text-xs leading-4 text-warning-foreground">
                              {ACTION_INFO[action].hint}
                            </span>
                          ) : null}
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="border-t border-border/70 px-3.5 py-2 text-xs text-muted-foreground">
                  View only — no actions to grant.
                </p>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
