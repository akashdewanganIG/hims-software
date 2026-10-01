"use client";

import * as React from "react";
import Link from "next/link";

import {
  ArrowRightLeft,
  BedIcon,
  Broom,
  Plus,
  Wrench,
} from "@/components/icons";
import { AllergyFlag, EntityLink } from "@/components/shared/entity";
import {
  DetailRow,
  ErrorBanner,
  Field,
  PageHeader,
  PageShell,
  Panel,
  PanelRowsSkeleton,
  SelectField,
  StatCard,
  StatusBadge,
} from "@/components/shared/page";
import { Button } from "@/components/ui/button";
import { CategorySwitcher } from "@/components/ui/category-switcher";
import { MagnitudeBars, RatioGauge } from "@/components/ui/chart-primitives";
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
import { useBedBoard, type BedTile } from "@/features/beds/api";
import { AdmitDialog } from "@/features/ipd/admit-dialog";
import { TransferDialog } from "@/features/ipd/dialogs";
import { useAction } from "@/lib/api/client";
import {
  formatDateShort,
  formatDateTime,
  formatDuration,
  formatINR,
  humanize,
} from "@/lib/format";
import { matches } from "@/lib/api/lookup";
import { useSession } from "@/lib/session";
import type { BedStatus } from "@/lib/sim/schema";
import { cn } from "@/lib/utils";

const STATUS_ORDER: BedStatus[] = [
  "AVAILABLE",
  "OCCUPIED",
  "RESERVED",
  "CLEANING",
  "MAINTENANCE",
];

const TILE_TONE: Record<BedStatus, string> = {
  AVAILABLE: "border-success-border bg-success-surface/60",
  OCCUPIED: "border-info-border bg-info-surface/60",
  RESERVED: "border-warning-border bg-warning-surface/70",
  CLEANING:
    "border-warning-border bg-warning-surface/40 [background-image:repeating-linear-gradient(135deg,transparent_0_6px,color-mix(in_srgb,var(--warning)_8%,transparent)_6px_12px)]",
  MAINTENANCE: "border-error-border bg-error-surface/60",
};

const DOT: Record<BedStatus, string> = {
  AVAILABLE: "bg-success",
  OCCUPIED: "bg-info",
  RESERVED: "bg-warning",
  CLEANING: "bg-warning/60",
  MAINTENANCE: "bg-error",
};

export default function BedsPage() {
  const { can } = useSession();
  const { data, isLoading, error } = useBedBoard();
  const [status, setStatus] = React.useState<BedStatus | "ALL">("ALL");
  const [floor, setFloor] = React.useState("");
  const [q, setQ] = React.useState("");
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [admitBed, setAdmitBed] = React.useState<string | null>(null);

  const totals = data?.totals;
  const occupied = totals?.OCCUPIED ?? 0;
  const occupancy = data?.total ? (occupied / data.total) * 100 : 0;
  const floors = [...new Set((data?.wards ?? []).map(w => w.floor))];
  const selected =
    data?.wards
      .flatMap(w => w.rooms.flatMap(r => r.beds))
      .find(b => b.id === selectedId) ?? null;

  const bedVisible = (bed: BedTile) =>
    (status === "ALL" || bed.status === status) &&
    (!q ||
      (bed.admission &&
        matches(
          q,
          bed.admission.patient.name,
          bed.admission.patient.uhid,
          bed.admission.code
        )) ||
      matches(q, bed.code));

  return (
    <PageShell>
      <PageHeader
        title="Bed management"
        subtitle="Live bed board. Occupancy is driven by admissions: admitting occupies a bed, transfer moves it, discharge releases it to cleaning."
        actions={
          can("ipd.admit") ? (
            <Button onClick={() => setAdmitBed("")}>
              <Plus className="size-4" />
              Admit patient
            </Button>
          ) : null
        }
      />
      <ErrorBanner error={error} />

      <section className="grid-auto-fit-sm gap-3" aria-label="Bed status">
        <StatCard
          label="Total beds"
          value={data?.total ?? 0}
          icon={BedIcon}
          loading={isLoading}
          hint={`${data?.wards.length ?? 0} wards`}
        />
        <StatCard
          label="Occupied"
          value={occupied}
          loading={isLoading}
          tone="info"
          hint={`${occupancy.toFixed(0)}% occupancy`}
        />
        <StatCard
          label="Available"
          value={totals?.AVAILABLE ?? 0}
          loading={isLoading}
          tone={(totals?.AVAILABLE ?? 0) < 4 ? "critical" : "positive"}
          hint="Ready for admission"
        />
        <StatCard
          label="Reserved"
          value={totals?.RESERVED ?? 0}
          loading={isLoading}
          hint="Transfers & planned"
        />
        <StatCard
          label="Cleaning"
          value={totals?.CLEANING ?? 0}
          loading={isLoading}
          tone={totals?.CLEANING ? "warning" : "neutral"}
          hint="Turnover in progress"
        />
        <StatCard
          label="Maintenance"
          value={totals?.MAINTENANCE ?? 0}
          loading={isLoading}
          tone={totals?.MAINTENANCE ? "critical" : "neutral"}
          hint="Out of service"
        />
      </section>

      <div className="grid items-stretch gap-4 lg:grid-cols-[18rem_minmax(0,1fr)_minmax(0,1fr)]">
        <Panel title="Occupancy">
          <RatioGauge
            value={occupancy}
            caption={`${occupied} of ${data?.total ?? 0} beds occupied`}
            emphasis={occupancy > 90 ? "warning" : "neutral"}
            className="py-1"
          />
        </Panel>
        <Panel title="Status mix">
          {totals ? (
            <StatusMix totals={totals} total={data?.total ?? 0} />
          ) : (
            <PanelRowsSkeleton rows={4} />
          )}
        </Panel>
        <Panel title="Occupancy by ward">
          {data ? (
            <MagnitudeBars
              data={data.wards.map(w => ({
                key: w.id,
                label: w.name,
                value: w.total ? (w.counts.OCCUPIED / w.total) * 100 : 0,
                display: `${w.counts.OCCUPIED}/${w.total}`,
                meta: humanize(w.category),
              }))}
            />
          ) : (
            <PanelRowsSkeleton rows={4} />
          )}
        </Panel>
      </div>

      <Panel
        flush
        title="Bed board"
        actions={
          <div className="flex w-full flex-wrap items-center gap-2 lg:justify-end">
            <SearchInput
              wrapperClassName="w-full sm:w-64"
              placeholder="Patient, UHID, ADM or bed"
              value={q}
              onChange={e => setQ(e.target.value)}
            />
            <SelectField
              className="w-full sm:w-36"
              aria-label="Floor"
              value={floor}
              onChange={e => setFloor(e.target.value)}
            >
              <option value="">All floors</option>
              {floors.map(f => (
                <option key={f} value={String(f)}>
                  {`Floor ${f}`}
                </option>
              ))}
            </SelectField>
            <CategorySwitcher
              label="Bed status"
              value={status}
              onValueChange={setStatus}
              items={[
                { value: "ALL" as const, label: "All", count: data?.total },
                ...STATUS_ORDER.map(s => ({
                  value: s,
                  label: humanize(s),
                  count: totals?.[s],
                })),
              ]}
            />
          </div>
        }
      >
        {isLoading ? (
          <div className="p-3">
            <PanelRowsSkeleton rows={6} />
          </div>
        ) : (
          <div className="divide-y divide-border">
            {data!.wards
              .filter(w => !floor || String(w.floor) === floor)
              .map(ward => {
                const beds = ward.rooms.flatMap(r => r.beds).filter(bedVisible);
                if (!beds.length) return null;
                return (
                  <section
                    key={ward.id}
                    aria-labelledby={`ward-${ward.id}`}
                    className="p-3"
                  >
                    <header className="mb-2.5 flex flex-wrap items-baseline justify-between gap-2">
                      <div className="flex items-baseline gap-2">
                        <h3
                          id={`ward-${ward.id}`}
                          className="text-[0.8125rem] font-semibold"
                        >
                          {ward.name}
                        </h3>
                        <span className="text-xs text-muted-foreground">
                          Floor {ward.floor} · {humanize(ward.category)} ·{" "}
                          {formatINR(ward.dailyRate)}/day
                        </span>
                      </div>
                      <span className="text-xs tabular-nums text-muted-foreground">
                        {ward.counts.OCCUPIED}/{ward.total} occupied ·{" "}
                        {ward.counts.AVAILABLE} free
                      </span>
                    </header>
                    <div className="space-y-2">
                      {ward.rooms.map(room => {
                        const roomBeds = room.beds.filter(bedVisible);
                        if (!roomBeds.length) return null;
                        return (
                          <div
                            key={room.id}
                            className="flex flex-col gap-2 sm:flex-row sm:items-stretch"
                          >
                            <div className="flex w-16 shrink-0 items-center text-xs font-medium text-muted-foreground">
                              {ward.code === "HDU"
                                ? "Unit"
                                : `Room ${room.number}`}
                            </div>
                            <div className="grid flex-1 gap-2 [grid-template-columns:repeat(auto-fill,minmax(13.5rem,1fr))]">
                              {roomBeds.map(bed => (
                                <BedCard
                                  key={bed.id}
                                  bed={bed}
                                  onClick={() => setSelectedId(bed.id)}
                                />
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </section>
                );
              })}
          </div>
        )}
      </Panel>

      <BedSheet
        bed={selected}
        onClose={() => setSelectedId(null)}
        onAdmit={bedId => setAdmitBed(bedId)}
      />
      <AdmitDialog
        open={admitBed !== null}
        onOpenChange={open => !open && setAdmitBed(null)}
        prefill={admitBed ? { bedId: admitBed } : undefined}
      />
    </PageShell>
  );
}

/** Stacked status bar in the same colours as the bed tiles. */
function StatusMix({
  totals,
  total,
}: {
  totals: Record<BedStatus, number>;
  total: number;
}) {
  return (
    <div>
      <div
        className="flex h-3 w-full gap-0.5 overflow-hidden rounded-full bg-chart-track"
        role="img"
        aria-label={STATUS_ORDER.map(s => `${humanize(s)}: ${totals[s]}`).join(
          ", "
        )}
      >
        {STATUS_ORDER.filter(s => totals[s] > 0).map(s => (
          <span
            key={s}
            className={cn(
              "h-full first:rounded-l-full last:rounded-r-full",
              DOT[s]
            )}
            style={{ width: `${(totals[s] / Math.max(1, total)) * 100}%` }}
          />
        ))}
      </div>
      <ul className="mt-3 space-y-2">
        {STATUS_ORDER.map(s => (
          <li
            key={s}
            className="flex items-center justify-between gap-3 text-sm"
          >
            <span className="flex items-center gap-2">
              <span
                className={cn("size-2.5 rounded-sm", DOT[s])}
                aria-hidden="true"
              />
              {humanize(s)}
            </span>
            <span className="font-medium tabular-nums text-muted-foreground">
              {totals[s]}{" "}
              <span className="text-xs">
                ({total ? Math.round((totals[s] / total) * 100) : 0}%)
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function BedCard({ bed, onClick }: { bed: BedTile; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex min-h-[4.75rem] min-w-0 flex-col rounded-lg border p-2.5 text-left outline-none transition-[box-shadow,border-color] duration-150 hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring/30",
        TILE_TONE[bed.status]
      )}
      aria-label={`Bed ${bed.code}, ${humanize(bed.status)}${bed.admission ? `, ${bed.admission.patient.name}` : ""}`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-[0.8125rem] font-semibold">
          <span
            className={cn("size-2 rounded-full", DOT[bed.status])}
            aria-hidden="true"
          />
          {bed.code}
        </span>
        <span className="text-[0.6875rem] font-medium text-muted-foreground">
          {humanize(bed.status)}
        </span>
      </div>
      {bed.status === "OCCUPIED" && bed.admission ? (
        <div className="mt-1 min-w-0">
          <p className="flex items-center gap-1 truncate text-[0.8125rem] font-medium text-foreground">
            <span className="truncate">{bed.admission.patient.name}</span>
            <AllergyFlag allergies={bed.admission.patient.allergies} />
          </p>
          <p className="truncate text-[0.6875rem] text-muted-foreground">
            {bed.admission.code} · day {bed.admission.days} ·{" "}
            {bed.admission.doctor.replace("Dr ", "Dr ")}
          </p>
          {bed.admission.status !== "ACTIVE" &&
          bed.admission.status !== "ADMITTED" ? (
            <p className="mt-0.5 text-[0.6875rem] font-medium text-warning-foreground">
              {humanize(bed.admission.status)}
            </p>
          ) : null}
        </div>
      ) : bed.status === "RESERVED" ? (
        <p className="mt-1 line-clamp-2 text-[0.6875rem] text-warning-foreground">
          {bed.admission
            ? `Held for transfer of ${bed.admission.patient.name}`
            : bed.note}
        </p>
      ) : bed.status === "CLEANING" ? (
        <p className="mt-1 text-[0.6875rem] text-muted-foreground">
          Cleaning for {formatDuration(bed.hoursInStatus * 60)}
        </p>
      ) : bed.status === "MAINTENANCE" ? (
        <p className="mt-1 line-clamp-2 text-[0.6875rem] text-error-foreground">
          {bed.note}
        </p>
      ) : (
        <p className="mt-1 text-[0.6875rem] text-success-foreground">
          Ready · {formatINR(bed.dailyRate)}/day
        </p>
      )}
    </button>
  );
}

function BedSheet({
  bed,
  onClose,
  onAdmit,
}: {
  bed: BedTile | null;
  onClose: () => void;
  onAdmit: (bedId: string) => void;
}) {
  const { can } = useSession();
  const [transferOpen, setTransferOpen] = React.useState(false);
  const [noteFor, setNoteFor] = React.useState<
    "MAINTENANCE" | "RESERVE" | null
  >(null);
  const [note, setNote] = React.useState("");
  const housekeeping = useAction(
    "beds.setHousekeeping",
    (v: {
      status: "AVAILABLE" | "CLEANING" | "MAINTENANCE";
      note?: string;
    }) => ({
      bedId: bed!.id,
      status: v.status,
      note: v.note,
    }),
    {
      success: (_, v) =>
        `Bed ${bed?.code} marked ${humanize(v.status).toLowerCase()}`,
    }
  );
  const reserve = useAction(
    "beds.reserve",
    (text: string) => ({ bedId: bed!.id, note: text }),
    { success: `Bed ${bed?.code} reserved` }
  );
  const manage = can("beds.housekeeping");

  return (
    <>
      <Sheet open={Boolean(bed)} onOpenChange={open => !open && onClose()}>
        <SheetContent size="md">
          {bed ? (
            <>
              <SheetHeader>
                <div className="flex items-center gap-2">
                  <SheetTitle>Bed {bed.code}</SheetTitle>
                  <StatusBadge status={bed.status} />
                </div>
                <SheetDescription>
                  {bed.ward} ·{" "}
                  {bed.wardCode === "HDU" ? "unit" : `room ${bed.room}`} · floor{" "}
                  {bed.floor} · {formatINR(bed.dailyRate)}/day
                </SheetDescription>
              </SheetHeader>
              <SheetBody className="space-y-4">
                {bed.admission ? (
                  <div className="rounded-lg border border-border p-3">
                    <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                      {bed.status === "OCCUPIED"
                        ? "Current patient"
                        : "Held for"}
                    </p>
                    <div className="mt-1.5 grid grid-cols-2 gap-x-4">
                      <DetailRow
                        label="Patient"
                        value={
                          <EntityLink
                            href={`/patients/${bed.admission.patient.id}`}
                            module="ehr"
                          >
                            {bed.admission.patient.name}
                          </EntityLink>
                        }
                      />
                      <DetailRow
                        label="UHID"
                        value={
                          <span className="font-mono text-xs">
                            {bed.admission.patient.uhid}
                          </span>
                        }
                      />
                      <DetailRow
                        label="Admission"
                        value={
                          <EntityLink
                            href={`/ipd/${bed.admission.id}`}
                            module="ipd"
                          >
                            {bed.admission.code}
                          </EntityLink>
                        }
                      />
                      <DetailRow
                        label="Consultant"
                        value={bed.admission.doctor}
                      />
                      <DetailRow
                        label="Admitted"
                        value={formatDateTime(bed.admission.admittedAt)}
                      />
                      <DetailRow
                        label="Stay"
                        value={`Day ${bed.admission.days}`}
                      />
                    </div>
                  </div>
                ) : bed.note ? (
                  <DetailRow label="Note" value={bed.note} />
                ) : null}
                <DetailRow
                  label="In this status since"
                  value={`${formatDateTime(bed.statusChangedAt)} (${formatDuration(bed.hoursInStatus * 60)})`}
                />
                {bed.status === "OCCUPIED" ? (
                  <p className="text-xs text-muted-foreground">
                    An occupied bed is released only by transferring or
                    discharging the patient, so bed and admission never
                    disagree.
                  </p>
                ) : null}
                <div>
                  <p className="mb-1.5 text-[0.6875rem] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                    Recent occupancy
                  </p>
                  {bed.history.length ? (
                    <ul className="divide-y divide-border-subtle text-[0.8125rem]">
                      {bed.history.map(h => (
                        <li
                          key={h.id}
                          className="flex items-center justify-between gap-2 py-1.5"
                        >
                          <span className="min-w-0 truncate">
                            <EntityLink
                              href={`/ipd/${h.admissionId}`}
                              module="ipd"
                              className="font-normal"
                            >
                              {h.patient}
                            </EntityLink>{" "}
                            <span className="text-xs text-muted-foreground">
                              {h.admissionCode}
                            </span>
                          </span>
                          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                            {formatDateShort(h.fromAt)} –{" "}
                            {h.toAt ? formatDateShort(h.toAt) : "now"}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      No stays recorded.
                    </p>
                  )}
                </div>
              </SheetBody>
              <SheetFooter>
                {bed.status === "OCCUPIED" && bed.admission ? (
                  <>
                    <Button asChild variant="outline">
                      <Link href={`/ipd/${bed.admission.id}`}>
                        Open admission
                      </Link>
                    </Button>
                    {can("ipd.transfer") &&
                    (bed.admission.status === "ACTIVE" ||
                      bed.admission.status === "ADMITTED") ? (
                      <Button onClick={() => setTransferOpen(true)}>
                        <ArrowRightLeft className="size-4" />
                        Transfer patient
                      </Button>
                    ) : null}
                  </>
                ) : null}
                {bed.status === "RESERVED" && bed.admission ? (
                  <Button asChild>
                    <Link href={`/ipd/${bed.admission.id}`}>
                      Manage transfer
                    </Link>
                  </Button>
                ) : null}
                {bed.status === "RESERVED" && !bed.admission && manage ? (
                  <Button
                    variant="outline"
                    onClick={() => housekeeping.mutate({ status: "AVAILABLE" })}
                  >
                    Release reservation
                  </Button>
                ) : null}
                {(bed.status === "AVAILABLE" ||
                  (bed.status === "RESERVED" && !bed.admission)) &&
                can("ipd.admit") ? (
                  <Button onClick={() => onAdmit(bed.id)}>
                    Admit patient here
                  </Button>
                ) : null}
                {bed.status === "AVAILABLE" && manage ? (
                  <>
                    <Button
                      variant="outline"
                      onClick={() => setNoteFor("RESERVE")}
                    >
                      Reserve
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() =>
                        housekeeping.mutate({ status: "CLEANING" })
                      }
                    >
                      <Broom className="size-4" />
                      Mark cleaning
                    </Button>
                  </>
                ) : null}
                {(bed.status === "AVAILABLE" || bed.status === "CLEANING") &&
                manage ? (
                  <Button
                    variant="outline"
                    onClick={() => setNoteFor("MAINTENANCE")}
                  >
                    <Wrench className="size-4" />
                    Maintenance
                  </Button>
                ) : null}
                {(bed.status === "CLEANING" || bed.status === "MAINTENANCE") &&
                manage ? (
                  <Button
                    onClick={() => housekeeping.mutate({ status: "AVAILABLE" })}
                  >
                    Mark available
                  </Button>
                ) : null}
              </SheetFooter>
            </>
          ) : null}
        </SheetContent>
      </Sheet>
      {bed?.admission ? (
        <TransferDialog
          open={transferOpen}
          onOpenChange={setTransferOpen}
          admissionId={bed.admission.id}
          currentBed={`${bed.ward} · ${bed.code}`}
          patient={{
            gender: bed.admission.patient.gender,
            age: bed.admission.patient.age,
          }}
        />
      ) : null}
      <FormDialog
        open={noteFor !== null}
        onOpenChange={open => {
          if (!open) {
            setNoteFor(null);
            setNote("");
          }
        }}
        title={
          noteFor === "RESERVE"
            ? `Reserve bed ${bed?.code ?? ""}`
            : `Take bed ${bed?.code ?? ""} out of service`
        }
        size="sm"
        submitLabel={noteFor === "RESERVE" ? "Reserve" : "Mark maintenance"}
        submitDisabled={!note.trim()}
        onSubmit={event => {
          event.preventDefault();
          if (noteFor === "RESERVE") reserve.mutate(note);
          else housekeeping.mutate({ status: "MAINTENANCE", note });
          setNoteFor(null);
          setNote("");
        }}
      >
        <Field
          label={noteFor === "RESERVE" ? "Reserved for" : "Issue"}
          required
        >
          <Input
            autoFocus
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder={
              noteFor === "RESERVE"
                ? "e.g. Elective admission tomorrow — Dr Joshi"
                : "e.g. Side rail broken"
            }
          />
        </Field>
      </FormDialog>
    </>
  );
}
