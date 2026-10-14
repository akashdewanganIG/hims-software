"use client";

import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

import {
  AlertCircle,
  Archive,
  Bell,
  CheckCheck,
  CheckCircle2,
  Clock,
  Info,
  Plus,
  RotateCcw,
} from "@/components/icons";
import { DataTable, type Column } from "@/components/shared/data-table";
import {
  ErrorBanner,
  Field,
  PageHeader,
  PageShell,
  Panel,
  SelectField,
  StatCard,
} from "@/components/shared/page";
import { Button } from "@/components/ui/button";
import { CategorySwitcher } from "@/components/ui/category-switcher";
import { Checkbox } from "@/components/ui/checkbox";
import { useConfirm } from "@/components/ui/confirm-provider";
import { FormDialog } from "@/components/ui/form-dialog";
import { Input } from "@/components/ui/input";
import { SearchInput } from "@/components/ui/search-input";
import {
  SEVERITY_ICON,
  SEVERITY_ROW,
  SEVERITY_TEXT,
  type Severity,
} from "@/components/ui/severity";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tag, type TagTone } from "@/components/ui/tag";
import { Textarea } from "@/components/ui/textarea";
import {
  useAlertComposer,
  useAlerts,
  useAlertSummary,
  type AlertRow,
} from "@/features/alerts/api";
import { useAction } from "@/lib/api/client";
import { formatDateTime } from "@/lib/format";
import { useSession } from "@/lib/session";
import { cn } from "@/lib/utils";

const PRIORITY_TONE: Record<string, TagTone> = {
  LOW: "neutral",
  MEDIUM: "progress",
  HIGH: "pending",
  CRITICAL: "danger",
};

/** Rows wear the Operations severity colours; low priority stays plain. */
const PRIORITY_SEVERITY: Record<string, Severity | undefined> = {
  CRITICAL: "critical",
  HIGH: "warning",
  MEDIUM: "info",
};

const STATE_TONE: Record<string, TagTone> = {
  OPEN: "progress",
  RESOLVED: "active",
  ARCHIVED: "neutral",
};

function dateTimeLocalValue(date: Date) {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

const EMPTY_COMPOSER = {
  audience: "ALL" as "ALL" | "DEPARTMENT" | "ROLE" | "ROLE_STAFF",
  roleId: "",
  audienceId: "",
  category: "General",
  customCategory: "",
  subject: "",
  message: "",
  priority: "MEDIUM" as "LOW" | "MEDIUM" | "HIGH" | "CRITICAL",
  acknowledgementRequired: false,
  dueAt: "",
  escalationRoleId: "",
  escalationRecipientId: "",
};

export default function AlertsPage() {
  const searchParams = useSearchParams();
  const { staff: signedInStaff } = useSession();
  const confirm = useConfirm();
  const [box, setBox] = React.useState<"inbox" | "sent">(
    searchParams.get("box") === "sent" ? "sent" : "inbox"
  );
  const [q, setQ] = React.useState("");
  const [category, setCategory] = React.useState("");
  const [priority, setPriority] = React.useState("");
  const [unreadOnly, setUnreadOnly] = React.useState(false);
  const [status, setStatus] = React.useState<
    "OPEN" | "RESOLVED" | "ARCHIVED" | ""
  >("OPEN");
  const [selected, setSelected] = React.useState<AlertRow | null>(null);
  const [composeOpen, setComposeOpen] = React.useState(false);
  const [form, setForm] = React.useState(EMPTY_COMPOSER);
  const {
    data: rows = [],
    isLoading,
    error,
  } = useAlerts({
    box,
    q: q || undefined,
    category: category || undefined,
    priority: priority || undefined,
    unreadOnly: box === "inbox" ? unreadOnly : undefined,
    status: status || undefined,
  });
  const { data: summary } = useAlertSummary();
  const { data: composer } = useAlertComposer();
  const requestedAlertId = searchParams.get("alert");
  const openedFromUrl = React.useRef<string | null>(null);

  const markRead = useAction("alerts.markRead", (alertId: string) => ({
    alertId,
  }));
  const acknowledge = useAction(
    "alerts.acknowledge",
    (alertId: string) => ({ alertId }),
    {
      success: "Alert acknowledged",
      onSuccess: result => {
        const acknowledgement = result.acknowledgements.at(-1);
        setSelected(current =>
          current && current.id === result.id
            ? {
                ...current,
                isRead: true,
                isAcknowledged: true,
                acknowledgedAt: acknowledgement?.acknowledgedAt,
                readCount: result.readByIds.length,
                acknowledgedCount: result.acknowledgements.length,
              }
            : current
        );
      },
    }
  );
  const changeState = useAction(
    "alerts.setState",
    (vars: { alertId: string; status: "OPEN" | "RESOLVED" | "ARCHIVED" }) =>
      vars,
    {
      success: (_result, vars) =>
        vars.status === "OPEN"
          ? "Alert reopened"
          : vars.status === "RESOLVED"
            ? "Alert resolved"
            : "Alert archived",
      onSuccess: (_result, vars) => {
        setSelected(current =>
          current && current.id === vars.alertId
            ? { ...current, status: vars.status }
            : current
        );
      },
    }
  );
  const dueTime = form.dueAt ? new Date(form.dueAt) : undefined;
  const escalationStaff =
    composer?.staff.filter(
      member =>
        member.roleId === form.escalationRoleId &&
        member.id !== signedInStaff?.id &&
        member.id !== form.audienceId
    ) ?? [];
  const escalationRecipientIsAvailable = escalationStaff.some(
    member => member.id === form.escalationRecipientId
  );
  const send = useAction(
    "alerts.send",
    () => ({
      audience: form.audience === "ROLE_STAFF" ? "STAFF" : form.audience,
      audienceId: form.audience === "ALL" ? undefined : form.audienceId,
      category:
        form.category === "__custom" ? form.customCategory : form.category,
      subject: form.subject,
      message: form.message,
      priority: form.priority,
      acknowledgementRequired: form.acknowledgementRequired,
      dueAt: dueTime?.toISOString(),
      escalationRecipientId: form.escalationRecipientId || undefined,
    }),
    {
      success: result =>
        `Alert sent to ${result.recipientIds.length} recipient${result.recipientIds.length === 1 ? "" : "s"}`,
      onSuccess: () => {
        setComposeOpen(false);
        setForm(EMPTY_COMPOSER);
        // Show it where it now lives, so it can be highlighted.
        setBox("sent");
        setStatus("OPEN");
        setUnreadOnly(false);
        setQ("");
        setCategory("");
        setPriority("");
      },
    }
  );

  const openAlert = (alert: AlertRow) => {
    setSelected(alert);
    if (box === "inbox" && !alert.isRead) markRead.mutate(alert.id);
  };

  React.useEffect(() => {
    if (
      !requestedAlertId ||
      openedFromUrl.current === requestedAlertId ||
      !rows.length
    )
      return;
    const requested = rows.find(row => row.id === requestedAlertId);
    if (!requested) return;
    openedFromUrl.current = requestedAlertId;
    setSelected(requested);
    if (box === "inbox" && !requested.isRead) markRead.mutate(requested.id);
  }, [requestedAlertId, rows, box, markRead]);

  const columns: Column<AlertRow>[] = [
    {
      id: "status",
      header: "",
      width: "w-8",
      cell: row => (
        <span
          className={cn(
            "block size-2 rounded-full",
            row.isRead || box === "sent"
              ? "bg-border-strong"
              : "bg-info shadow-[0_0_0_4px_color-mix(in_srgb,var(--info)_18%,transparent)]"
          )}
          aria-label={row.isRead ? "Read" : "Unread"}
        />
      ),
    },
    {
      id: "subject",
      header: "About",
      sortValue: row => row.subject,
      cell: row => {
        const severity = PRIORITY_SEVERITY[row.priority];
        const Icon = severity ? SEVERITY_ICON[severity] : Info;
        return (
          <div className="flex min-w-0 max-w-xl items-start gap-2.5">
            <Icon
              aria-hidden="true"
              className={cn(
                "mt-0.5 size-4 shrink-0",
                severity ? SEVERITY_TEXT[severity] : "text-muted-foreground"
              )}
            />
            <div className="min-w-0 flex-1">
              <p
                className={cn(
                  "truncate",
                  severity && SEVERITY_TEXT[severity],
                  !row.isRead && box === "inbox" && "font-semibold"
                )}
              >
                {row.subject}
              </p>
              <div className="mt-1 flex flex-wrap gap-1">
                {row.isOverdue ? <Tag tone="danger">Overdue</Tag> : null}
                {row.isEscalatedToMe ? (
                  <Tag tone="pending">Escalated</Tag>
                ) : null}
                {row.linkedAdmission ? (
                  <Tag tone="neutral">{row.linkedAdmission.code}</Tag>
                ) : null}
              </div>
              <p className="truncate text-xs text-muted-foreground">
                {row.message}
              </p>
            </div>
          </div>
        );
      },
    },
    {
      id: "mailboxState",
      header: "Status",
      sortValue: row => row.status,
      cell: row => <Tag tone={STATE_TONE[row.status]}>{row.status}</Tag>,
    },
    {
      id: "category",
      header: "Category",
      sortValue: row => row.category,
      cell: row => <Tag tone="neutral">{row.category}</Tag>,
    },
    {
      id: "priority",
      header: "Priority",
      sortValue: row => row.priority,
      cell: row => (
        <Tag tone={PRIORITY_TONE[row.priority]} dot>
          {row.priority}
        </Tag>
      ),
    },
    {
      id: "people",
      header: box === "inbox" ? "From" : "Target",
      cell: row =>
        box === "inbox" ? (
          row.sender
        ) : (
          <div className="min-w-0 max-w-56">
            <p className="truncate">{row.audienceLabel}</p>
            <p className="text-xs text-muted-foreground">
              {row.recipientCount} recipient
              {row.recipientCount === 1 ? "" : "s"}
            </p>
          </div>
        ),
    },
    {
      id: "acknowledgement",
      header: "Acknowledgement",
      cell: row =>
        !row.acknowledgementRequired ? (
          <span className="text-muted-foreground">Not required</span>
        ) : box === "sent" ? (
          <Tag
            tone={
              row.acknowledgedCount === row.recipientCount
                ? "active"
                : "pending"
            }
          >
            {row.acknowledgedCount}/{row.recipientCount}
          </Tag>
        ) : row.isAcknowledged ? (
          <Tag tone="active">Acknowledged</Tag>
        ) : (
          <Tag tone="pending">Required</Tag>
        ),
    },
    {
      id: "createdAt",
      header: "Sent",
      sortValue: row => row.createdAt,
      cell: row => (
        <span className="whitespace-nowrap text-muted-foreground">
          {formatDateTime(row.createdAt)}
        </span>
      ),
    },
  ];

  const audienceOptions =
    form.audience === "DEPARTMENT"
      ? composer?.departments
      : form.audience === "ROLE"
        ? composer?.roles
        : [];
  const roleStaff =
    composer?.staff.filter(staff => staff.roleId === form.roleId) ?? [];
  const finalCategory =
    form.category === "__custom" ? form.customCategory.trim() : form.category;
  const dueIsValid =
    !dueTime ||
    (!Number.isNaN(dueTime.getTime()) && dueTime.getTime() > Date.now());
  const escalationIsValid =
    !form.escalationRecipientId ||
    (escalationRecipientIsAvailable &&
      Boolean(dueTime) &&
      (form.priority === "HIGH" || form.priority === "CRITICAL"));
  const formValid =
    finalCategory.length >= 2 &&
    form.subject.trim().length >= 3 &&
    form.message.trim().length >= 5 &&
    (form.audience === "ALL" ||
      (form.audience === "ROLE_STAFF"
        ? Boolean(form.roleId && form.audienceId)
        : Boolean(form.audienceId))) &&
    dueIsValid &&
    escalationIsValid;

  return (
    <PageShell>
      <PageHeader
        title="Alerts"
        subtitle="Send clear, categorised updates to hospital teams and keep a searchable record of what was received."
        actions={
          <Button onClick={() => setComposeOpen(true)}>
            <Plus className="size-4" />
            Send alert
          </Button>
        }
      />
      <ErrorBanner error={error} />

      <section className="grid-auto-fit-sm gap-3" aria-label="Alert summary">
        <StatCard
          label="Unread"
          value={summary?.unread ?? 0}
          icon={Bell}
          tone={summary?.unread ? "info" : "neutral"}
          hint="Needs your review"
        />
        <StatCard
          label="Inbox"
          value={summary?.inbox ?? 0}
          icon={CheckCheck}
          tone="positive"
          hint="Alerts received"
        />
        <StatCard
          label="To acknowledge"
          value={summary?.awaitingAcknowledgement ?? 0}
          icon={CheckCircle2}
          tone={summary?.awaitingAcknowledgement ? "warning" : "neutral"}
          hint="Explicit response required"
        />
        <StatCard
          label="Critical"
          value={summary?.critical ?? 0}
          icon={AlertCircle}
          tone={summary?.critical ? "critical" : "neutral"}
          hint="Critical priority received"
        />
        <StatCard
          label="Sent"
          value={summary?.sent ?? 0}
          icon={Plus}
          hint="Alerts you created"
        />
        <StatCard
          label="Overdue sent"
          value={summary?.overdueSent ?? 0}
          icon={Clock}
          tone={summary?.overdueSent ? "warning" : "neutral"}
          hint="Waiting beyond deadline"
        />
      </section>

      <Panel flush>
        <DataTable
          columns={columns}
          rows={rows}
          keyOf={row => row.id}
          isLoading={isLoading}
          pageSize={15}
          initialSort={{ id: "createdAt", direction: "desc" }}
          empty={
            box === "inbox"
              ? "No alerts in your inbox."
              : "You have not sent any alerts."
          }
          onRowClick={openAlert}
          rowClassName={row => {
            const severity = PRIORITY_SEVERITY[row.priority];
            return severity ? SEVERITY_ROW[severity] : undefined;
          }}
          toolbar={
            <>
              <CategorySwitcher
                label="Alert mailbox"
                value={box}
                onValueChange={next => {
                  setBox(next);
                  setUnreadOnly(false);
                  setStatus("OPEN");
                }}
                items={[
                  { value: "inbox", label: "Inbox", count: summary?.unread },
                  { value: "sent", label: "Sent", count: summary?.sent },
                ]}
              />
              <SearchInput
                wrapperClassName="min-w-48 flex-1"
                placeholder="Subject, details, sender or category"
                value={q}
                onChange={event => setQ(event.target.value)}
              />
              <SelectField
                className="w-full sm:w-40"
                aria-label="Alert category"
                value={category}
                onChange={event => setCategory(event.target.value)}
              >
                <option value="">All categories</option>
                {composer?.categories.map(value => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </SelectField>
              <SelectField
                className="w-full sm:w-32"
                aria-label="Alert status"
                value={status}
                onChange={event =>
                  setStatus(
                    event.target.value as "OPEN" | "RESOLVED" | "ARCHIVED" | ""
                  )
                }
              >
                <option value="">All statuses</option>
                <option value="OPEN">Open</option>
                <option value="RESOLVED">Resolved</option>
                <option value="ARCHIVED">Archived</option>
              </SelectField>
              <SelectField
                className="w-full sm:w-32"
                aria-label="Priority"
                value={priority}
                onChange={event => setPriority(event.target.value)}
              >
                <option value="">All priorities</option>
                <option value="CRITICAL">Critical</option>
                <option value="HIGH">High</option>
                <option value="MEDIUM">Medium</option>
                <option value="LOW">Low</option>
              </SelectField>
              {box === "inbox" ? (
                <label className="flex h-9 items-center gap-2 rounded-lg border border-input bg-surface px-3 text-xs font-medium">
                  <Checkbox
                    checked={unreadOnly}
                    onCheckedChange={setUnreadOnly}
                  />
                  Unread only
                </label>
              ) : null}
            </>
          }
        />
      </Panel>

      <FormDialog
        open={composeOpen}
        onOpenChange={setComposeOpen}
        title="Send an alert"
        description="Choose exactly who needs it, label the category and subject clearly, then include the complete details."
        size="lg"
        submitLabel="Send alert"
        submitDisabled={!formValid}
        isSubmitting={send.isPending}
        onSubmit={event => {
          event.preventDefault();
          if (formValid) send.mutate();
        }}
        bodyClassName="sm:grid-cols-2"
      >
        <Field label="Send to" required>
          <SelectField
            value={form.audience}
            onChange={event =>
              setForm(current => ({
                ...current,
                audience: event.target.value as typeof current.audience,
                roleId: "",
                audienceId: "",
              }))
            }
          >
            <option value="ALL">All active staff</option>
            <option value="DEPARTMENT">A department</option>
            <option value="ROLE">Everyone in a staff role</option>
            <option value="ROLE_STAFF">One person in a staff role</option>
          </SelectField>
        </Field>
        {form.audience === "DEPARTMENT" || form.audience === "ROLE" ? (
          <Field
            label={form.audience === "DEPARTMENT" ? "Department" : "Staff role"}
            required
          >
            <SelectField
              value={form.audienceId}
              onChange={event =>
                setForm(current => ({
                  ...current,
                  audienceId: event.target.value,
                }))
              }
            >
              <option value="">Choose recipient</option>
              {audienceOptions?.map(option => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </SelectField>
          </Field>
        ) : form.audience === "ROLE_STAFF" ? (
          <div className="grid gap-3 sm:col-span-2 sm:grid-cols-2">
            <Field label="Staff role" required>
              <SelectField
                value={form.roleId}
                onChange={event =>
                  setForm(current => ({
                    ...current,
                    roleId: event.target.value,
                    audienceId: "",
                  }))
                }
              >
                <option value="">Choose a role</option>
                {composer?.roles.map(role => (
                  <option key={role.id} value={role.id}>
                    {role.label}
                  </option>
                ))}
              </SelectField>
            </Field>
            <Field label="Person in this role" required>
              <SelectField
                value={form.audienceId}
                disabled={!form.roleId}
                onChange={event =>
                  setForm(current => ({
                    ...current,
                    audienceId: event.target.value,
                  }))
                }
              >
                <option value="">
                  {form.roleId ? "Choose a person" : "Choose a role first"}
                </option>
                {roleStaff.map(staff => (
                  <option key={staff.id} value={staff.id}>
                    {staff.label}
                  </option>
                ))}
              </SelectField>
            </Field>
          </div>
        ) : (
          <div className="hidden sm:block" />
        )}
        <Field label="Category" required>
          <SelectField
            value={form.category}
            onChange={event =>
              setForm(current => ({ ...current, category: event.target.value }))
            }
          >
            {composer?.categories.map(value => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
            <option value="__custom">Add a custom category…</option>
          </SelectField>
        </Field>
        <Field label="Priority" required>
          <SelectField
            value={form.priority}
            onChange={event =>
              setForm(current => ({
                ...current,
                priority: event.target.value as typeof current.priority,
              }))
            }
          >
            <option value="LOW">Low</option>
            <option value="MEDIUM">Medium</option>
            <option value="HIGH">High</option>
            <option value="CRITICAL">Critical</option>
          </SelectField>
        </Field>
        <label className="flex items-start gap-3 rounded-xl border border-border bg-surface-subtle p-3 sm:col-span-2">
          <Checkbox
            className="mt-0.5"
            aria-label="Require acknowledgement"
            checked={form.acknowledgementRequired}
            onCheckedChange={acknowledgementRequired =>
              setForm(current => ({
                ...current,
                acknowledgementRequired,
              }))
            }
          />
          <span>
            <span className="block text-sm font-medium text-foreground">
              Require acknowledgement
            </span>
            <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">
              Each recipient must explicitly acknowledge this alert; opening it
              only marks it as read.
            </span>
          </span>
        </label>
        <Field
          label="Response deadline"
          className="sm:col-span-2"
          hint="Overdue alerts are highlighted in your Sent mailbox. Add an escalation recipient to notify another person automatically."
          error={!dueIsValid ? "Choose a future date and time." : undefined}
        >
          <Input
            type="datetime-local"
            min={dateTimeLocalValue(new Date(Date.now() + 60_000))}
            value={form.dueAt}
            onChange={event =>
              setForm(current => ({
                ...current,
                dueAt: event.target.value,
                escalationRoleId: event.target.value
                  ? current.escalationRoleId
                  : "",
                escalationRecipientId: event.target.value
                  ? current.escalationRecipientId
                  : "",
              }))
            }
          />
        </Field>
        {form.dueAt ? (
          <div className="grid gap-3 rounded-xl border border-border bg-surface-subtle p-3 sm:col-span-2 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <p className="text-sm font-medium text-foreground">
                Automatic escalation
              </p>
              <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
                For high or critical alerts, notify another staff member if the
                original recipients have not read or acknowledged the alert by
                the deadline.
              </p>
            </div>
            <Field label="Escalation role">
              <SelectField
                value={form.escalationRoleId}
                onChange={event =>
                  setForm(current => ({
                    ...current,
                    escalationRoleId: event.target.value,
                    escalationRecipientId: "",
                  }))
                }
              >
                <option value="">No automatic escalation</option>
                {composer?.roles.map(role => (
                  <option key={role.id} value={role.id}>
                    {role.label}
                  </option>
                ))}
              </SelectField>
            </Field>
            <Field label="Escalate to">
              <SelectField
                value={
                  escalationRecipientIsAvailable
                    ? form.escalationRecipientId
                    : ""
                }
                disabled={!form.escalationRoleId}
                onChange={event =>
                  setForm(current => ({
                    ...current,
                    escalationRecipientId: event.target.value,
                    priority:
                      event.target.value &&
                      current.priority !== "HIGH" &&
                      current.priority !== "CRITICAL"
                        ? "HIGH"
                        : current.priority,
                  }))
                }
              >
                <option value="">
                  {form.escalationRoleId
                    ? "Choose a person"
                    : "Choose a role first"}
                </option>
                {escalationStaff.map(member => (
                  <option key={member.id} value={member.id}>
                    {member.label}
                    {member.onDuty ? " · on duty" : ""}
                  </option>
                ))}
              </SelectField>
            </Field>
          </div>
        ) : null}
        {form.category === "__custom" ? (
          <Field label="Custom category" required className="sm:col-span-2">
            <Input
              maxLength={40}
              value={form.customCategory}
              onChange={event =>
                setForm(current => ({
                  ...current,
                  customCategory: event.target.value,
                }))
              }
              placeholder="e.g. Infection control"
            />
          </Field>
        ) : null}
        <Field
          label="What is this about?"
          required
          className="sm:col-span-2"
          hint="Use a short subject staff can understand at a glance"
        >
          <Input
            maxLength={120}
            value={form.subject}
            onChange={event =>
              setForm(current => ({ ...current, subject: event.target.value }))
            }
            placeholder="e.g. CT scanner unavailable until 3 PM"
          />
        </Field>
        <Field
          label="Complete details"
          required
          className="sm:col-span-2"
          hint="Include the action required, location, owner and timing where relevant"
        >
          <Textarea
            maxLength={2000}
            rows={6}
            value={form.message}
            onChange={event =>
              setForm(current => ({ ...current, message: event.target.value }))
            }
            placeholder="Explain what happened, who is affected, what they should do, and when the next update is expected."
          />
        </Field>
      </FormDialog>

      <Sheet
        open={Boolean(selected)}
        onOpenChange={next => !next && setSelected(null)}
      >
        <SheetContent size="md">
          {selected ? (
            <>
              <SheetHeader>
                <div className="flex flex-wrap items-center gap-2 pr-8">
                  <SheetTitle>{selected.subject}</SheetTitle>
                  <Tag tone={PRIORITY_TONE[selected.priority]} dot>
                    {selected.priority}
                  </Tag>
                  <Tag tone={STATE_TONE[selected.status]}>
                    {selected.status}
                  </Tag>
                  {selected.isOverdue ? <Tag tone="danger">Overdue</Tag> : null}
                </div>
                {selected.dueAt ? (
                  <div
                    className={cn(
                      "rounded-xl border p-3 text-sm",
                      selected.isOverdue
                        ? "border-error-border bg-error-surface text-error-foreground"
                        : "border-border bg-surface-subtle text-foreground"
                    )}
                  >
                    <p className="flex items-center gap-2 font-medium">
                      <Clock className="size-4" />
                      Response due {formatDateTime(selected.dueAt)}
                    </p>
                    <p className="mt-1 text-xs leading-5">
                      {selected.isEscalated
                        ? `Overdue and escalated to ${selected.escalationLabel}.`
                        : selected.escalationLabel
                          ? `If overdue, this alert is automatically sent to ${selected.escalationLabel}.`
                          : "If overdue, it is highlighted in the sender's Sent mailbox."}
                    </p>
                  </div>
                ) : null}
                {selected.linkedAdmission ? (
                  <div className="flex items-center justify-between gap-3 rounded-xl border border-info-border bg-info-surface p-3">
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        {selected.linkedAdmission.patientName}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {selected.linkedAdmission.code} · linked inpatient
                        record
                      </p>
                    </div>
                    <Button asChild size="sm" variant="outline">
                      <Link href={`/ipd/${selected.linkedAdmission.id}`}>
                        View admission
                      </Link>
                    </Button>
                  </div>
                ) : null}
                <SheetDescription>
                  {selected.category} · sent{" "}
                  {formatDateTime(selected.createdAt)}
                </SheetDescription>
              </SheetHeader>
              <SheetBody className="space-y-4">
                <div className="grid grid-cols-2 gap-3 rounded-xl border border-border bg-surface-subtle p-3 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground">From</p>
                    <p className="mt-0.5 font-medium">{selected.sender}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">
                      Intended target
                    </p>
                    <p className="mt-0.5 font-medium">
                      {selected.audienceLabel}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Delivery</p>
                    <p className="mt-0.5 font-medium">
                      {selected.recipientCount} staff · {selected.readCount}{" "}
                      read
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">
                      Acknowledgement
                    </p>
                    <p className="mt-0.5 font-medium">
                      {selected.acknowledgementRequired
                        ? `${selected.acknowledgedCount} of ${selected.recipientCount}`
                        : "Not required"}
                    </p>
                  </div>
                </div>
                {box === "inbox" && selected.acknowledgementRequired ? (
                  <div
                    className={cn(
                      "rounded-xl border p-3 text-sm",
                      selected.isAcknowledged
                        ? "border-success-border bg-success-surface text-success-foreground"
                        : "border-warning-border bg-warning-surface text-warning-foreground"
                    )}
                  >
                    <p className="flex items-center gap-2 font-medium">
                      <CheckCircle2 className="size-4" />
                      {selected.isAcknowledged
                        ? "Acknowledged"
                        : "Your acknowledgement is required"}
                    </p>
                    <p className="mt-1 text-xs leading-5">
                      {selected.isAcknowledged && selected.acknowledgedAt
                        ? `Acknowledged ${formatDateTime(selected.acknowledgedAt)}.`
                        : "Opening this alert marks it as read. Use the button below to explicitly confirm that you have received and understood it."}
                    </p>
                  </div>
                ) : null}
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Alert details
                  </p>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-foreground">
                    {selected.message}
                  </p>
                </div>
                {box === "sent" ? (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Sent to
                    </p>
                    <p className="mt-2 text-sm leading-6">
                      {selected.recipientNames.join(", ")}
                    </p>
                  </div>
                ) : null}
              </SheetBody>
              <SheetFooter>
                {box === "inbox" &&
                selected.acknowledgementRequired &&
                !selected.isAcknowledged ? (
                  <Button
                    onClick={() =>
                      confirm({
                        title: "Acknowledge this alert?",
                        description: `You confirm to ${selected.sender} that you have received and understood "${selected.subject}". An acknowledgement is recorded and cannot be withdrawn.`,
                        confirmText: "Acknowledge",
                        icon: CheckCircle2,
                        onConfirm: () => acknowledge.mutateAsync(selected.id),
                      })
                    }
                    disabled={acknowledge.isPending}
                  >
                    <CheckCircle2 className="size-4" />
                    {acknowledge.isPending
                      ? "Acknowledging…"
                      : "Acknowledge alert"}
                  </Button>
                ) : null}
                {selected.status !== "OPEN" ? (
                  <Button
                    variant="outline"
                    onClick={() =>
                      changeState.mutate({
                        alertId: selected.id,
                        status: "OPEN",
                      })
                    }
                    disabled={changeState.isPending}
                  >
                    <RotateCcw className="size-4" />
                    Reopen
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    onClick={() =>
                      confirm({
                        title: "Resolve this alert?",
                        description: `"${selected.subject}" moves out of your open alerts. You can reopen it later from the Resolved filter.`,
                        confirmText: "Resolve",
                        icon: CheckCircle2,
                        onConfirm: () =>
                          changeState.mutateAsync({
                            alertId: selected.id,
                            status: "RESOLVED",
                          }),
                      })
                    }
                    disabled={changeState.isPending}
                  >
                    <CheckCircle2 className="size-4" />
                    Resolve
                  </Button>
                )}
                {selected.status !== "ARCHIVED" ? (
                  <Button
                    variant="outline"
                    onClick={() =>
                      confirm({
                        title: "Archive this alert?",
                        description: `"${selected.subject}" leaves your open alerts and is kept only in the archive. You can reopen it later from the Archived filter.`,
                        confirmText: "Archive",
                        icon: Archive,
                        onConfirm: () =>
                          changeState.mutateAsync({
                            alertId: selected.id,
                            status: "ARCHIVED",
                          }),
                      })
                    }
                    disabled={changeState.isPending}
                  >
                    <Archive className="size-4" />
                    Archive
                  </Button>
                ) : null}
              </SheetFooter>
            </>
          ) : null}
        </SheetContent>
      </Sheet>
    </PageShell>
  );
}
