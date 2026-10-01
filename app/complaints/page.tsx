"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";

import {
  AlertTriangle,
  Camera,
  ChatText,
  CheckCheck,
  Edit,
  Plus,
  Timer,
  Trash2,
} from "@/components/icons";
import { DataTable, type Column } from "@/components/shared/data-table";
import { DownloadPdfButton } from "@/components/shared/download-pdf";
import { EntityLink, RefCode } from "@/components/shared/entity";
import {
  FilePicker,
  FilePreviewDialog,
  StoredThumbnail,
} from "@/components/shared/files";
import { PatientPicker } from "@/components/shared/patient-picker";
import {
  DetailGrid,
  DetailRow,
  ErrorBanner,
  Field,
  FormSection,
  PageHeader,
  PageShell,
  Panel,
  PriorityBadge,
  SelectField,
  StatCard,
  StatusBadge,
  Timeline,
} from "@/components/shared/page";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { CategorySwitcher } from "@/components/ui/category-switcher";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { FormDialog } from "@/components/ui/form-dialog";
import { Input } from "@/components/ui/input";
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
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  useDepartments,
  useStaffOptions,
  type PatientOption,
} from "@/features/opd/api";
import {
  useComplaint,
  useComplaints,
  useComplaintSummary,
  type ComplaintRow,
} from "@/features/quality/api";
import { useAction, useFileLoader } from "@/lib/api/client";
import type { FileSummary } from "@/lib/domain/files";
import { COMPLAINT_SLA_DAYS } from "@/lib/domain/quality";
import {
  formatDate,
  formatDateShort,
  formatDateTime,
  formatDuration,
  humanize,
} from "@/lib/format";
import { pdfName } from "@/lib/pdf/layout";
import { complaintPdf } from "@/lib/pdf/records";
import { useSession } from "@/lib/session";
import {
  COMPLAINANT_TYPES,
  COMPLAINT_CATEGORIES,
  PRIORITIES,
  type ComplainantType,
  type Complaint,
  type ComplaintCategory,
  type Priority,
} from "@/lib/sim/schema";
import type { PreparedUpload } from "@/lib/uploads";

type View = "open" | "overdue" | "resolved" | "all";

export default function ComplaintsPage() {
  return (
    <React.Suspense>
      <Complaints />
    </React.Suspense>
  );
}

function Complaints() {
  const params = useSearchParams();
  const { can } = useSession();
  const [view, setView] = React.useState<View>(
    params.get("open") ? "all" : "open"
  );
  const [q, setQ] = React.useState("");
  const [departmentId, setDepartmentId] = React.useState("");
  const [priority, setPriority] = React.useState("");
  const [openId, setOpenId] = React.useState<string | null>(params.get("open"));
  const [createOpen, setCreateOpen] = React.useState(false);
  const {
    data: rows = [],
    isLoading,
    error,
  } = useComplaints({
    view,
    q: q || undefined,
    departmentId: departmentId || undefined,
    priority: priority || undefined,
  });
  const { data: summary } = useComplaintSummary();
  const { data: departments = [] } = useDepartments();

  const columns: Column<ComplaintRow>[] = [
    {
      id: "code",
      header: "Complaint",
      sortValue: r => r.code,
      cell: r => <RefCode className="text-foreground">{r.code}</RefCode>,
    },
    {
      id: "title",
      header: "Issue",
      sortValue: r => r.title,
      cell: r => (
        <div className="min-w-0 max-w-72">
          <p className="truncate font-medium">{r.title}</p>
          <p className="truncate text-xs text-muted-foreground">
            {humanize(r.category)}
          </p>
        </div>
      ),
    },
    {
      id: "from",
      header: "From",
      cell: r => (
        <div className="min-w-0">
          <p className="truncate">{r.complainant}</p>
          <p className="truncate text-xs text-muted-foreground">
            {humanize(r.complainantType)}
            {r.patient ? ` · ${r.patient.uhid}` : ""}
          </p>
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
      id: "priority",
      header: "Priority",
      sortValue: r => PRIORITIES.indexOf(r.priority) * -1,
      cell: r => <PriorityBadge priority={r.priority} />,
    },
    {
      id: "assigned",
      header: "Owner",
      sortValue: r => r.assignedTo,
      cell: r =>
        r.assignedTo ?? (
          <span className="text-warning-foreground">Unassigned</span>
        ),
    },
    {
      id: "logged",
      header: "Logged",
      sortValue: r => r.createdAt,
      cell: r => (
        <span className="tabular-nums">{formatDateShort(r.createdAt)}</span>
      ),
    },
    {
      id: "due",
      header: "Due",
      sortValue: r => r.dueDate,
      cell: r => (
        <span
          className={
            r.overdue ? "font-semibold text-error-foreground" : "tabular-nums"
          }
        >
          {r.overdue
            ? `Overdue · ${formatDateShort(r.dueDate)}`
            : formatDateShort(r.dueDate)}
        </span>
      ),
    },
    {
      id: "status",
      header: "Status",
      sortValue: r => r.status,
      cell: r => <StatusBadge status={r.status} />,
    },
  ];

  return (
    <PageShell>
      <PageHeader
        title="Complaints"
        subtitle="Patient, attendant and visitor complaints with ownership, response targets by priority and a documented resolution."
        actions={
          can("complaint.log") ? (
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="size-4" />
              Log complaint
            </Button>
          ) : null
        }
      />
      <ErrorBanner error={error} />
      <section className="grid-auto-fit-sm gap-3">
        <StatCard
          label="Open"
          value={summary?.open ?? 0}
          icon={ChatText}
          loading={!summary}
          hint={`${summary?.unassigned ?? 0} unassigned`}
          tone={summary?.unassigned ? "warning" : "neutral"}
        />
        <StatCard
          label="Overdue"
          value={summary?.overdue ?? 0}
          icon={Timer}
          loading={!summary}
          tone={summary?.overdue ? "critical" : "positive"}
          hint="Past response target"
        />
        <StatCard
          label="High / critical open"
          value={summary?.highOpen ?? 0}
          icon={AlertTriangle}
          loading={!summary}
          tone={summary?.highOpen ? "warning" : "neutral"}
        />
        <StatCard
          label="Resolved within target"
          value={`${summary?.slaRate ?? 0}%`}
          icon={CheckCheck}
          loading={!summary}
          tone="positive"
          hint={
            summary
              ? `Average ${formatDuration((summary.avgHours ?? 0) * 60)} to resolve`
              : undefined
          }
        />
      </section>
      <Panel flush>
        <DataTable
          columns={columns}
          rows={rows}
          keyOf={r => r.id}
          isLoading={isLoading}
          initialSort={{ id: "logged", direction: "desc" }}
          rowClassName={r => (r.overdue ? "bg-error-surface/30" : undefined)}
          empty="No complaints in this view."
          onRowClick={r => setOpenId(r.id)}
          toolbar={
            <>
              <CategorySwitcher
                label="Complaint view"
                value={view}
                onValueChange={setView}
                items={[
                  { value: "open", label: "Open", count: summary?.open },
                  {
                    value: "overdue",
                    label: "Overdue",
                    count: summary?.overdue,
                  },
                  { value: "resolved", label: "Resolved & closed" },
                  { value: "all", label: "All" },
                ]}
              />
              <SearchInput
                wrapperClassName="min-w-48 flex-1"
                placeholder="Title, complainant or CMP number"
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
              <SelectField
                className="w-full sm:w-36"
                aria-label="Priority"
                value={priority}
                onChange={e => setPriority(e.target.value)}
              >
                <option value="">Any priority</option>
                {PRIORITIES.map(p => (
                  <option key={p} value={p}>
                    {humanize(p)}
                  </option>
                ))}
              </SelectField>
            </>
          }
        />
      </Panel>
      <ComplaintSheet id={openId} onClose={() => setOpenId(null)} />
      <LogComplaintDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSaved={id => setOpenId(id)}
      />
    </PageShell>
  );
}

function ComplaintSheet({
  id,
  onClose,
}: {
  id: string | null;
  onClose: () => void;
}) {
  const { can } = useSession();
  const { data } = useComplaint(id);
  const { data: people = [] } = useStaffOptions();
  const [owner, setOwner] = React.useState("");
  const [note, setNote] = React.useState("");
  const [dialog, setDialog] = React.useState<null | "resolve" | "reopen">(null);
  const [text, setText] = React.useState("");
  const [editOpen, setEditOpen] = React.useState(false);
  const [attachOpen, setAttachOpen] = React.useState(false);
  const [photo, setPhoto] = React.useState<PreparedUpload | null>(null);
  const [viewing, setViewing] = React.useState<FileSummary | null>(null);
  const [removing, setRemoving] = React.useState<FileSummary | null>(null);
  const manage = can("complaint.manage");
  const canAttach = manage || can("complaint.log");
  const c = data?.complaint;
  const loadFile = useFileLoader();

  React.useEffect(() => {
    setOwner(c?.assignedToId ?? "");
    setNote("");
  }, [c?.id, c?.assignedToId]);

  const assign = useAction(
    "complaint.assign",
    (staffId: string) => ({ complaintId: id!, staffId }),
    { success: "Owner assigned" }
  );
  const start = useAction("complaint.start", () => ({ complaintId: id! }), {
    success: "Marked in progress",
  });
  const addNote = useAction(
    "complaint.addNote",
    (t: string) => ({ complaintId: id!, text: t }),
    { success: "Note added", onSuccess: () => setNote("") }
  );
  const resolve = useAction(
    "complaint.resolve",
    (t: string) => ({ complaintId: id!, resolution: t }),
    { success: "Complaint resolved", onSuccess: () => setDialog(null) }
  );
  const close = useAction("complaint.close", () => ({ complaintId: id! }), {
    success: "Complaint closed",
  });
  const reopen = useAction(
    "complaint.reopen",
    (t: string) => ({ complaintId: id!, reason: t }),
    { success: "Complaint reopened", onSuccess: () => setDialog(null) }
  );
  const attach = useAction(
    "complaint.attachPhoto",
    () => ({
      complaintId: id!,
      photo: { name: photo!.name, data: photo!.data },
    }),
    { success: "Photo attached", onSuccess: () => setAttachOpen(false) }
  );
  const removePhoto = useAction(
    "complaint.removePhoto",
    () => ({ fileId: removing!.id }),
    { success: "Photo removed", onSuccess: () => setRemoving(null) }
  );

  const deptPeople = c
    ? [
        ...people.filter(p => p.departmentId === c.departmentId),
        ...people.filter(
          p =>
            p.departmentId !== c.departmentId &&
            (p.role === "OPERATIONS_MANAGER" || p.role === "ADMINISTRATOR")
        ),
      ]
    : [];
  const active = c && c.status !== "RESOLVED" && c.status !== "CLOSED";

  return (
    <>
      <Sheet open={Boolean(id)} onOpenChange={open => !open && onClose()}>
        <SheetContent size="lg">
          {!data || !c ? (
            <SheetBody className="space-y-3">
              <SheetTitle className="sr-only">Loading complaint</SheetTitle>
              <Skeleton className="h-6 w-40" />
              <Skeleton className="h-40 w-full" />
            </SheetBody>
          ) : (
            <>
              <SheetHeader>
                <div className="flex flex-wrap items-center gap-2">
                  <SheetTitle>{c.title}</SheetTitle>
                  <StatusBadge status={c.status} />
                  <PriorityBadge priority={c.priority} />
                </div>
                <SheetDescription>
                  {c.code} · {humanize(c.category)} · {data.department} · logged{" "}
                  {formatDateTime(c.createdAt)} by {data.loggedBy}
                </SheetDescription>
              </SheetHeader>
              <SheetBody className="space-y-4">
                {data.overdue ? (
                  <Alert tone="error" title="Past its response target">
                    Due {formatDate(c.dueDate)} (
                    {COMPLAINT_SLA_DAYS[c.priority]} day target for{" "}
                    {c.priority.toLowerCase()} priority).
                  </Alert>
                ) : null}
                <p className="whitespace-pre-line text-[0.8125rem] leading-5">
                  {c.description}
                </p>
                <DetailGrid columns={2}>
                  <DetailRow
                    label="Complainant"
                    value={`${c.complainantName} (${humanize(c.complainantType)})`}
                  />
                  <DetailRow label="Contact" value={c.contact} />
                  <DetailRow
                    label="Patient"
                    value={
                      data.patient ? (
                        <EntityLink
                          href={`/patients/${data.patient.id}`}
                          module="ehr"
                        >{`${data.patient.name} · ${data.patient.uhid}`}</EntityLink>
                      ) : (
                        "—"
                      )
                    }
                  />
                  <DetailRow
                    label="Related visit"
                    value={
                      data.encounter ? (
                        <EntityLink
                          href={
                            data.encounter.type === "OPD"
                              ? `/opd/visits/${data.encounter.id}`
                              : `/ipd/${data.encounter.admissionId}`
                          }
                        >
                          {data.encounter.code}
                        </EntityLink>
                      ) : (
                        "—"
                      )
                    }
                  />
                  <DetailRow label="Due" value={formatDate(c.dueDate)} />
                  <DetailRow
                    label="Owner"
                    value={data.assignedTo ?? "Unassigned"}
                  />
                  {c.resolution ? (
                    <DetailRow
                      label="Resolution"
                      value={c.resolution}
                      className="sm:col-span-2"
                    />
                  ) : null}
                </DetailGrid>

                <div>
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                      Photos · {data.photos.length}
                    </p>
                    {canAttach && c.status !== "CLOSED" ? (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={data.photos.length >= 6}
                        onClick={() => {
                          setPhoto(null);
                          setAttachOpen(true);
                        }}
                      >
                        <Camera className="size-4" />
                        Attach photo
                      </Button>
                    ) : null}
                  </div>
                  {data.photos.length ? (
                    <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                      {data.photos.map(p => (
                        <li key={p.id} className="relative">
                          <StoredThumbnail
                            file={p}
                            onOpen={() => setViewing(p)}
                          />
                          {manage && c.status !== "CLOSED" ? (
                            <Button
                              variant="outline"
                              size="icon-sm"
                              aria-label={`Remove ${p.name}`}
                              className="absolute right-1 top-1 bg-surface/95"
                              onClick={() => setRemoving(p)}
                            >
                              <Trash2 className="size-3.5" />
                            </Button>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      No photos. Attach pictures of the problem — a broken
                      fitting, a disputed bill — to keep the evidence with it.
                    </p>
                  )}
                </div>

                {manage && active ? (
                  <div className="grid gap-2 rounded-lg border border-border p-3 sm:grid-cols-[1fr_auto] sm:items-end">
                    <Field label="Owner">
                      <SelectField
                        value={owner}
                        onChange={e => setOwner(e.target.value)}
                      >
                        <option value="">Choose an owner…</option>
                        {deptPeople.map(p => (
                          <option key={p.id} value={p.id}>
                            {`${p.name} — ${p.designation}`}
                          </option>
                        ))}
                      </SelectField>
                    </Field>
                    <Button
                      variant="outline"
                      disabled={
                        !owner || owner === c.assignedToId || assign.isPending
                      }
                      onClick={() => assign.mutate(owner)}
                    >
                      {c.assignedToId ? "Reassign" : "Assign"}
                    </Button>
                  </div>
                ) : null}

                {manage && c.status !== "CLOSED" ? (
                  <div className="flex gap-2">
                    <Input
                      value={note}
                      onChange={e => setNote(e.target.value)}
                      placeholder="Add an internal note"
                      aria-label="Internal note"
                    />
                    <Button
                      variant="outline"
                      disabled={!note.trim() || addNote.isPending}
                      onClick={() => addNote.mutate(note)}
                    >
                      Add note
                    </Button>
                  </div>
                ) : null}

                <div>
                  <p className="mb-2 text-[0.6875rem] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                    Activity
                  </p>
                  <Timeline
                    entries={data.notes.map(n => ({
                      id: n.id,
                      at: n.at,
                      title: n.kind === "STATUS" ? n.text : `Note · ${n.by}`,
                      meta: formatDateTime(n.at),
                      body: n.kind === "NOTE" ? n.text : n.by,
                      tone: n.kind === "STATUS" ? "info" : "neutral",
                    }))}
                  />
                </div>
              </SheetBody>
              <SheetFooter>
                <div className="sm:mr-auto">
                  <DownloadPdfButton
                    fileName={pdfName("Complaint", c.code)}
                    build={async () =>
                      complaintPdf(
                        data,
                        (
                          await Promise.all(
                            data.photos.map(p => loadFile(p.id))
                          )
                        ).flatMap(f => (f ? [f.data] : []))
                      )
                    }
                  />
                </div>
                {manage && c.status !== "CLOSED" ? (
                  <Button variant="outline" onClick={() => setEditOpen(true)}>
                    <Edit className="size-4" />
                    Edit details
                  </Button>
                ) : null}
                {manage && c.status === "ASSIGNED" ? (
                  <Button variant="outline" onClick={() => start.mutate()}>
                    Start work
                  </Button>
                ) : null}
                {manage &&
                (c.status === "ASSIGNED" || c.status === "IN_PROGRESS") ? (
                  <Button
                    onClick={() => {
                      setText("");
                      setDialog("resolve");
                    }}
                  >
                    Resolve
                  </Button>
                ) : null}
                {manage && c.status === "RESOLVED" ? (
                  <Button
                    variant="outline"
                    onClick={() => {
                      setText("");
                      setDialog("reopen");
                    }}
                  >
                    Reopen
                  </Button>
                ) : null}
                {manage && c.status === "RESOLVED" ? (
                  <Button onClick={() => close.mutate()}>Close</Button>
                ) : null}
                {manage && c.status === "CLOSED" ? (
                  <Button
                    variant="outline"
                    onClick={() => {
                      setText("");
                      setDialog("reopen");
                    }}
                  >
                    Reopen
                  </Button>
                ) : null}
              </SheetFooter>
            </>
          )}
        </SheetContent>
      </Sheet>
      <FormDialog
        open={dialog !== null}
        onOpenChange={open => !open && setDialog(null)}
        title={dialog === "resolve" ? "Resolve complaint" : "Reopen complaint"}
        size="md"
        submitLabel={dialog === "resolve" ? "Resolve" : "Reopen"}
        submitDisabled={!text.trim()}
        onSubmit={event => {
          event.preventDefault();
          if (dialog === "resolve") resolve.mutate(text);
          else reopen.mutate(text);
        }}
      >
        <Field
          label={dialog === "resolve" ? "Resolution" : "Reason for reopening"}
          required
        >
          <Textarea
            autoFocus
            className="min-h-24"
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder={
              dialog === "resolve"
                ? "What was done and what was communicated to the complainant"
                : ""
            }
          />
        </Field>
      </FormDialog>
      {c ? (
        <EditComplaintDialog
          open={editOpen}
          onOpenChange={setEditOpen}
          complaint={c}
          patientLinked={Boolean(data?.patient)}
        />
      ) : null}
      <FormDialog
        open={attachOpen}
        onOpenChange={setAttachOpen}
        title="Attach photo"
        description="Kept with the complaint as evidence. Up to 6 photos."
        size="md"
        submitLabel="Attach"
        isSubmitting={attach.isPending}
        submitDisabled={!photo}
        onSubmit={event => {
          event.preventDefault();
          attach.mutate();
        }}
      >
        <Field label="Photo" required>
          <FilePicker purpose="photo" value={photo} onChange={setPhoto} />
        </Field>
      </FormDialog>
      <FilePreviewDialog
        file={viewing}
        onOpenChange={open => !open && setViewing(null)}
      />
      <ConfirmationDialog
        open={Boolean(removing)}
        onOpenChange={open => !open && setRemoving(null)}
        title="Remove photo?"
        description={`${removing?.name ?? "The photo"} will be removed from this complaint. The removal is noted in its activity.`}
        confirmText="Remove photo"
        variant="destructive"
        isLoading={removePhoto.isPending}
        onConfirm={async () => {
          await removePhoto.mutateAsync();
        }}
      />
    </>
  );
}

/** Corrects a complaint's details; its history keeps what changed. */
function EditComplaintDialog({
  open,
  onOpenChange,
  complaint,
  patientLinked,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  complaint: Complaint;
  patientLinked: boolean;
}) {
  const { data: departments = [] } = useDepartments();
  const initial = React.useCallback(
    () => ({
      complainantName: complaint.complainantName,
      contact: complaint.contact,
      category: complaint.category,
      departmentId: complaint.departmentId,
      title: complaint.title,
      description: complaint.description,
      priority: complaint.priority,
    }),
    [complaint]
  );
  const [form, setForm] = React.useState(initial);
  React.useEffect(() => {
    if (open) setForm(initial());
  }, [open, initial]);
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm(current => ({ ...current, [key]: value }));
  const save = useAction(
    "complaint.update",
    () => ({ complaintId: complaint.id, ...form }),
    {
      success: c => `Complaint ${c.code} updated`,
      onSuccess: () => onOpenChange(false),
    }
  );
  const nameFixed = patientLinked && complaint.complainantType === "PATIENT";
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Edit ${complaint.code}`}
      description="A new priority moves the response target to that priority's window, counted from when the complaint was logged."
      size="lg"
      submitLabel="Save changes"
      isSubmitting={save.isPending}
      submitDisabled={
        !form.title.trim() ||
        !form.description.trim() ||
        !form.complainantName.trim()
      }
      onSubmit={event => {
        event.preventDefault();
        save.mutate();
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field
          label="Complainant"
          hint={nameFixed ? "Taken from the patient record" : undefined}
        >
          <Input
            value={form.complainantName}
            disabled={nameFixed}
            onChange={e => set("complainantName", e.target.value)}
          />
        </Field>
        <Field label="Contact">
          <Input
            value={form.contact}
            onChange={e => set("contact", e.target.value)}
          />
        </Field>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Category">
          <SelectField
            value={form.category}
            onChange={e => set("category", e.target.value as ComplaintCategory)}
          >
            {COMPLAINT_CATEGORIES.map(c => (
              <option key={c} value={c}>
                {humanize(c)}
              </option>
            ))}
          </SelectField>
        </Field>
        <Field label="Department">
          <SelectField
            value={form.departmentId}
            onChange={e => set("departmentId", e.target.value)}
          >
            {departments.map(d => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </SelectField>
        </Field>
        <Field label="Priority">
          <SelectField
            value={form.priority}
            onChange={e => set("priority", e.target.value as Priority)}
          >
            {PRIORITIES.map(p => (
              <option key={p} value={p}>
                {humanize(p)}
              </option>
            ))}
          </SelectField>
        </Field>
      </div>
      <Field label="Title" required>
        <Input
          value={form.title}
          onChange={e => set("title", e.target.value)}
        />
      </Field>
      <Field label="Description" required>
        <Textarea
          className="min-h-24"
          value={form.description}
          onChange={e => set("description", e.target.value)}
        />
      </Field>
    </FormDialog>
  );
}

function LogComplaintDialog({
  open,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (id: string) => void;
}) {
  const { data: departments = [] } = useDepartments();
  const [patient, setPatient] = React.useState<PatientOption | null>(null);
  const [form, setForm] = React.useState({
    complainantType: "PATIENT" as ComplainantType,
    complainantName: "",
    contact: "",
    category: "WAITING_TIME" as ComplaintCategory,
    departmentId: "",
    title: "",
    description: "",
    priority: "MEDIUM" as Priority,
  });
  React.useEffect(() => {
    if (!open) return;
    setPatient(null);
    setForm({
      complainantType: "PATIENT",
      complainantName: "",
      contact: "",
      category: "WAITING_TIME",
      departmentId: "",
      title: "",
      description: "",
      priority: "MEDIUM",
    });
  }, [open]);
  const set = (key: keyof typeof form, value: string) =>
    setForm(current => ({ ...current, [key]: value }));
  const save = useAction(
    "complaint.log",
    () => ({
      patientId: patient?.id,
      complainantName:
        form.complainantType === "PATIENT" ? "" : form.complainantName,
      complainantType: form.complainantType,
      contact: form.contact,
      category: form.category,
      departmentId: form.departmentId,
      title: form.title,
      description: form.description,
      priority: form.priority,
    }),
    {
      success: c => `Complaint ${c.code} logged · due ${formatDate(c.dueDate)}`,
      onSuccess: c => {
        onOpenChange(false);
        onSaved(c.id);
      },
    }
  );
  const invalid =
    !form.departmentId ||
    !form.title.trim() ||
    !form.description.trim() ||
    (form.complainantType === "PATIENT"
      ? !patient
      : !form.complainantName.trim());
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Log complaint"
      description={`Response target is set from priority: critical ${COMPLAINT_SLA_DAYS.CRITICAL} d, high ${COMPLAINT_SLA_DAYS.HIGH} d, medium ${COMPLAINT_SLA_DAYS.MEDIUM} d, low ${COMPLAINT_SLA_DAYS.LOW} d.`}
      size="lg"
      submitLabel="Log complaint"
      isSubmitting={save.isPending}
      submitDisabled={invalid}
      onSubmit={event => {
        event.preventDefault();
        save.mutate();
      }}
      bodyClassName="gap-5"
    >
      <FormSection title="Complainant">
        <div className="grid gap-3 sm:grid-cols-[12rem_1fr]">
          <Field label="Raised by">
            <SelectField
              value={form.complainantType}
              onChange={e => set("complainantType", e.target.value)}
            >
              {COMPLAINANT_TYPES.map(t => (
                <option key={t} value={t}>
                  {humanize(t)}
                </option>
              ))}
            </SelectField>
          </Field>
          {form.complainantType === "PATIENT" ? (
            <Field label="Patient" required>
              <PatientPicker value={patient} onChange={setPatient} />
            </Field>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Name" required>
                <Input
                  value={form.complainantName}
                  onChange={e => set("complainantName", e.target.value)}
                />
              </Field>
              <Field label="Contact">
                <Input
                  value={form.contact}
                  onChange={e => set("contact", e.target.value)}
                />
              </Field>
            </div>
          )}
        </div>
        {form.complainantType !== "PATIENT" &&
        form.complainantType !== "STAFF" ? (
          <Field label="Related patient (optional)">
            <PatientPicker value={patient} onChange={setPatient} />
          </Field>
        ) : null}
      </FormSection>
      <FormSection title="Complaint">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Category">
            <SelectField
              value={form.category}
              onChange={e => set("category", e.target.value)}
            >
              {COMPLAINT_CATEGORIES.map(c => (
                <option key={c} value={c}>
                  {humanize(c)}
                </option>
              ))}
            </SelectField>
          </Field>
          <Field label="Department" required>
            <SelectField
              value={form.departmentId}
              onChange={e => set("departmentId", e.target.value)}
            >
              <option value="">Choose…</option>
              {departments.map(d => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </SelectField>
          </Field>
          <Field label="Priority">
            <SelectField
              value={form.priority}
              onChange={e => set("priority", e.target.value)}
            >
              {PRIORITIES.map(p => (
                <option key={p} value={p}>
                  {humanize(p)}
                </option>
              ))}
            </SelectField>
          </Field>
        </div>
        <Field label="Title" required>
          <Input
            value={form.title}
            onChange={e => set("title", e.target.value)}
            placeholder="Short summary"
          />
        </Field>
        <Field label="Description" required>
          <Textarea
            className="min-h-24"
            value={form.description}
            onChange={e => set("description", e.target.value)}
            placeholder="What happened, when and where"
          />
        </Field>
      </FormSection>
    </FormDialog>
  );
}
