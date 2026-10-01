"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";

import {
  History,
  Plus,
  ShieldCheck,
  Trash2,
  UserCheck,
  UserGear,
  UsersThree,
} from "@/components/icons";
import { DataTable, type Column } from "@/components/shared/data-table";
import {
  ErrorBanner,
  Field,
  FormSection,
  PageHeader,
  PageShell,
  Panel,
  PanelRowsSkeleton,
  SelectField,
  StatCard,
} from "@/components/shared/page";
import { Button } from "@/components/ui/button";
import { CategorySwitcher } from "@/components/ui/category-switcher";
import { Checkbox } from "@/components/ui/checkbox";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { FormDialog } from "@/components/ui/form-dialog";
import { Input } from "@/components/ui/input";
import { SearchInput } from "@/components/ui/search-input";
import { Tag } from "@/components/ui/tag";
import { Textarea } from "@/components/ui/textarea";
import {
  useAccessAudit,
  useAdminRoles,
  useAdminUsers,
  type LoginRow,
  type RoleRow,
} from "@/features/admin/api";
import {
  PermissionsEditor,
  type Grants,
} from "@/features/admin/permissions-editor";
import { useAction } from "@/lib/api/client";
import { formatDateTime } from "@/lib/format";
import {
  DEFAULT_ROLES,
  LANDING_PAGES,
  MODULE_LABEL,
  normaliseGrants,
  type Module,
} from "@/lib/rbac";
import { useSession } from "@/lib/session";
import type { SystemRole, UserStatus } from "@/lib/sim/schema";

type TabValue = "users" | "roles" | "audit";

export default function UserManagementPage() {
  return (
    <React.Suspense>
      <UserManagement />
    </React.Suspense>
  );
}

/**
 * Administration → User management: every login, role and permission in the
 * hospital. It feeds the sign-in screen and the access checks directly, so a
 * change here applies at once — to the sign-in screen and to anyone who is
 * signed in.
 */
function UserManagement() {
  const params = useSearchParams();
  const router = useRouter();
  const { can } = useSession();
  const canManage = can("users.manage");
  const [tab, setTab] = React.useState<TabValue>(
    params.get("tab") === "roles"
      ? "roles"
      : params.get("tab") === "audit"
        ? "audit"
        : "users"
  );
  const [q, setQ] = React.useState("");
  const [roleFilter, setRoleFilter] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState("");
  const [editing, setEditing] = React.useState<string | null>(
    params.get("open")
  );
  const [creating, setCreating] = React.useState<string | null>(
    params.get("create")
  );
  const [roleDialog, setRoleDialog] = React.useState<
    { mode: "edit"; roleId: string } | { mode: "create"; from?: RoleRow } | null
  >(null);

  const users = useAdminUsers({
    q: q || undefined,
    roleId: roleFilter || undefined,
    status: statusFilter || undefined,
  });
  const roles = useAdminRoles();
  const audit = useAccessAudit(100);
  const counts = users.data?.counts;

  // Keep the address shareable without re-opening dialogs on refresh.
  React.useEffect(() => {
    if (params.get("open") || params.get("create"))
      router.replace("/admin/users", { scroll: false });
  }, [params, router]);

  const columns: Column<LoginRow>[] = [
    {
      id: "user",
      header: "User",
      sortValue: r => r.name,
      cell: r => (
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 truncate font-medium">
            {r.name}
            {r.self ? <Tag tone="progress">You</Tag> : null}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            <span className="font-mono">{r.username}</span> · {r.designation}
          </p>
        </div>
      ),
    },
    {
      id: "role",
      header: "Role",
      sortValue: r => r.roleName,
      cell: r => (
        <Tag tone={r.administrator ? "progress" : "neutral"}>{r.roleName}</Tag>
      ),
    },
    {
      id: "access",
      header: "Access",
      sortValue: r => r.actions.length,
      cell: r => (
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          {r.customAccess ? <Tag tone="pending">Custom</Tag> : null}
          <span className="tabular-nums text-muted-foreground">
            {r.modules.length} modules · {r.actions.length} actions
          </span>
        </div>
      ),
    },
    {
      id: "department",
      header: "Department",
      sortValue: r => r.department,
      cell: r => r.department,
    },
    {
      id: "job",
      header: "Job",
      sortValue: r => r.job,
      defaultHidden: true,
      cell: r => r.job,
    },
    {
      id: "status",
      header: "Status",
      sortValue: r => r.status,
      cell: r =>
        r.status === "ACTIVE" ? (
          r.staffStatus === "ACTIVE" ? (
            <Tag tone="active" dot>
              Active
            </Tag>
          ) : (
            <Tag tone="pending">
              Staff {r.staffStatus === "ON_LEAVE" ? "on leave" : "inactive"}
            </Tag>
          )
        ) : (
          <Tag tone="neutral">Disabled</Tag>
        ),
    },
    {
      id: "updated",
      header: "Last changed",
      sortValue: r => r.updatedAt,
      cell: r => (
        <span className="text-xs tabular-nums text-muted-foreground">
          {formatDateTime(r.updatedAt)}
        </span>
      ),
    },
  ];

  return (
    <PageShell>
      <PageHeader
        title="User management"
        subtitle="Logins, roles and permissions for every member of staff. The sign-in screen and every access check read from here, so changes apply at once."
        actions={
          canManage ? (
            <>
              <Button
                variant="outline"
                onClick={() => setRoleDialog({ mode: "create" })}
              >
                <ShieldCheck className="size-4" />
                New role
              </Button>
              <Button onClick={() => setCreating("")}>
                <Plus className="size-4" />
                New login
              </Button>
            </>
          ) : null
        }
      />
      <ErrorBanner error={users.error ?? roles.error} />

      <section className="grid-auto-fit-sm gap-3">
        <StatCard
          label="Active logins"
          value={counts?.active ?? 0}
          icon={UserCheck}
          loading={!counts}
          hint={`${counts?.total ?? 0} logins in all`}
        />
        <StatCard
          label="Roles"
          value={roles.data?.length ?? 0}
          icon={ShieldCheck}
          loading={!roles.data}
          hint={`${roles.data?.filter(r => !r.system).length ?? 0} created by the hospital`}
        />
        <StatCard
          label="Custom access"
          value={counts?.custom ?? 0}
          icon={UserGear}
          loading={!counts}
          tone={counts?.custom ? "info" : "neutral"}
          hint="Logins with their own permission set"
        />
        <StatCard
          label="Disabled"
          value={counts?.disabled ?? 0}
          icon={UsersThree}
          loading={!counts}
          hint={`${counts?.administrators ?? 0} active administrator${counts?.administrators === 1 ? "" : "s"}`}
        />
      </section>

      <CategorySwitcher
        label="Section"
        value={tab}
        onValueChange={setTab}
        items={[
          { value: "users", label: "Users", count: counts?.total },
          {
            value: "roles",
            label: "Roles & permissions",
            count: roles.data?.length,
          },
          { value: "audit", label: "Audit log" },
        ]}
      />

      {tab === "users" ? (
        <Panel flush>
          <DataTable
            columns={columns}
            rows={users.data?.rows ?? []}
            keyOf={r => r.id}
            isLoading={users.isLoading}
            initialSort={{ id: "role", direction: "asc" }}
            pageSize={15}
            onRowClick={r => setEditing(r.id)}
            toolbar={
              <>
                <SearchInput
                  wrapperClassName="min-w-48 flex-1"
                  placeholder="Name, login ID, email or staff ID"
                  value={q}
                  onChange={e => setQ(e.target.value)}
                />
                <SelectField
                  className="w-full sm:w-48"
                  aria-label="Role"
                  value={roleFilter}
                  onChange={e => setRoleFilter(e.target.value)}
                >
                  <option value="">All roles</option>
                  {users.data?.roles.map(r => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </SelectField>
                <SelectField
                  className="w-full sm:w-44"
                  aria-label="Status"
                  value={statusFilter}
                  onChange={e => setStatusFilter(e.target.value)}
                >
                  <option value="">All statuses</option>
                  <option value="ACTIVE">Active</option>
                  <option value="DISABLED">Disabled</option>
                  <option value="CUSTOM">Custom access</option>
                </SelectField>
              </>
            }
          />
        </Panel>
      ) : null}

      {tab === "roles" ? (
        <RolesGrid
          roles={roles.data}
          canManage={canManage}
          onOpen={roleId => setRoleDialog({ mode: "edit", roleId })}
        />
      ) : null}

      {tab === "audit" ? (
        <Panel
          title="Access changes"
          description="Logins and roles created, changed or deleted — newest first."
        >
          {!audit.data ? (
            <PanelRowsSkeleton rows={6} />
          ) : audit.data.length ? (
            <ol className="divide-y divide-border">
              {audit.data.map(event => (
                <li
                  key={event.id}
                  className="flex items-start gap-3 py-2.5 first:pt-0 last:pb-0"
                >
                  <History className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[0.8125rem] text-foreground">
                      {event.summary}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {event.actor} · {formatDateTime(event.at)}
                    </p>
                  </div>
                  <Tag tone={event.kind === "role" ? "progress" : "neutral"}>
                    {event.kind === "role" ? "Role" : "Login"} {event.action}
                  </Tag>
                </li>
              ))}
            </ol>
          ) : (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No access changes yet. Everything done here is recorded.
            </p>
          )}
        </Panel>
      ) : null}

      <LoginDialog
        key={`edit-${editing ?? ""}`}
        login={users.data?.rows.find(r => r.id === editing) ?? null}
        open={Boolean(editing)}
        onOpenChange={open => !open && setEditing(null)}
        roles={roles.data ?? []}
        canManage={canManage}
      />
      <CreateLoginDialog
        key={`create-${creating ?? "closed"}`}
        open={creating !== null}
        initialStaffId={creating || undefined}
        onOpenChange={open => !open && setCreating(null)}
        staff={users.data?.staffWithoutLogin ?? []}
        roles={roles.data ?? []}
        onCreated={id => {
          setCreating(null);
          setEditing(id);
        }}
      />
      <RoleDialog
        key={
          roleDialog?.mode === "edit"
            ? `role-${roleDialog.roleId}`
            : `role-new-${roleDialog?.mode === "create" ? (roleDialog.from?.id ?? "blank") : "closed"}`
        }
        state={roleDialog}
        roles={roles.data ?? []}
        canManage={canManage}
        onClose={() => setRoleDialog(null)}
        onDuplicate={from => setRoleDialog({ mode: "create", from })}
      />
    </PageShell>
  );
}

/* ------------------------------------------------------------------ */
/* Roles                                                               */
/* ------------------------------------------------------------------ */

function RolesGrid({
  roles,
  canManage,
  onOpen,
}: {
  roles: RoleRow[] | undefined;
  canManage: boolean;
  onOpen: (roleId: string) => void;
}) {
  if (!roles)
    return (
      <Panel>
        <PanelRowsSkeleton rows={6} />
      </Panel>
    );
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {roles.map(role => {
        const landing = LANDING_PAGES.find(p => p.path === role.homePath);
        return (
          <button
            key={role.id}
            type="button"
            onClick={() => onOpen(role.id)}
            className="group flex min-w-0 flex-col rounded-xl border border-border bg-card p-4 text-left shadow-xs outline-none transition-[border-color,box-shadow] hover:border-border-strong hover:shadow-sm focus-visible:ring-2 focus-visible:ring-ring/30"
          >
            <div className="flex w-full items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-foreground">
                  {role.name}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {role.activeMembers} active login
                  {role.activeMembers === 1 ? "" : "s"}
                  {role.members > role.activeMembers
                    ? ` · ${role.members - role.activeMembers} disabled`
                    : ""}
                </p>
              </div>
              <Tag
                tone={
                  role.administrator
                    ? "progress"
                    : role.system
                      ? "neutral"
                      : "active"
                }
              >
                {role.administrator
                  ? "Full access"
                  : role.system
                    ? "Default"
                    : "Custom"}
              </Tag>
            </div>
            <p className="mt-2 line-clamp-2 text-xs leading-4 text-muted-foreground">
              {role.description || "No description."}
            </p>
            <div className="mt-3 flex flex-wrap gap-1">
              {role.modules
                .filter(m => m !== "dashboard")
                .slice(0, 6)
                .map(m => (
                  <span
                    key={m}
                    className="rounded-md border border-border bg-surface-subtle px-1.5 py-0.5 text-[0.6875rem] text-text-secondary"
                  >
                    {MODULE_LABEL[m]}
                  </span>
                ))}
              {role.modules.length > 7 ? (
                <span className="px-1 py-0.5 text-[0.6875rem] text-muted-foreground">
                  +{role.modules.length - 7}
                </span>
              ) : null}
            </div>
            <p className="mt-auto pt-3 text-[0.6875rem] text-muted-foreground">
              {role.actions.length} actions · lands on{" "}
              {landing?.label ?? role.homePath}
              {canManage ? (
                <span className="ml-1 font-medium text-primary opacity-0 transition-opacity group-hover:opacity-100">
                  · Edit
                </span>
              ) : null}
            </p>
          </button>
        );
      })}
    </div>
  );
}

function RoleDialog({
  state,
  roles,
  canManage,
  onClose,
  onDuplicate,
}: {
  state:
    | { mode: "edit"; roleId: string }
    | { mode: "create"; from?: RoleRow }
    | null;
  roles: RoleRow[];
  canManage: boolean;
  onClose: () => void;
  onDuplicate: (from: RoleRow) => void;
}) {
  const role =
    state?.mode === "edit" ? roles.find(r => r.id === state.roleId) : undefined;
  const from = state?.mode === "create" ? state.from : undefined;
  const source = role ?? from;
  const [name, setName] = React.useState(
    role?.name ?? (from ? `${from.name} (copy)` : "")
  );
  const [description, setDescription] = React.useState(
    source?.description ?? ""
  );
  const [grants, setGrants] = React.useState<Grants>(
    source
      ? { modules: source.modules, actions: source.actions }
      : normaliseGrants([], [])
  );
  const [homePath, setHomePath] = React.useState(source?.homePath ?? "/");
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const locked = Boolean(role?.administrator);
  const readOnly = !canManage;

  const landingPages = LANDING_PAGES.filter(p =>
    grants.modules.includes(p.module)
  );
  const home = landingPages.some(p => p.path === homePath)
    ? homePath
    : (landingPages[0]?.path ?? "/");

  const save = useAction(
    role ? "admin.updateRole" : "admin.createRole",
    () =>
      role
        ? {
            roleId: role.id,
            ...(locked ? {} : { name }),
            description,
            ...(locked ? {} : grants),
            homePath: home,
          }
        : { name, description, ...grants, homePath: home },
    {
      success: r => (role ? `${r.name} saved` : `${r.name} created`),
      onSuccess: onClose,
    }
  );
  const remove = useAction("admin.deleteRole", () => ({ roleId: role!.id }), {
    success: "Role deleted",
    onSuccess: onClose,
  });

  const defaults =
    role?.system && !locked ? DEFAULT_ROLES[role.id as SystemRole] : undefined;

  return (
    <>
      <FormDialog
        open={Boolean(state)}
        onOpenChange={open => !open && onClose()}
        title={
          role ? `Role · ${role.name}` : from ? "Duplicate role" : "New role"
        }
        description={
          locked
            ? "The Administrator role always has full access, so it can never lock the hospital out. Its description and landing page can change."
            : role
              ? `${role.members} login${role.members === 1 ? "" : "s"} use${role.members === 1 ? "s" : ""} this role${role.customMembers ? ` (${role.customMembers} with custom access, unaffected)` : ""}. Changes apply to them immediately.`
              : "Pick what members can open and do. Logins get this role from the Users tab."
        }
        size="xl"
        submitLabel={role ? "Save role" : "Create role"}
        isSubmitting={save.isPending}
        submitDisabled={readOnly || !name.trim()}
        onSubmit={event => {
          event.preventDefault();
          save.mutate();
        }}
        bodyClassName="gap-5"
        footerStart={
          role && canManage ? (
            <div className="flex flex-wrap gap-2">
              {!locked ? (
                <Button
                  type="button"
                  variant="ghost"
                  className="text-error-foreground"
                  onClick={() => setConfirmDelete(true)}
                >
                  <Trash2 className="size-4" />
                  Delete
                </Button>
              ) : null}
              <Button
                type="button"
                variant="outline"
                onClick={() => onDuplicate(role)}
              >
                Duplicate
              </Button>
              {defaults ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setDescription(defaults.description);
                    setGrants({
                      modules: defaults.modules,
                      actions: defaults.actions,
                    });
                    setHomePath(defaults.homePath);
                  }}
                >
                  Restore defaults
                </Button>
              ) : null}
            </div>
          ) : undefined
        }
      >
        <FormSection title="Role">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Name" required>
              <Input
                value={name}
                maxLength={48}
                disabled={locked || readOnly}
                onChange={e => setName(e.target.value)}
                placeholder="e.g. Pharmacy Cashier"
              />
            </Field>
            <Field
              label="Lands on"
              hint="The page members see after signing in."
            >
              <SelectField
                value={home}
                disabled={readOnly}
                onChange={e => setHomePath(e.target.value)}
              >
                {landingPages.map(p => (
                  <option key={p.path} value={p.path}>
                    {p.label}
                  </option>
                ))}
              </SelectField>
            </Field>
            <Field label="Description" className="sm:col-span-2">
              <Textarea
                rows={2}
                maxLength={300}
                value={description}
                disabled={readOnly}
                onChange={e => setDescription(e.target.value)}
                placeholder="What this role is for — shown on the sign-in screen."
              />
            </Field>
          </div>
        </FormSection>
        <FormSection title="Permissions">
          <PermissionsEditor
            value={grants}
            onChange={setGrants}
            disabled={locked || readOnly}
          />
        </FormSection>
      </FormDialog>
      {role ? (
        <ConfirmationDialog
          open={confirmDelete}
          onOpenChange={setConfirmDelete}
          title={`Delete ${role.name}?`}
          description={
            role.members
              ? `${role.members} login${role.members === 1 ? " still uses" : "s still use"} this role. Move ${role.members === 1 ? "it" : "them"} to another role first.`
              : "The role disappears from the sign-in screen and User management. This cannot be undone."
          }
          confirmText="Delete role"
          variant="destructive"
          disabled={role.members > 0}
          isLoading={remove.isPending}
          onConfirm={() => remove.mutate()}
        />
      ) : null}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Logins                                                              */
/* ------------------------------------------------------------------ */

function AccessFields({
  roles,
  roleId,
  onRoleChange,
  custom,
  onCustomChange,
  grants,
  onGrantsChange,
  disabled,
}: {
  roles: RoleRow[];
  roleId: string;
  onRoleChange: (roleId: string) => void;
  custom: boolean;
  onCustomChange: (on: boolean) => void;
  grants: Grants;
  onGrantsChange: (grants: Grants) => void;
  disabled?: boolean;
}) {
  const role = roles.find(r => r.id === roleId);
  return (
    <FormSection title="Access">
      <Field label="Role" hint={role?.description}>
        <SelectField
          value={roleId}
          disabled={disabled}
          onChange={e => onRoleChange(e.target.value)}
        >
          {roles.map(r => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </SelectField>
      </Field>
      {role?.administrator ? (
        <p className="rounded-lg border border-info-border bg-info-surface px-3 py-2 text-xs text-info-foreground">
          Administrators always have full access; custom access does not apply.
        </p>
      ) : (
        <>
          <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-surface-subtle px-3 py-2.5">
            <Checkbox
              className="mt-0.5"
              checked={custom}
              disabled={disabled}
              onCheckedChange={on => {
                onCustomChange(on);
                if (on && role)
                  onGrantsChange({
                    modules: role.modules,
                    actions: role.actions,
                  });
              }}
            />
            <span>
              <span className="block text-[0.8125rem] font-medium text-foreground">
                Custom access for this login
              </span>
              <span className="block text-xs text-muted-foreground">
                Replaces the role&apos;s permissions for this login only. Role
                changes will no longer reach it.
              </span>
            </span>
          </label>
          {custom ? (
            <PermissionsEditor
              value={grants}
              onChange={onGrantsChange}
              disabled={disabled}
            />
          ) : role ? (
            <p className="text-xs text-muted-foreground">
              Uses the {role.name} role: {role.modules.length} modules,{" "}
              {role.actions.length} actions (
              {role.modules
                .filter(m => m !== "dashboard")
                .map(m => MODULE_LABEL[m as Module])
                .join(", ")}
              ).
            </p>
          ) : null}
        </>
      )}
    </FormSection>
  );
}

function LoginDialog({
  login,
  open,
  onOpenChange,
  roles,
  canManage,
}: {
  login: LoginRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  roles: RoleRow[];
  canManage: boolean;
}) {
  const [username, setUsername] = React.useState(login?.username ?? "");
  const [roleId, setRoleId] = React.useState(login?.roleId ?? "");
  const [status, setStatus] = React.useState<UserStatus>(
    login?.status ?? "ACTIVE"
  );
  const [custom, setCustom] = React.useState(login?.customAccess ?? false);
  const [grants, setGrants] = React.useState<Grants>(
    login?.customAccess
      ? normaliseGrants(login.customModules, login.customActions)
      : normaliseGrants([], [])
  );
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  // Fill the form once the row arrives (deep links open before data loads).
  const seeded = React.useRef(Boolean(login));
  React.useEffect(() => {
    if (!login || seeded.current) return;
    seeded.current = true;
    setUsername(login.username);
    setRoleId(login.roleId);
    setStatus(login.status);
    setCustom(login.customAccess);
    if (login.customAccess)
      setGrants(normaliseGrants(login.customModules, login.customActions));
  }, [login]);

  const save = useAction(
    "admin.updateUser",
    () => ({
      userId: login!.id,
      username,
      roleId,
      status,
      customAccess: custom,
      ...(custom ? grants : {}),
    }),
    {
      success: u => `${u.username} saved`,
      onSuccess: () => onOpenChange(false),
    }
  );
  const remove = useAction("admin.deleteUser", () => ({ userId: login!.id }), {
    success: "Login deleted — the staff record and its history stay",
    onSuccess: () => onOpenChange(false),
  });
  const readOnly = !canManage;

  return (
    <>
      <FormDialog
        open={open && Boolean(login)}
        onOpenChange={onOpenChange}
        title={login ? login.name : "Login"}
        description={
          login
            ? `${login.designation} · ${login.department} · ${login.staffCode}${login.self ? " · your own login" : ""}`
            : undefined
        }
        size="xl"
        submitLabel="Save login"
        isSubmitting={save.isPending}
        submitDisabled={readOnly || !username.trim()}
        onSubmit={event => {
          event.preventDefault();
          save.mutate();
        }}
        bodyClassName="gap-5"
        footerStart={
          canManage && login && !login.self ? (
            <Button
              type="button"
              variant="ghost"
              className="text-error-foreground"
              onClick={() => setConfirmDelete(true)}
            >
              <Trash2 className="size-4" />
              Delete login
            </Button>
          ) : undefined
        }
      >
        <FormSection title="Login">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              label="Login ID"
              required
              hint="Shown on the sign-in screen. Lowercase letters, digits, dots, dashes."
            >
              <Input
                value={username}
                maxLength={32}
                disabled={readOnly}
                onChange={e => setUsername(e.target.value.toLowerCase())}
                className="font-mono"
              />
            </Field>
            <Field
              label="Status"
              hint={
                status === "DISABLED"
                  ? "Cannot sign in; its history stays attributed."
                  : "Can sign in."
              }
            >
              <SelectField
                value={status}
                disabled={readOnly || login?.self}
                onChange={e => setStatus(e.target.value as UserStatus)}
              >
                <option value="ACTIVE">Active</option>
                <option value="DISABLED">Disabled</option>
              </SelectField>
            </Field>
          </div>
          {login ? (
            <p className="text-xs text-muted-foreground">
              {login.email} · job: {login.job}
              {login.staffStatus !== "ACTIVE"
                ? ` · staff record ${login.staffStatus === "ON_LEAVE" ? "on leave" : "inactive"} (changed in WFM)`
                : ""}
            </p>
          ) : null}
        </FormSection>
        <AccessFields
          roles={roles}
          roleId={roleId}
          onRoleChange={setRoleId}
          custom={custom}
          onCustomChange={setCustom}
          grants={grants}
          onGrantsChange={setGrants}
          disabled={readOnly}
        />
      </FormDialog>
      {login ? (
        <ConfirmationDialog
          open={confirmDelete}
          onOpenChange={setConfirmDelete}
          title={`Delete ${login.username}?`}
          description={`${login.name} will no longer be able to sign in. Their staff record and everything they recorded stay; you can give them a new login later.`}
          confirmText="Delete login"
          variant="destructive"
          isLoading={remove.isPending}
          onConfirm={() => remove.mutate()}
        />
      ) : null}
    </>
  );
}

function CreateLoginDialog({
  open,
  initialStaffId,
  onOpenChange,
  staff,
  roles,
  onCreated,
}: {
  open: boolean;
  initialStaffId?: string;
  onOpenChange: (open: boolean) => void;
  staff: Array<{
    id: string;
    name: string;
    designation: string;
    department: string;
    job: string;
    suggestedRoleId?: string;
    suggestedUsername: string;
  }>;
  roles: RoleRow[];
  onCreated: (userId: string) => void;
}) {
  const [staffId, setStaffId] = React.useState(initialStaffId ?? "");
  const person = staff.find(s => s.id === staffId);
  const [username, setUsername] = React.useState("");
  const [roleId, setRoleId] = React.useState("");
  const [status, setStatus] = React.useState<UserStatus>("ACTIVE");
  const [custom, setCustom] = React.useState(false);
  const [grants, setGrants] = React.useState<Grants>(normaliseGrants([], []));
  // Suggest a login ID and the job's default role when a person is chosen…
  const suggest = (next: (typeof staff)[number] | undefined) => {
    if (!next) return;
    setUsername(next.suggestedUsername);
    if (next.suggestedRoleId) setRoleId(next.suggestedRoleId);
  };
  // …and for a deep-linked one once the list arrives — only into blanks, so
  // a background refresh never overwrites what the administrator typed.
  React.useEffect(() => {
    if (!person) return;
    setUsername(current => current || person.suggestedUsername);
    if (person.suggestedRoleId)
      setRoleId(current => current || person.suggestedRoleId!);
  }, [person]);
  const role = roleId || roles.find(r => !r.administrator)?.id || "";

  const save = useAction(
    "admin.createUser",
    () => ({
      staffId,
      roleId: role,
      username,
      status,
      customAccess: custom,
      ...(custom ? grants : {}),
    }),
    {
      success: u => `Login ${u.username} created`,
      onSuccess: u => onCreated(u.id),
    }
  );

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="New login"
      description="Give a member of staff a login. People are added to the staff master in WFM; each has at most one login."
      size="xl"
      submitLabel="Create login"
      isSubmitting={save.isPending}
      submitDisabled={!staffId || !username.trim() || !role}
      onSubmit={event => {
        event.preventDefault();
        save.mutate();
      }}
      bodyClassName="gap-5"
    >
      <FormSection title="Login">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field
            label="Staff member"
            required
            className="sm:col-span-2"
            hint={
              staff.length
                ? person
                  ? `${person.designation} · ${person.department} · job: ${person.job}`
                  : `${staff.length} active staff have no login yet.`
                : "Every active member of staff already has a login."
            }
          >
            <SelectField
              value={staffId}
              onChange={e => {
                setStaffId(e.target.value);
                suggest(staff.find(s => s.id === e.target.value));
              }}
            >
              <option value="">Choose…</option>
              {staff.map(s => (
                <option key={s.id} value={s.id}>
                  {s.name} — {s.designation}
                </option>
              ))}
            </SelectField>
          </Field>
          <Field label="Login ID" required>
            <Input
              value={username}
              maxLength={32}
              onChange={e => setUsername(e.target.value.toLowerCase())}
              className="font-mono"
              placeholder="first.last"
            />
          </Field>
          <Field label="Status">
            <SelectField
              value={status}
              onChange={e => setStatus(e.target.value as UserStatus)}
            >
              <option value="ACTIVE">Active</option>
              <option value="DISABLED">Disabled</option>
            </SelectField>
          </Field>
        </div>
      </FormSection>
      <AccessFields
        roles={roles}
        roleId={role}
        onRoleChange={setRoleId}
        custom={custom}
        onCustomChange={setCustom}
        grants={grants}
        onGrantsChange={setGrants}
      />
    </FormDialog>
  );
}
