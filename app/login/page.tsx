"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { ArrowRight, Check, Info, Lock, RefreshCw } from "@/components/icons";
import { LogoPlaceholder } from "@/components/layout/logo-placeholder";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tag } from "@/components/ui/tag";
import { useView } from "@/lib/api/client";
import { staffName } from "@/lib/api/lookup";
import { initials } from "@/lib/format";
import { MODULE_ICON } from "@/lib/navigation";
import { ACTION_INFO, LANDING_PAGES, MODULE_LABEL } from "@/lib/rbac";
import { useSession } from "@/lib/session";
import { errorMessage, toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import type { DirectoryRole, DirectoryUser } from "@/lib/views/system";

/** "Dr Meera" for doctors, the first name for everyone else. */
const shortName = (name: string) =>
  name.startsWith("Dr ")
    ? name.split(" ").slice(0, 2).join(" ")
    : (name.split(" ")[0] ?? name);

/**
 * Simulation sign-in: choose a role, then one of its logins. Roles, logins
 * and permissions come straight from Administration → User management, so
 * whatever an Administrator changes shows here at once.
 */
export default function LoginPage() {
  const router = useRouter();
  const { signIn, user, staff, role: current, home } = useSession();
  const directory = useView("session.directory", {});
  const roles = directory.data ?? [];
  const [roleId, setRoleId] = React.useState<string | null>(null);
  const [chosen, setChosen] = React.useState<Record<string, string>>({});
  const [busy, setBusy] = React.useState(false);

  const role =
    roles.find(r => r.id === roleId) ??
    roles.find(r => r.id === user?.roleId && r.users.length) ??
    roles.find(r => r.users.length) ??
    roles[0];
  const people = role?.users ?? [];
  const selectedId = (role && chosen[role.id]) ?? people[0]?.userId ?? "";
  const selected = people.find(p => p.userId === selectedId);

  const enter = async (userId: string) => {
    if (!userId || busy) return;
    setBusy(true);
    try {
      const session = await signIn(userId);
      router.push(session.home);
    } catch (error) {
      toast.error(error, "Could not sign in");
      setBusy(false);
    }
  };

  return (
    <div className="min-h-svh bg-background">
      <div className="mx-auto grid min-h-svh w-full max-w-[96rem] gap-6 p-4 sm:p-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <main className="flex min-w-0 flex-col">
          <header className="flex items-center justify-between gap-3">
            <LogoPlaceholder />
            <Tag tone="neutral">Simulation · fictional data</Tag>
          </header>

          <div className="my-auto w-full py-10">
            <div className="mx-auto w-full max-w-[25rem]">
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-primary">
                HIMS Simulation
              </p>
              <h1 className="mt-2 font-display text-2xl font-bold tracking-tight text-foreground">
                Sign in
              </h1>
              <p className="mt-1.5 text-[0.8125rem] leading-5 text-muted-foreground">
                Choose a role, then a login. Every role works on the same live
                hospital; its screens and actions follow its permissions.
              </p>

              {user && staff && current ? (
                <div className="mt-5 flex items-start gap-2.5 rounded-lg border border-border bg-surface px-3 py-2.5 text-xs leading-5 text-muted-foreground">
                  <Info className="mt-0.5 size-4 shrink-0 text-info-foreground" />
                  <p>
                    Signed in as{" "}
                    <span className="font-medium text-foreground">
                      {staffName(staff)}
                    </span>{" "}
                    ({current.name}).{" "}
                    <Link
                      href={home}
                      className="font-medium text-primary underline-offset-2 hover:underline"
                    >
                      Continue
                    </Link>{" "}
                    or pick another login to switch.
                  </p>
                </div>
              ) : null}

              {directory.error ? (
                <div className="mt-6 rounded-lg border border-error-border bg-error-surface p-4 text-sm">
                  <p className="font-medium text-error-foreground">
                    The sign-in directory could not be loaded
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {errorMessage(directory.error)}
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-3"
                    onClick={() => void directory.refetch()}
                  >
                    <RefreshCw className="size-4" />
                    Try again
                  </Button>
                </div>
              ) : !directory.data ? (
                <div className="mt-6 space-y-4" aria-busy>
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-44 w-full" />
                  <Skeleton className="h-10 w-full" />
                </div>
              ) : (
                <form
                  className="mt-6 space-y-5"
                  onSubmit={event => {
                    event.preventDefault();
                    void enter(selectedId);
                  }}
                >
                  <div className="space-y-1.5">
                    <label
                      htmlFor="login-role"
                      className="block text-xs font-medium text-foreground"
                    >
                      Role
                    </label>
                    <Select
                      value={role?.id}
                      onValueChange={value => setRoleId(value)}
                    >
                      <SelectTrigger
                        id="login-role"
                        size="lg"
                        aria-label="Role"
                      >
                        <SelectValue placeholder="Choose a role" />
                      </SelectTrigger>
                      <SelectContent>
                        {roles.map(r => (
                          <SelectItem
                            key={r.id}
                            value={r.id}
                            disabled={!r.users.length}
                          >
                            {r.name}
                            <span className="ml-2 text-xs text-muted-foreground">
                              {r.users.length
                                ? `${r.users.length} login${r.users.length === 1 ? "" : "s"}`
                                : "no active logins"}
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {role ? (
                      <p className="text-xs leading-4 text-muted-foreground lg:hidden">
                        {role.description}
                      </p>
                    ) : null}
                  </div>

                  <fieldset className="min-w-0 space-y-1.5">
                    <legend className="mb-1.5 text-xs font-medium text-foreground">
                      Login
                    </legend>
                    <div
                      role="radiogroup"
                      aria-label="Login"
                      className="max-h-[17rem] space-y-0.5 overflow-y-auto rounded-xl border border-border bg-surface p-1 shadow-xs"
                    >
                      {people.map(person => (
                        <LoginOption
                          key={person.userId}
                          person={person}
                          checked={person.userId === selectedId}
                          onSelect={() =>
                            role &&
                            setChosen(c => ({ ...c, [role.id]: person.userId }))
                          }
                          onEnter={() => void enter(person.userId)}
                        />
                      ))}
                      {!people.length ? (
                        <p className="px-3 py-6 text-center text-xs leading-5 text-muted-foreground">
                          No active logins in this role. An Administrator can
                          add one in User management.
                        </p>
                      ) : null}
                    </div>
                  </fieldset>

                  <Button
                    type="submit"
                    variant="raised"
                    size="lg"
                    className="w-full"
                    disabled={!selected || busy}
                  >
                    {busy
                      ? "Signing in…"
                      : selected
                        ? `Sign in as ${shortName(selected.name)}`
                        : "Sign in"}
                    <ArrowRight className="size-4" />
                  </Button>
                </form>
              )}

              <p className="mt-5 flex items-start gap-2 text-xs leading-5 text-muted-foreground">
                <Lock className="mt-0.5 size-3.5 shrink-0" />
                No password in the simulation. Roles, logins and permissions are
                managed by Administrators in Administration → User management.
              </p>
            </div>
          </div>

          <footer className="text-[0.6875rem] text-text-tertiary">
            HIMS Simulation · every name, patient and figure is fictional.
          </footer>
        </main>

        <RolePreview role={role} person={selected} />
      </div>
    </div>
  );
}

function LoginOption({
  person,
  checked,
  onSelect,
  onEnter,
}: {
  person: DirectoryUser;
  checked: boolean;
  onSelect: () => void;
  onEnter: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      onClick={onSelect}
      onDoubleClick={onEnter}
      className={cn(
        "flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/30",
        checked ? "bg-primary-surface" : "hover:bg-surface-subtle"
      )}
    >
      <span
        aria-hidden
        className={cn(
          "grid size-8 shrink-0 place-items-center rounded-full text-[0.6875rem] font-semibold",
          checked
            ? "bg-primary text-primary-foreground"
            : "bg-surface-secondary text-text-secondary"
        )}
      >
        {initials(person.name)}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="truncate text-[0.8125rem] font-medium text-foreground">
            {person.name}
          </span>
          {person.customAccess ? (
            <Tag tone="pending" className="shrink-0">
              Custom access
            </Tag>
          ) : null}
        </span>
        <span className="block truncate text-xs text-muted-foreground">
          {person.detail}
        </span>
      </span>
      <span className="hidden shrink-0 font-mono text-[0.6875rem] text-text-tertiary sm:block">
        {person.username}
      </span>
      <Check
        aria-hidden
        className={cn(
          "size-4 shrink-0 text-primary",
          checked ? "opacity-100" : "opacity-0"
        )}
      />
    </button>
  );
}

/** What the chosen role can open and do — straight from its permissions. */
function RolePreview({
  role,
  person,
}: {
  role: DirectoryRole | undefined;
  person: DirectoryUser | undefined;
}) {
  const landing = LANDING_PAGES.find(p => p.path === role?.home);
  const shown = role?.actions.slice(0, 10) ?? [];
  return (
    <aside
      aria-label="Role preview"
      className="hidden min-h-[36rem] rounded-2xl border border-border bg-surface lg:flex lg:flex-col"
    >
      {role ? (
        <div className="flex flex-1 flex-col p-8 xl:p-12">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              What this login sees
            </p>
            <Tag tone={role.system ? "neutral" : "progress"}>
              {role.system ? "Default role" : "Custom role"}
            </Tag>
          </div>
          <h2 className="mt-3 font-display text-3xl font-bold tracking-tight text-foreground">
            {role.name}
          </h2>
          <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
            {role.description}
          </p>

          <dl className="mt-7 grid max-w-lg grid-cols-3 gap-3">
            {[
              ["Modules", role.modules.length],
              ["Actions", role.actions.length],
              ["Active logins", role.users.length],
            ].map(([label, value]) => (
              <div
                key={label}
                className="rounded-xl border border-border bg-surface-subtle px-4 py-3"
              >
                <dt className="text-[0.6875rem] font-medium text-muted-foreground">
                  {label}
                </dt>
                <dd className="mt-0.5 font-display text-xl font-bold tabular-nums text-foreground">
                  {value}
                </dd>
              </div>
            ))}
          </dl>

          <section className="mt-8">
            <h3 className="text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              Opens
            </h3>
            <ul className="mt-3 flex max-w-2xl flex-wrap gap-2">
              {role.modules.map(module => {
                const Icon = MODULE_ICON.get(module);
                return (
                  <li
                    key={module}
                    className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-2.5 py-1 text-xs font-medium text-foreground shadow-xs"
                  >
                    {Icon ? <Icon className="size-3.5 text-primary" /> : null}
                    {MODULE_LABEL[module]}
                  </li>
                );
              })}
            </ul>
          </section>

          <section className="mt-7">
            <h3 className="text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              Can
            </h3>
            {shown.length ? (
              <ul className="mt-3 grid max-w-2xl gap-x-6 gap-y-2 xl:grid-cols-2">
                {shown.map(action => (
                  <li
                    key={action}
                    className="flex items-start gap-2 text-[0.8125rem] leading-5 text-foreground"
                  >
                    <Check className="mt-0.5 size-3.5 shrink-0 text-success-foreground" />
                    {ACTION_INFO[action].label}
                  </li>
                ))}
                {role.actions.length > shown.length ? (
                  <li className="text-xs leading-5 text-muted-foreground">
                    and {role.actions.length - shown.length} more
                  </li>
                ) : null}
              </ul>
            ) : (
              <p className="mt-3 text-[0.8125rem] text-muted-foreground">
                View only — this role reads records but changes nothing.
              </p>
            )}
          </section>

          <div className="mt-auto space-y-3 pt-8">
            {person?.customAccess ? (
              <p className="max-w-xl rounded-lg border border-warning-border bg-warning-surface px-3 py-2 text-xs leading-5 text-warning-foreground">
                {person.name} has custom access — their permissions differ from
                the role&apos;s and are set in User management.
              </p>
            ) : null}
            <p className="text-xs text-muted-foreground">
              Lands on{" "}
              <span className="font-medium text-foreground">
                {landing?.label ?? "Dashboard"}
              </span>{" "}
              after signing in.
            </p>
          </div>
        </div>
      ) : (
        <div className="m-auto text-sm text-muted-foreground">
          Loading roles…
        </div>
      )}
    </aside>
  );
}
