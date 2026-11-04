"use client";

import * as React from "react";

import {
  Copy,
  Eye,
  Phone,
  Plus,
  Smiley,
  SmileySad,
  Star,
} from "@/components/icons";
import { DataTable, type Column } from "@/components/shared/data-table";
import { PatientPicker } from "@/components/shared/patient-picker";
import {
  DetailGrid,
  DetailRow,
  ErrorBanner,
  Field,
  PageHeader,
  PageShell,
  Panel,
  SelectField,
  StatCard,
  StatusBadge,
} from "@/components/shared/page";
import { Button } from "@/components/ui/button";
import { CategorySwitcher } from "@/components/ui/category-switcher";
import { DateFilter, type DateRangeValue } from "@/components/ui/date-filter";
import { MagnitudeBars } from "@/components/ui/chart-primitives";
import { FormDialog } from "@/components/ui/form-dialog";
import { SearchInput } from "@/components/ui/search-input";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tag } from "@/components/ui/tag";
import { Textarea } from "@/components/ui/textarea";
import {
  useDepartments,
  useStaffOptions,
  type PatientOption,
} from "@/features/opd/api";
import {
  useFeedback,
  useFeedbackRequests,
  useFeedbackSummary,
  usePatientEncounters,
  type FeedbackRequestRow,
  type FeedbackRow,
} from "@/features/quality/api";
import { Stars } from "@/features/quality/stars";
import { useAction } from "@/lib/api/client";
import {
  formatDateShort,
  formatDateTime,
  formatPhone,
  humanize,
  pluralize,
} from "@/lib/format";
import { useSession } from "@/lib/session";
import { HOSPITAL } from "@/lib/sim/reference";
import { addDaysIso, isoDate } from "@/lib/sim/time";
import {
  FEEDBACK_CATEGORIES,
  FEEDBACK_CHANNELS,
  type FeedbackCategory,
  type FeedbackChannel,
  type FollowUpStatus,
} from "@/lib/sim/schema";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast";
import { readMessagingProviderLabels } from "@/lib/integrations-preview";

type View = "all" | "followup" | "low" | "high";

export default function FeedbackPage() {
  const { can } = useSession();
  const [view, setView] = React.useState<View>("all");
  const [range, setRange] = React.useState<DateRangeValue>(() => {
    const to = isoDate(new Date());
    return { from: addDaysIso(to, -29), to };
  });
  const [q, setQ] = React.useState("");
  const [requestQ, setRequestQ] = React.useState("");
  const [requestStatus, setRequestStatus] = React.useState("");
  const [origin, setOrigin] = React.useState("");
  const [departmentId, setDepartmentId] = React.useState("");
  const [openId, setOpenId] = React.useState<string | null>(null);
  const [createOpen, setCreateOpen] = React.useState(false);
  const [messagingProviders, setMessagingProviders] = React.useState({
    whatsapp: "WhatsApp Business Cloud",
    sms: "MSG91 SMS",
  });
  const {
    data: rows = [],
    isLoading,
    error,
  } = useFeedback({
    view,
    ...range,
    q: q || undefined,
    departmentId: departmentId || undefined,
  });
  const { data: summary } = useFeedbackSummary(range);
  const { data: requests = [], isLoading: requestsLoading } =
    useFeedbackRequests({
      ...range,
      q: requestQ || undefined,
      status: requestStatus || undefined,
    });
  const { data: departments = [] } = useDepartments();
  const selected = rows.find(r => r.id === openId) ?? null;

  React.useEffect(() => {
    setOrigin(window.location.origin);
    setMessagingProviders(readMessagingProviderLabels());
  }, []);

  const markWhatsappOpened = useAction(
    "feedback.openWhatsapp",
    (requestId: string) => ({ requestId }),
    { success: "WhatsApp composer opened" }
  );

  const columns: Column<FeedbackRow>[] = [
    {
      id: "date",
      header: "Received",
      sortValue: r => r.submittedAt,
      cell: r => (
        <span className="tabular-nums">{formatDateShort(r.submittedAt)}</span>
      ),
    },
    {
      id: "rating",
      header: "Rating",
      sortValue: r => r.rating,
      cell: r => <Stars value={r.rating} />,
    },
    {
      id: "comments",
      header: "Comments",
      cell: r => (
        <span className="line-clamp-2 max-w-80">
          {r.comments || <span className="text-muted-foreground">—</span>}
        </span>
      ),
    },
    {
      id: "categories",
      header: "About",
      cell: r => (
        <span className="line-clamp-1 max-w-56 text-muted-foreground">
          {r.categories.map(c => humanize(c)).join(", ")}
        </span>
      ),
    },
    {
      id: "department",
      header: "Department",
      sortValue: r => r.department,
      cell: r => (
        <div className="min-w-0">
          <p className="truncate">{r.department}</p>
          {r.doctor ? (
            <p className="truncate text-xs text-muted-foreground">{r.doctor}</p>
          ) : null}
        </div>
      ),
    },
    {
      id: "from",
      header: "From",
      cell: r =>
        r.patient ? (
          <span>{r.patient.name}</span>
        ) : (
          <Tag tone="neutral">Anonymous</Tag>
        ),
    },
    {
      id: "channel",
      header: "Channel",
      defaultHidden: true,
      cell: r => humanize(r.channel),
    },
    {
      id: "followup",
      header: "Follow-up",
      sortValue: r => r.followUpStatus,
      cell: r =>
        r.followUpRequired ? (
          <StatusBadge status={r.followUpStatus} />
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
  ];

  const requestColumns: Column<FeedbackRequestRow>[] = [
    {
      id: "created",
      header: "Prepared",
      sortValue: row => row.createdAt,
      cell: row => formatDateShort(row.createdAt),
    },
    {
      id: "process",
      header: "After",
      sortValue: row => row.processLabel,
      cell: row => (
        <div>
          <p>{row.processLabel}</p>
          <p className="font-mono text-xs text-muted-foreground">
            {row.sourceCode}
          </p>
        </div>
      ),
    },
    {
      id: "patient",
      header: "Patient",
      sortValue: row => row.patient.name,
      cell: row => (
        <div>
          <p>{row.patient.name}</p>
          <p className="text-xs text-muted-foreground">
            {formatPhone(row.phone)}
          </p>
        </div>
      ),
    },
    {
      id: "status",
      header: "Delivery",
      sortValue: row => row.status,
      cell: row => (
        <StatusBadge
          status={row.status}
          label={
            row.status === "READY"
              ? "Ready to send"
              : row.status === "WHATSAPP_OPENED"
                ? "WhatsApp opened"
                : "Response received"
          }
        />
      ),
    },
    {
      id: "link",
      header: "Customer link",
      cell: row => {
        const reviewUrl = `${origin}/review/${row.token}`;
        const message = `Hello ${row.patient.name.split(" ")[0]}, thank you for choosing ${HOSPITAL.name}. Please share feedback about your ${row.processLabel.toLowerCase()}: ${reviewUrl}`;
        const digits = row.phone.replace(/\D/g, "");
        const whatsappPhone = digits.length === 10 ? `91${digits}` : digits;
        return (
          <div
            className="flex flex-wrap gap-1.5"
            onClick={event => event.stopPropagation()}
          >
            <Button
              size="sm"
              variant="outline"
              disabled={!origin}
              onClick={() => {
                void navigator.clipboard.writeText(reviewUrl);
                toast.success("Feedback link copied");
              }}
            >
              <Copy className="size-3.5" />
              Copy link
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={!origin}
              onClick={() =>
                window.open(reviewUrl, "_blank", "noopener,noreferrer")
              }
            >
              <Eye className="size-3.5" />
              Test form
            </Button>
            {row.status !== "SUBMITTED" ? (
              <Button
                size="sm"
                disabled={!origin || !whatsappPhone}
                onClick={() => {
                  window.open(
                    `https://wa.me/${whatsappPhone}?text=${encodeURIComponent(message)}`,
                    "_blank",
                    "noopener,noreferrer"
                  );
                  markWhatsappOpened.mutate(row.id);
                }}
              >
                <Phone className="size-3.5" />
                WhatsApp · {messagingProviders.whatsapp}
              </Button>
            ) : null}
            {row.status !== "SUBMITTED" ? (
              <Button
                size="sm"
                variant="outline"
                disabled={!origin || !digits}
                onClick={() => {
                  window.location.href = `sms:${digits}?body=${encodeURIComponent(message)}`;
                  toast.info("SMS composer opened; no delivery was attempted");
                }}
              >
                <Phone className="size-3.5" />
                SMS · {messagingProviders.sms}
              </Button>
            ) : null}
          </div>
        );
      },
    },
  ];

  return (
    <PageShell>
      <PageHeader
        title="Patient feedback"
        subtitle="Ratings and comments from OPD and inpatients. Ratings of 2 stars or less always get a follow-up."
        actions={
          <>
            <DateFilter
              label="Period"
              value={range}
              onChange={setRange}
              max={isoDate(new Date())}
              presets={[
                {
                  label: "Last 7 days",
                  value: {
                    from: addDaysIso(isoDate(new Date()), -6),
                    to: isoDate(new Date()),
                  },
                },
                {
                  label: "Last 30 days",
                  value: {
                    from: addDaysIso(isoDate(new Date()), -29),
                    to: isoDate(new Date()),
                  },
                },
              ]}
            />
            {can("feedback.submit") ? (
              <Button onClick={() => setCreateOpen(true)}>
                <Plus className="size-4" />
                Record feedback
              </Button>
            ) : null}
          </>
        }
      />
      <ErrorBanner error={error} />
      <section className="grid-auto-fit-sm gap-3">
        <StatCard
          label="Average rating"
          value={summary ? summary.average.toFixed(2) : "—"}
          icon={Star}
          loading={!summary}
          hint={pluralize(summary?.total ?? 0, "response")}
        />
        <StatCard
          label="Satisfied (4–5★)"
          value={`${summary?.satisfaction ?? 0}%`}
          icon={Smiley}
          loading={!summary}
          tone="positive"
        />
        <StatCard
          label="Promoter score"
          value={summary ? summary.nps : "—"}
          loading={!summary}
          hint="% 5★ minus % 1–3★"
        />
        <StatCard
          label="Follow-ups open"
          value={summary?.pendingFollowUps ?? 0}
          icon={SmileySad}
          loading={!summary}
          tone={summary?.pendingFollowUps ? "warning" : "neutral"}
        />
      </section>
      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="Rating distribution">
          <MagnitudeBars
            data={(summary?.distribution ?? []).map(d => ({
              key: String(d.rating),
              label: `${d.rating} ★`,
              value: d.count,
              display: String(d.count),
            }))}
          />
        </Panel>
        <Panel
          title="By category"
          description="Average rating where the category was mentioned."
        >
          <MagnitudeBars
            data={(summary?.categories ?? []).slice(0, 6).map(c => ({
              key: c.category,
              label: humanize(c.category),
              value: c.average,
              display: `${c.average.toFixed(1)}★`,
              meta: `${c.count}`,
            }))}
          />
        </Panel>
        <Panel title="By department">
          <MagnitudeBars
            data={(summary?.departments ?? []).slice(0, 6).map(d => ({
              key: d.department,
              label: d.department,
              value: d.average,
              display: `${d.average.toFixed(1)}★`,
              meta: `${d.count}`,
            }))}
          />
        </Panel>
      </div>
      <Panel
        title="WhatsApp feedback requests"
        description="A request is prepared automatically after every completed OPD visit and final IPD discharge. Automatic WhatsApp delivery is not connected yet; copy the customer link, test the form, or open a prefilled WhatsApp message."
        flush
      >
        <DataTable
          columns={requestColumns}
          rows={requests}
          exportName="feedback-requests"
          exportLabel="Export requests"
          keyOf={row => row.id}
          isLoading={requestsLoading}
          initialSort={{ id: "created", direction: "desc" }}
          pageSize={8}
          empty="No feedback requests in this period."
          toolbar={
            <>
              <CategorySwitcher
                label="Request status"
                value={requestStatus}
                onValueChange={setRequestStatus}
                items={[
                  { value: "", label: "All requests" },
                  { value: "READY", label: "Ready" },
                  { value: "WHATSAPP_OPENED", label: "WhatsApp opened" },
                  { value: "SUBMITTED", label: "Responded" },
                ]}
              />
              <SearchInput
                wrapperClassName="min-w-48 flex-1"
                placeholder="Patient, UHID, phone or visit"
                value={requestQ}
                onChange={event => setRequestQ(event.target.value)}
              />
            </>
          }
        />
      </Panel>
      <Panel flush>
        <DataTable
          columns={columns}
          rows={rows}
          exportName="patient-feedback"
          exportLabel="Export feedback"
          keyOf={r => r.id}
          isLoading={isLoading}
          initialSort={{ id: "date", direction: "desc" }}
          onRowClick={r => setOpenId(r.id)}
          empty="No feedback in this view."
          toolbar={
            <>
              <CategorySwitcher
                label="Feedback view"
                value={view}
                onValueChange={setView}
                items={[
                  { value: "all", label: "All" },
                  {
                    value: "followup",
                    label: "Needs follow-up",
                    count: summary?.pendingFollowUps,
                  },
                  { value: "low", label: "1–2 ★" },
                  { value: "high", label: "4–5 ★" },
                ]}
              />
              <SearchInput
                wrapperClassName="min-w-48 flex-1"
                placeholder="Search comments"
                value={q}
                onChange={e => setQ(e.target.value)}
              />
              <SelectField
                className="w-full sm:w-48"
                aria-label="Department"
                value={departmentId}
                onChange={e => setDepartmentId(e.target.value)}
              >
                <option value="">All departments</option>
                {departments.map(d => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </SelectField>
            </>
          }
        />
      </Panel>
      <FeedbackSheet row={selected} onClose={() => setOpenId(null)} />
      <FeedbackDialog open={createOpen} onOpenChange={setCreateOpen} />
    </PageShell>
  );
}

function FeedbackSheet({
  row,
  onClose,
}: {
  row: FeedbackRow | null;
  onClose: () => void;
}) {
  const { can } = useSession();
  const [status, setStatus] = React.useState<FollowUpStatus>("IN_PROGRESS");
  const [note, setNote] = React.useState("");
  // Reseed when another feedback opens or its saved follow-up changes, not
  // on every background refetch.
  const savedKey = row
    ? `${row.id}:${row.followUpStatus}:${row.followUpNote ?? ""}`
    : "";
  React.useEffect(() => {
    if (!row) return;
    setStatus(
      row.followUpStatus === "PENDING" ? "IN_PROGRESS" : row.followUpStatus
    );
    setNote(row.followUpNote ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the saved state
  }, [savedKey]);
  const save = useAction(
    "feedback.updateFollowUp",
    () => ({ feedbackId: row!.id, status, note }),
    { success: "Follow-up updated" }
  );
  return (
    <Sheet open={Boolean(row)} onOpenChange={open => !open && onClose()}>
      <SheetContent size="md">
        {row ? (
          <>
            <SheetHeader>
              <div className="flex items-center gap-2">
                <SheetTitle>Feedback {row.code}</SheetTitle>
                <Stars value={row.rating} size="md" />
              </div>
              <SheetDescription>
                {formatDateTime(row.submittedAt)} · {humanize(row.channel)}
              </SheetDescription>
            </SheetHeader>
            <SheetBody className="space-y-4">
              <p className="text-[0.8125rem] leading-5">
                {row.comments || "No comment."}
              </p>
              <DetailGrid columns={2}>
                <DetailRow
                  label="From"
                  value={
                    row.patient
                      ? `${row.patient.name} · ${row.patient.uhid}`
                      : "Anonymous"
                  }
                />
                <DetailRow label="Visit" value={row.encounterCode} />
                <DetailRow label="Department" value={row.department} />
                <DetailRow label="Doctor" value={row.doctor} />
                <DetailRow
                  label="About"
                  value={row.categories.map(c => humanize(c)).join(", ")}
                  className="sm:col-span-2"
                />
              </DetailGrid>
              {row.followUpRequired ? (
                <div className="space-y-3 rounded-lg border border-border p-3">
                  <p className="text-[0.8125rem] font-medium">Follow-up</p>
                  <Field label="Status">
                    <SelectField
                      disabled={!can("feedback.manage")}
                      value={status}
                      onChange={e =>
                        setStatus(e.target.value as FollowUpStatus)
                      }
                    >
                      <option value="PENDING">Pending</option>
                      <option value="IN_PROGRESS">In progress</option>
                      <option value="COMPLETED">Completed</option>
                    </SelectField>
                  </Field>
                  <Field
                    label="Notes / outcome"
                    hint={
                      status === "COMPLETED"
                        ? "Required to complete"
                        : undefined
                    }
                  >
                    <Textarea
                      readOnly={!can("feedback.manage")}
                      className="min-h-20"
                      value={note}
                      onChange={e => setNote(e.target.value)}
                    />
                  </Field>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  No follow-up was needed for this response.
                </p>
              )}
            </SheetBody>
            {row.followUpRequired && can("feedback.manage") ? (
              <SheetFooter>
                <Button
                  onClick={() => save.mutate()}
                  disabled={
                    save.isPending || (status === "COMPLETED" && !note.trim())
                  }
                >
                  Save follow-up
                </Button>
              </SheetFooter>
            ) : null}
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function FeedbackDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { data: departments = [] } = useDepartments();
  const { data: doctors = [] } = useStaffOptions(["DOCTOR"]);
  const [anonymous, setAnonymous] = React.useState(false);
  const [patient, setPatient] = React.useState<PatientOption | null>(null);
  const [encounterId, setEncounterId] = React.useState("");
  const [departmentId, setDepartmentId] = React.useState("");
  const [doctorId, setDoctorId] = React.useState("");
  const [rating, setRating] = React.useState(0);
  const [categories, setCategories] = React.useState<FeedbackCategory[]>([]);
  const [comments, setComments] = React.useState("");
  const [channel, setChannel] = React.useState<FeedbackChannel>("IN_PERSON");
  const { data: encounters = [] } = usePatientEncounters(
    anonymous ? undefined : patient?.id
  );

  React.useEffect(() => {
    if (!open) return;
    setAnonymous(false);
    setPatient(null);
    setEncounterId("");
    setDepartmentId("");
    setDoctorId("");
    setRating(0);
    setCategories([]);
    setComments("");
    setChannel("IN_PERSON");
  }, [open]);

  const save = useAction(
    "feedback.submit",
    () => ({
      patientId: patient?.id,
      anonymous,
      encounterId: encounterId || undefined,
      departmentId,
      doctorId: doctorId || undefined,
      rating,
      categories,
      comments,
      channel,
    }),
    {
      success: f =>
        f.followUpRequired
          ? "Feedback recorded — follow-up created"
          : "Feedback recorded",
      onSuccess: () => onOpenChange(false),
    }
  );

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Record feedback"
      size="lg"
      submitLabel="Save feedback"
      isSubmitting={save.isPending}
      submitDisabled={!rating || !departmentId || (!anonymous && !patient)}
      onSubmit={event => {
        event.preventDefault();
        save.mutate();
      }}
    >
      <label className="flex items-center gap-2 text-[0.8125rem]">
        <input
          type="checkbox"
          className="size-4 accent-primary"
          checked={anonymous}
          onChange={e => setAnonymous(e.target.checked)}
        />
        Anonymous feedback
      </label>
      {!anonymous ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Patient" required>
            <PatientPicker value={patient} onChange={setPatient} />
          </Field>
          <Field label="Visit">
            <SelectField
              value={encounterId}
              onChange={e => {
                setEncounterId(e.target.value);
                const enc = encounters.find(x => x.id === e.target.value);
                if (enc) {
                  setDepartmentId(enc.departmentId);
                  setDoctorId(enc.doctorId);
                }
              }}
            >
              <option value="">Not linked to a visit</option>
              {encounters.map(e => (
                <option key={e.id} value={e.id}>
                  {`${e.code} · ${e.type} · ${formatDateShort(e.startedAt)}`}
                </option>
              ))}
            </SelectField>
          </Field>
        </div>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Department" required>
          <SelectField
            value={departmentId}
            onChange={e => setDepartmentId(e.target.value)}
          >
            <option value="">Choose…</option>
            {departments.map(d => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </SelectField>
        </Field>
        <Field label="Doctor">
          <SelectField
            value={doctorId}
            onChange={e => setDoctorId(e.target.value)}
          >
            <option value="">Not applicable</option>
            {doctors.map(d => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </SelectField>
        </Field>
        <Field label="Channel">
          <SelectField
            value={channel}
            onChange={e => setChannel(e.target.value as FeedbackChannel)}
          >
            {FEEDBACK_CHANNELS.map(c => (
              <option key={c} value={c}>
                {humanize(c)}
              </option>
            ))}
          </SelectField>
        </Field>
      </div>
      <Field
        label="Rating"
        required
        hint={
          rating && rating <= 2
            ? "A follow-up will be created automatically."
            : undefined
        }
      >
        <div className="flex gap-1" role="radiogroup" aria-label="Rating">
          {[1, 2, 3, 4, 5].map(i => (
            <button
              key={i}
              type="button"
              role="radio"
              aria-checked={rating === i}
              aria-label={`${i} star${i === 1 ? "" : "s"}`}
              onClick={() => setRating(i)}
              className="rounded-md p-1 outline-none hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring/30"
            >
              <Star
                weight={i <= rating ? "fill" : "regular"}
                className={cn(
                  "size-6",
                  i <= rating
                    ? rating <= 2
                      ? "text-error"
                      : "text-warning"
                    : "text-border-strong"
                )}
              />
            </button>
          ))}
        </div>
      </Field>
      <Field label="About">
        <div className="flex flex-wrap gap-1.5">
          {FEEDBACK_CATEGORIES.map(c => {
            const on = categories.includes(c);
            return (
              <button
                key={c}
                type="button"
                role="checkbox"
                aria-checked={on}
                onClick={() =>
                  setCategories(cur =>
                    on ? cur.filter(x => x !== c) : [...cur, c]
                  )
                }
                className={cn(
                  "h-7 rounded-md border px-2 text-xs font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring/30",
                  on
                    ? "border-primary bg-primary-surface text-primary-surface-foreground"
                    : "border-border bg-surface hover:border-border-strong"
                )}
              >
                {humanize(c)}
              </button>
            );
          })}
        </div>
      </Field>
      <Field label="Comments">
        <Textarea
          className="min-h-20"
          value={comments}
          onChange={e => setComments(e.target.value)}
        />
      </Field>
    </FormDialog>
  );
}
