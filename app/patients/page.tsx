"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { UserPlus } from "@/components/icons";
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
import { useSession } from "@/lib/session";

export default function PatientsPage() {
  const router = useRouter();
  const { can } = useSession();
  const [q, setQ] = React.useState("");
  const [filter, setFilter] = React.useState<PatientFilter>("all");
  const [registerOpen, setRegisterOpen] = React.useState(false);
  const {
    data: rows = [],
    isLoading,
    error,
  } = usePatients({ q: q || undefined, filter });

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
            <Button onClick={() => setRegisterOpen(true)}>
              <UserPlus className="size-4" />
              Register patient
            </Button>
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
    </PageShell>
  );
}
