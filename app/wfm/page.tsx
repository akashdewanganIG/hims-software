"use client";

import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

import {
  CalendarDays,
  Edit,
  Plus,
  UserCheck,
  UsersThree,
} from "@/components/icons";
import { DataTable, type Column } from "@/components/shared/data-table";
import { RefCode } from "@/components/shared/entity";
import { PersonPhoto, PhotoDialog } from "@/components/shared/files";
import {
  DetailGrid,
  DetailRow,
  ErrorBanner,
  Field,
  FormSection,
  PageHeader,
  PageShell,
  Panel,
  SelectField,
  StatCard,
  StatusBadge,
} from "@/components/shared/page";
import { Button } from "@/components/ui/button";
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
import { Tag } from "@/components/ui/tag";
import { useDepartments } from "@/features/opd/api";
import {
  useStaffList,
  useStaffProfile,
  type StaffRow,
} from "@/features/wfm/api";
import { useAction } from "@/lib/api/client";
import {
  formatDate,
  formatDateShort,
  formatINR,
  formatPhone,
  humanize,
} from "@/lib/format";
import { STAFF_ROLE_LABEL } from "@/lib/rbac";
import { useSession } from "@/lib/session";
import {
  STAFF_ROLES,
  type Staff,
  type StaffRole,
  type StaffStatus,
} from "@/lib/sim/schema";
import type { PreparedUpload } from "@/lib/uploads";
import { cn } from "@/lib/utils";

export default function StaffPage() {
  return (
    <React.Suspense>
      <StaffDirectory />
    </React.Suspense>
  );
}

const roleLabel = (role: StaffRole) => STAFF_ROLE_LABEL[role];

function StaffDirectory() {
  const params = useSearchParams();
  const { can } = useSession();
  const [q, setQ] = React.useState("");
  const [departmentId, setDepartmentId] = React.useState("");
  const [role, setRole] = React.useState("");
  const [openId, setOpenId] = React.useState<string | null>(params.get("open"));
  const [createOpen, setCreateOpen] = React.useState(false);
  const {
    data: rows = [],
    isLoading,
    error,
  } = useStaffList({
    q: q || undefined,
    departmentId: departmentId || undefined,
    role: role || undefined,
  });
  const { data: all = [] } = useStaffList({});
  const { data: departments = [] } = useDepartments();

  const onDuty = all.filter(s => s.onDuty).length;
  const onLeave = all.filter(
    s => s.status === "ON_LEAVE" || s.today.status === "LEAVE"
  ).length;
  const doctorsToday = all.filter(
    s => s.role === "DOCTOR" && s.today.status === "SCHEDULED"
  ).length;

  const columns: Column<StaffRow>[] = [
    {
      id: "name",
      header: "Staff member",
      sortValue: r => r.name,
      cell: r => (
        <div className="min-w-0">
          <p className="truncate font-medium">{r.name}</p>
          <p className="truncate text-xs text-muted-foreground">
            <span className="font-mono">{r.staffCode}</span> · {r.designation}
          </p>
        </div>
      ),
    },
    {
      id: "role",
      header: "Role",
      sortValue: r => r.role,
      cell: r => (
        <Tag
          tone={
            r.role === "DOCTOR" || r.role === "NURSE" ? "progress" : "neutral"
          }
        >
          {roleLabel(r.role)}
        </Tag>
      ),
    },
    {
      id: "department",
      header: "Department",
      sortValue: r => r.department,
      cell: r => r.department,
    },
    {
      id: "today",
      header: "Today",
      sortValue: r => r.today.window ?? r.today.status,
      cell: r =>
        r.today.status === "SCHEDULED" ? (
          <span className="tabular-nums">
            {r.today.shift} · {r.today.window}
          </span>
        ) : (
          <StatusBadge
            status={r.today.status === "UNROSTERED" ? "OFF" : r.today.status}
            label={r.today.status === "UNROSTERED" ? "Not rostered" : undefined}
          />
        ),
    },
    {
      id: "duty",
      header: "Now",
      sortValue: r => (r.onDuty ? 0 : 1),
      cell: r => (
        <span className="inline-flex items-center gap-1.5 text-xs">
          <span
            className={cn(
              "size-2 rounded-full",
              r.onDuty ? "bg-success" : "bg-muted-foreground/40"
            )}
            aria-hidden="true"
          />
          {r.onDuty ? "On duty" : "Off duty"}
        </span>
      ),
    },
    {
      id: "phone",
      header: "Phone",
      cell: r => <span className="tabular-nums">{formatPhone(r.phone)}</span>,
    },
    { id: "email", header: "Email", defaultHidden: true, cell: r => r.email },
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
        title="Staff"
        subtitle="One staff master used by every module — the same people appear as doctors in OPD, owners of complaints and shifts on the roster."
        actions={
          <>
            <Button asChild variant="outline">
              <Link href="/wfm/roster">
                <CalendarDays className="size-4" />
                Roster
              </Link>
            </Button>
            {can("wfm.manage") ? (
              <Button onClick={() => setCreateOpen(true)}>
                <Plus className="size-4" />
                Add staff
              </Button>
            ) : null}
          </>
        }
      />
      <ErrorBanner error={error} />
      <section className="grid-auto-fit-sm gap-3">
        <StatCard
          label="Active staff"
          value={all.filter(s => s.status === "ACTIVE").length}
          icon={UsersThree}
          loading={isLoading}
          hint={`${all.length} on the master`}
        />
        <StatCard
          label="On duty now"
          value={onDuty}
          icon={UserCheck}
          loading={isLoading}
          tone="positive"
        />
        <StatCard
          label="Doctors rostered today"
          value={doctorsToday}
          loading={isLoading}
          tone="info"
        />
        <StatCard
          label="On leave today"
          value={onLeave}
          loading={isLoading}
          tone={onLeave ? "warning" : "neutral"}
        />
      </section>
      <Panel flush>
        <DataTable
          columns={columns}
          rows={rows}
          keyOf={r => r.id}
          isLoading={isLoading}
          initialSort={{ id: "department", direction: "asc" }}
          pageSize={15}
          onRowClick={r => setOpenId(r.id)}
          toolbar={
            <>
              <SearchInput
                wrapperClassName="min-w-48 flex-1"
                placeholder="Name, staff ID or designation"
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
                className="w-full sm:w-44"
                aria-label="Role"
                value={role}
                onChange={e => setRole(e.target.value)}
              >
                <option value="">All roles</option>
                {STAFF_ROLES.map(r => (
                  <option key={r} value={r}>
                    {roleLabel(r)}
                  </option>
                ))}
              </SelectField>
            </>
          }
        />
      </Panel>
      <StaffSheet id={openId} onClose={() => setOpenId(null)} />
      <StaffDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSaved={id => setOpenId(id)}
      />
    </PageShell>
  );
}

const SHIFT_TONE: Record<string, string> = {
  M: "bg-info-surface text-info-foreground border-info-border",
  E: "bg-warning-surface text-warning-foreground border-warning-border",
  N: "bg-secondary text-foreground border-border-strong",
  G: "bg-success-surface text-success-foreground border-success-border",
};

function StaffSheet({
  id,
  onClose,
}: {
  id: string | null;
  onClose: () => void;
}) {
  const { can, staff: me } = useSession();
  const { data } = useStaffProfile(id);
  const [editOpen, setEditOpen] = React.useState(false);
  const [photoOpen, setPhotoOpen] = React.useState(false);
  const setStatus = useAction(
    "wfm.setStaffStatus",
    (status: StaffStatus) => ({ staffId: id!, status }),
    { success: (_, s) => `Marked ${humanize(s).toLowerCase()}` }
  );
  const setPhoto = useAction(
    "wfm.setStaffPhoto",
    (upload: PreparedUpload) => ({
      staffId: id!,
      photo: { name: upload.name, data: upload.data },
    }),
    { success: "Photo saved" }
  );
  const removePhoto = useAction(
    "wfm.removeStaffPhoto",
    () => ({ staffId: id! }),
    { success: "Photo removed" }
  );
  const manage = can("wfm.manage");
  return (
    <Sheet open={Boolean(id)} onOpenChange={open => !open && onClose()}>
      <SheetContent size="md">
        {data ? (
          <>
            <SheetHeader>
              <div className="flex items-center gap-3">
                {manage ? (
                  <button
                    type="button"
                    onClick={() => setPhotoOpen(true)}
                    aria-label={data.photoFileId ? "Change photo" : "Add photo"}
                    className="shrink-0 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                  >
                    <PersonPhoto
                      fileId={data.photoFileId}
                      name={data.name}
                      className="size-14 rounded-xl text-base"
                    />
                  </button>
                ) : (
                  <PersonPhoto
                    fileId={data.photoFileId}
                    name={data.name}
                    className="size-14 rounded-xl text-base"
                  />
                )}
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <SheetTitle>{data.name}</SheetTitle>
                    <StatusBadge status={data.staff.status} />
                    {data.onDuty ? (
                      <Tag tone="active" dot>
                        On duty
                      </Tag>
                    ) : null}
                  </div>
                  <SheetDescription>
                    {data.staff.designation} · {data.department}
                  </SheetDescription>
                </div>
              </div>
            </SheetHeader>
            <SheetBody className="space-y-4">
              <DetailGrid columns={2}>
                <DetailRow
                  label="Staff ID"
                  value={
                    <RefCode className="text-foreground">
                      {data.staff.staffCode}
                    </RefCode>
                  }
                />
                <DetailRow label="Role" value={roleLabel(data.staff.role)} />
                {data.staff.specialisation ? (
                  <DetailRow
                    label="Specialisation"
                    value={data.staff.specialisation}
                  />
                ) : null}
                {data.staff.qualification ? (
                  <DetailRow
                    label="Qualification"
                    value={data.staff.qualification}
                  />
                ) : null}
                <DetailRow
                  label="Phone"
                  value={formatPhone(data.staff.phone)}
                />
                <DetailRow label="Email" value={data.staff.email} />
                <DetailRow
                  label="Joined"
                  value={`${formatDate(data.staff.joinedOn)} (${data.tenureYears} y)`}
                />
              </DetailGrid>
              {data.activity.length ? (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {data.activity.map(a => (
                    <div
                      key={a.label}
                      className="rounded-lg border border-border bg-surface-subtle px-3 py-2"
                    >
                      <p className="text-xs text-muted-foreground">{a.label}</p>
                      <p className="mt-0.5 text-lg font-semibold tabular-nums">
                        {a.label.includes("fee") ? formatINR(a.value) : a.value}
                      </p>
                    </div>
                  ))}
                </div>
              ) : null}
              <div>
                <p className="mb-1.5 text-[0.6875rem] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                  Next 7 days
                </p>
                <div className="grid grid-cols-7 gap-1">
                  {data.week.map(d => (
                    <div
                      key={d.date}
                      className={cn(
                        "rounded-md border px-1 py-1.5 text-center",
                        d.status === "SCHEDULED" && d.shift
                          ? SHIFT_TONE[d.shift]
                          : "border-border text-muted-foreground"
                      )}
                    >
                      <p className="text-[0.625rem] font-medium uppercase">
                        {new Date(`${d.date}T00:00:00`).toLocaleDateString(
                          "en-GB",
                          { weekday: "short" }
                        )}
                      </p>
                      <p className="text-[0.6875rem]">
                        {formatDateShort(d.date).split(" ")[0]}
                      </p>
                      <p className="mt-0.5 text-xs font-semibold">
                        {d.status === "SCHEDULED"
                          ? d.shift
                          : d.status === "LEAVE"
                            ? "Leave"
                            : "Off"}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </SheetBody>
            {manage ? (
              <SheetFooter>
                <Button variant="outline" onClick={() => setEditOpen(true)}>
                  <Edit className="size-4" />
                  Edit details
                </Button>
                {data.staff.status !== "ACTIVE" ? (
                  <Button onClick={() => setStatus.mutate("ACTIVE")}>
                    Mark active
                  </Button>
                ) : null}
                {data.staff.status === "ACTIVE" ? (
                  <Button
                    variant="outline"
                    onClick={() => setStatus.mutate("ON_LEAVE")}
                  >
                    Mark on leave
                  </Button>
                ) : null}
                {data.staff.status !== "INACTIVE" &&
                data.staff.id !== me?.id ? (
                  <Button
                    variant="outline"
                    className="text-error-foreground"
                    onClick={() => setStatus.mutate("INACTIVE")}
                  >
                    Deactivate
                  </Button>
                ) : null}
              </SheetFooter>
            ) : null}
            <StaffDialog
              open={editOpen}
              onOpenChange={setEditOpen}
              staff={data.staff}
            />
            <PhotoDialog
              open={photoOpen}
              onOpenChange={setPhotoOpen}
              name={data.name}
              fileId={data.photoFileId}
              onSave={upload => setPhoto.mutateAsync(upload)}
              onRemove={() => removePhoto.mutateAsync()}
              saving={setPhoto.isPending}
              removing={removePhoto.isPending}
            />
          </>
        ) : (
          <SheetBody>
            <SheetTitle className="sr-only">Loading</SheetTitle>
          </SheetBody>
        )}
      </SheetContent>
    </Sheet>
  );
}

const blankStaff = {
  firstName: "",
  lastName: "",
  role: "NURSE" as StaffRole,
  departmentId: "",
  designation: "",
  specialisation: "",
  qualification: "",
  phone: "",
  email: "",
  consultationFee: "600",
};

/** Adds a staff member, or edits one when `staff` is given. */
function StaffDialog({
  open,
  onOpenChange,
  onSaved,
  staff,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: (id: string) => void;
  staff?: Staff;
}) {
  const { data: departments = [] } = useDepartments();
  const [form, setForm] = React.useState(blankStaff);
  React.useEffect(() => {
    if (!open) return;
    setForm(
      staff
        ? {
            firstName: staff.firstName,
            lastName: staff.lastName,
            role: staff.role,
            departmentId: staff.departmentId,
            designation: staff.designation,
            specialisation: staff.specialisation ?? "",
            qualification: staff.qualification ?? "",
            phone: staff.phone,
            email: staff.email,
            consultationFee: String(staff.consultationFee ?? 600),
          }
        : blankStaff
    );
  }, [open, staff]);
  const set = (key: keyof typeof form, value: string) =>
    setForm(c => ({ ...c, [key]: value }));
  const details = () => ({
    firstName: form.firstName,
    lastName: form.lastName,
    departmentId: form.departmentId,
    designation: form.designation,
    specialisation: form.specialisation,
    qualification: form.qualification,
    phone: form.phone,
    email: form.email,
    consultationFee:
      form.role === "DOCTOR" ? Number(form.consultationFee) : undefined,
  });
  const create = useAction(
    "wfm.createStaff",
    () => ({ ...details(), role: form.role }),
    {
      success: s => `${s.firstName} ${s.lastName} added as ${s.staffCode}`,
      onSuccess: s => {
        onOpenChange(false);
        onSaved?.(s.id);
      },
    }
  );
  const update = useAction(
    "wfm.updateStaff",
    () => ({ ...details(), staffId: staff!.id }),
    {
      success: s => `Details updated for ${s.firstName} ${s.lastName}`,
      onSuccess: () => onOpenChange(false),
    }
  );
  const save = staff ? update : create;
  const invalid =
    !form.firstName.trim() ||
    !form.lastName.trim() ||
    !form.departmentId ||
    !form.designation.trim() ||
    form.phone.replace(/\D/g, "").length !== 10 ||
    !form.email.includes("@");
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={
        staff ? `Edit ${staff.firstName} ${staff.lastName}` : "Add staff member"
      }
      description={
        staff
          ? `${staff.staffCode} · the job role stays; a different job is a new staff record.`
          : "New staff appear in rosters immediately. Roster their shifts from the Roster page."
      }
      size="lg"
      submitLabel={staff ? "Save changes" : "Add staff"}
      isSubmitting={save.isPending}
      submitDisabled={invalid}
      onSubmit={event => {
        event.preventDefault();
        save.mutate();
      }}
      bodyClassName="gap-5"
    >
      <FormSection title="Person">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="First name" required>
            <Input
              value={form.firstName}
              onChange={e => set("firstName", e.target.value)}
            />
          </Field>
          <Field label="Last name" required>
            <Input
              value={form.lastName}
              onChange={e => set("lastName", e.target.value)}
            />
          </Field>
          <Field label="Mobile" required>
            <Input
              inputMode="tel"
              value={form.phone}
              onChange={e => set("phone", e.target.value)}
            />
          </Field>
          <Field label="Email" required>
            <Input
              type="email"
              value={form.email}
              onChange={e => set("email", e.target.value)}
            />
          </Field>
        </div>
      </FormSection>
      <FormSection title="Position">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Role">
            <SelectField
              value={form.role}
              disabled={Boolean(staff)}
              onChange={e => set("role", e.target.value)}
            >
              {STAFF_ROLES.map(r => (
                <option key={r} value={r}>
                  {roleLabel(r)}
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
          <Field label="Designation" required>
            <Input
              value={form.designation}
              onChange={e => set("designation", e.target.value)}
              placeholder="e.g. Staff Nurse"
            />
          </Field>
          <Field label="Qualification">
            <Input
              value={form.qualification}
              onChange={e => set("qualification", e.target.value)}
            />
          </Field>
          {form.role === "DOCTOR" ? (
            <>
              <Field label="Specialisation">
                <Input
                  value={form.specialisation}
                  onChange={e => set("specialisation", e.target.value)}
                />
              </Field>
              <Field label="Consultation fee (₹)">
                <Input
                  type="number"
                  min={0}
                  value={form.consultationFee}
                  onChange={e => set("consultationFee", e.target.value)}
                />
              </Field>
            </>
          ) : null}
        </div>
      </FormSection>
    </FormDialog>
  );
}
