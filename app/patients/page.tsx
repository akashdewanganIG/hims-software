"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { Upload, UserPlus } from "@/components/icons";
import {
  BulkImportDialog,
  type ImportField,
} from "@/components/shared/bulk-import-dialog";
import { DataTable, type Column } from "@/components/shared/data-table";
import { PatientCell } from "@/components/shared/entity";
import {
  ErrorBanner,
  PageHeader,
  PageShell,
  Panel,
} from "@/components/shared/page";
import { Button } from "@/components/ui/button";
import { CategorySwitcher } from "@/components/ui/category-switcher";
import { SearchInput } from "@/components/ui/search-input";
import { Tag } from "@/components/ui/tag";
import {
  usePatients,
  type PatientFilter,
  type PatientRow,
} from "@/features/patients/api";
import { PatientFormDialog } from "@/features/patients/patient-form-dialog";
import { formatDate, formatINR, formatPhone } from "@/lib/format";
import { useAction } from "@/lib/api/client";
import { useSession } from "@/lib/session";
import {
  BLOOD_GROUPS,
  GENDERS,
  type BloodGroup,
  type Gender,
} from "@/lib/sim/schema";

const PATIENT_IMPORT_FIELDS: ImportField[] = [
  { key: "firstName", label: "First name", example: "Asha", required: true },
  { key: "lastName", label: "Last name", example: "Sharma", required: true },
  { key: "gender", label: "Gender", example: "FEMALE", required: true },
  {
    key: "dateOfBirth",
    label: "Date of birth",
    example: "1988-06-14",
    required: true,
    aliases: ["DOB"],
  },
  { key: "bloodGroup", label: "Blood group", example: "B+" },
  {
    key: "phone",
    label: "Mobile",
    example: "9876543210",
    required: true,
    aliases: ["Phone"],
  },
  { key: "email", label: "Email", example: "asha@example.com" },
  { key: "address", label: "Address", example: "12 MG Road", required: true },
  { key: "city", label: "City", example: "Bengaluru", required: true },
  {
    key: "emergencyContactName",
    label: "Emergency contact name",
    example: "Ravi Sharma",
    required: true,
  },
  {
    key: "emergencyContactPhone",
    label: "Emergency contact mobile",
    example: "9876501234",
    required: true,
  },
  { key: "allergies", label: "Allergies", example: "Penicillin; Latex" },
  {
    key: "chronicConditions",
    label: "Chronic conditions",
    example: "Hypertension",
  },
];

const splitList = (value: string) =>
  value
    .split(/[;,]/)
    .map(item => item.trim())
    .filter(Boolean);

export default function PatientsPage() {
  const router = useRouter();
  const { can } = useSession();
  const [q, setQ] = React.useState("");
  const [filter, setFilter] = React.useState<PatientFilter>("all");
  const [registerOpen, setRegisterOpen] = React.useState(false);
  const [importOpen, setImportOpen] = React.useState(false);
  const {
    data: rows = [],
    isLoading,
    error,
    refetch,
  } = usePatients({ q: q || undefined, filter });
  const importPatient = useAction(
    "patient.register",
    (values: Record<string, string>) => ({
      firstName: values.firstName!,
      lastName: values.lastName!,
      gender: values.gender!.toUpperCase() as Gender,
      dateOfBirth: values.dateOfBirth!,
      bloodGroup: values.bloodGroup
        ? (values.bloodGroup.toUpperCase() as BloodGroup)
        : undefined,
      phone: values.phone!,
      email: values.email || undefined,
      address: values.address!,
      city: values.city!,
      emergencyContactName: values.emergencyContactName!,
      emergencyContactPhone: values.emergencyContactPhone!,
      allergies: splitList(values.allergies ?? ""),
      chronicConditions: splitList(values.chronicConditions ?? ""),
    }),
    { silent: true }
  );

  const columns: Column<PatientRow>[] = [
    {
      id: "patient",
      header: "Patient",
      sortValue: r => r.patient.name,
      cell: r => <PatientCell patient={r.patient} />,
    },
    {
      id: "phone",
      header: "Mobile",
      cell: r => (
        <span className="tabular-nums">{formatPhone(r.patient.phone)}</span>
      ),
    },
    {
      id: "blood",
      header: "Blood",
      align: "center",
      cell: r => r.bloodGroup ?? "—",
    },
    { id: "city", header: "City", defaultHidden: true, cell: r => r.city },
    {
      id: "registered",
      header: "Registered",
      sortValue: r => r.registeredAt,
      cell: r => formatDate(r.registeredAt),
    },
    {
      id: "last",
      header: "Last visit",
      sortValue: r => r.lastVisit,
      cell: r => formatDate(r.lastVisit),
    },
    {
      id: "visits",
      header: "Encounters",
      align: "right",
      sortValue: r => r.visits,
      cell: r => r.visits,
    },
    {
      id: "status",
      header: "Status",
      cell: r =>
        r.inHouseAdmissionId ? (
          <Tag tone="progress">Admitted</Tag>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      id: "due",
      header: "Outstanding",
      align: "right",
      sortValue: r => r.outstanding,
      cell: r =>
        r.outstanding ? (
          <span className="font-semibold text-error-foreground">
            {formatINR(r.outstanding, true)}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
  ];

  return (
    <PageShell>
      <PageHeader
        title="Patient records"
        subtitle="One record per patient (UHID). Every visit, admission, prescription, result and bill links back here."
        actions={
          can("patient.register") ? (
            <>
              <Button variant="outline" onClick={() => setImportOpen(true)}>
                <Upload className="size-4" />
                Import
              </Button>
              <Button onClick={() => setRegisterOpen(true)}>
                <UserPlus className="size-4" />
                Register patient
              </Button>
            </>
          ) : null
        }
      />
      <ErrorBanner error={error} />
      <Panel flush>
        <DataTable
          columns={columns}
          rows={rows}
          keyOf={r => r.patient.id}
          isLoading={isLoading}
          initialSort={{ id: "last", direction: "desc" }}
          pageSize={15}
          onRowClick={r => router.push(`/patients/${r.patient.id}`)}
          empty="No patients match. Search by name, UHID or 10-digit mobile."
          toolbar={
            <>
              <SearchInput
                wrapperClassName="min-w-56 flex-1"
                placeholder="Name, UHID or mobile number"
                value={q}
                onChange={e => setQ(e.target.value)}
                autoFocus
              />
              <CategorySwitcher
                label="Patient filter"
                value={filter}
                onValueChange={setFilter}
                items={[
                  { value: "all", label: "All" },
                  { value: "inhouse", label: "Admitted" },
                  { value: "today", label: "Seen today" },
                  { value: "new", label: "New this month" },
                ]}
              />
            </>
          }
        />
      </Panel>
      <PatientFormDialog
        open={registerOpen}
        onOpenChange={setRegisterOpen}
        onSaved={p => router.push(`/patients/${p.id}`)}
      />
      <BulkImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        title="Import patients"
        description="Create new UHIDs from a reviewed spreadsheet. Existing clinical history, encounters and bills are never overwritten."
        fields={PATIENT_IMPORT_FIELDS}
        validate={values => {
          const errors: string[] = [];
          if (!GENDERS.includes(values.gender?.toUpperCase() as Gender))
            errors.push(`Gender must be ${GENDERS.join(", ")}.`);
          if (
            values.bloodGroup &&
            !BLOOD_GROUPS.includes(
              values.bloodGroup.toUpperCase() as BloodGroup
            )
          )
            errors.push(`Blood group must be ${BLOOD_GROUPS.join(", ")}.`);
          if (!/^\d{10}$/.test((values.phone ?? "").replace(/\D/g, "")))
            errors.push("Mobile must have 10 digits.");
          if (
            !/^\d{10}$/.test(
              (values.emergencyContactPhone ?? "").replace(/\D/g, "")
            )
          )
            errors.push("Emergency contact mobile must have 10 digits.");
          const dob = new Date(values.dateOfBirth ?? "");
          if (!Number.isFinite(dob.getTime()) || dob >= new Date())
            errors.push("Date of birth must be a valid past date.");
          return errors;
        }}
        importRow={values => importPatient.mutateAsync(values)}
        onComplete={() => void refetch()}
      />
    </PageShell>
  );
}
