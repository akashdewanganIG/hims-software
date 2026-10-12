"use client";

import * as React from "react";

import { AlertCircle, Bell, CheckCheck, Plus } from "@/components/icons";
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
import { FormDialog } from "@/components/ui/form-dialog";
import { Input } from "@/components/ui/input";
import { SearchInput } from "@/components/ui/search-input";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
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
import { cn } from "@/lib/utils";

const PRIORITY_TONE: Record<string, TagTone> = {
  LOW: "neutral",
  MEDIUM: "progress",
  HIGH: "pending",
  CRITICAL: "danger",
};

const EMPTY_COMPOSER = {
  audience: "ALL" as "ALL" | "DEPARTMENT" | "ROLE" | "STAFF",
  audienceId: "",
  category: "General",
  customCategory: "",
  subject: "",
  message: "",
  priority: "MEDIUM" as "LOW" | "MEDIUM" | "HIGH" | "CRITICAL",
};

export default function AlertsPage() {
  const [box, setBox] = React.useState<"inbox" | "sent">("inbox");
  const [q, setQ] = React.useState("");
  const [category, setCategory] = React.useState("");
  const [priority, setPriority] = React.useState("");
  const [unreadOnly, setUnreadOnly] = React.useState(false);
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
  });
  const { data: summary } = useAlertSummary();
  const { data: composer } = useAlertComposer();

  const markRead = useAction("alerts.markRead", (alertId: string) => ({
    alertId,
  }));
  const send = useAction(
    "alerts.send",
    () => ({
      audience: form.audience,
      audienceId: form.audience === "ALL" ? undefined : form.audienceId,
      category:
        form.category === "__custom" ? form.customCategory : form.category,
      subject: form.subject,
      message: form.message,
      priority: form.priority,
    }),
    {
      success: result =>
        `Alert sent to ${result.recipientIds.length} recipient${result.recipientIds.length === 1 ? "" : "s"}`,
      onSuccess: () => {
        setComposeOpen(false);
        setForm(EMPTY_COMPOSER);
      },
    }
  );

  const openAlert = (alert: AlertRow) => {
    setSelected(alert);
    if (box === "inbox" && !alert.isRead) markRead.mutate(alert.id);
  };

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
              : "bg-info shadow-[0_0_0_4px_var(--info-surface)]"
          )}
          aria-label={row.isRead ? "Read" : "Unread"}
        />
      ),
    },
    {
      id: "subject",
      header: "About",
      sortValue: row => row.subject,
      cell: row => (
        <div className="min-w-0 max-w-xl">
          <p
            className={cn(
              "truncate",
              !row.isRead && box === "inbox" && "font-semibold"
            )}
          >
            {row.subject}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {row.message}
          </p>
        </div>
      ),
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
      header: box === "inbox" ? "From" : "Recipients",
      cell: row =>
        box === "inbox"
          ? row.sender
          : `${row.recipientCount} staff member${row.recipientCount === 1 ? "" : "s"}`,
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
        : form.audience === "STAFF"
          ? composer?.staff
          : [];
  const finalCategory =
    form.category === "__custom" ? form.customCategory.trim() : form.category;
  const formValid =
    finalCategory.length >= 2 &&
    form.subject.trim().length >= 3 &&
    form.message.trim().length >= 5 &&
    (form.audience === "ALL" || Boolean(form.audienceId));

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
          rowClassName={row =>
            box === "inbox" && !row.isRead ? "bg-info-surface/35" : undefined
          }
          toolbar={
            <>
              <CategorySwitcher
                label="Alert mailbox"
                value={box}
                onValueChange={next => {
                  setBox(next);
                  setUnreadOnly(false);
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
                audienceId: "",
              }))
            }
          >
            <option value="ALL">All active staff</option>
            <option value="DEPARTMENT">A department</option>
            <option value="ROLE">A staff role</option>
            <option value="STAFF">One staff member</option>
          </SelectField>
        </Field>
        {form.audience !== "ALL" ? (
          <Field
            label={
              form.audience === "DEPARTMENT"
                ? "Department"
                : form.audience === "ROLE"
                  ? "Staff role"
                  : "Staff member"
            }
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
                </div>
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
                    <p className="text-xs text-muted-foreground">Recipients</p>
                    <p className="mt-0.5 font-medium">
                      {selected.recipientCount} staff · {selected.readCount}{" "}
                      read
                    </p>
                  </div>
                </div>
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
            </>
          ) : null}
        </SheetContent>
      </Sheet>
    </PageShell>
  );
}
