"use client";

import { useParams } from "next/navigation";

import { PrintDocument, PrintField } from "@/components/shared/print-document";
import {
  EmptyState,
  PageShell,
  PanelRowsSkeleton,
} from "@/components/shared/page";
import { useVisit } from "@/features/opd/api";
import { pdfName } from "@/lib/pdf/layout";
import { prescriptionPdf } from "@/lib/pdf/records";
import { CONSULTATION_VALIDITY_DAYS } from "@/lib/domain/opd";
import {
  formatDate,
  formatDateTime,
  formatGender,
  humanize,
} from "@/lib/format";

const FREQUENCY_TEXT: Record<string, string> = {
  OD: "Once a day",
  BD: "Twice a day",
  TDS: "Three times a day",
  QID: "Four times a day",
  HS: "At bedtime",
  SOS: "When required",
  STAT: "Immediately",
};

/**
 * The OPD prescription (Rx) and consultation summary on the hospital
 * letterhead — what the patient takes home and the pharmacy dispenses from.
 */
export default function PrescriptionPrint() {
  const { id } = useParams<{ id: string }>();
  const { data: visit, isLoading } = useVisit(id);

  if (isLoading)
    return (
      <PageShell>
        <PanelRowsSkeleton rows={10} />
      </PageShell>
    );
  if (!visit)
    return (
      <PageShell>
        <EmptyState
          title="Visit not found"
          description="The consultation may belong to another patient record."
        />
      </PageShell>
    );

  const { encounter, patient, doctor, appointment } = visit;
  const vitals = encounter.vitals;
  const items = visit.prescriptions
    .filter(p => p.status !== "CANCELLED")
    .flatMap(p => p.items.filter(i => i.status !== "CANCELLED"));
  const tests = visit.labOrders
    .filter(o => o.status !== "CANCELLED")
    .flatMap(o => o.tests.map(t => t.name));

  return (
    <PrintDocument
      pdf={{
        fileName: pdfName("Prescription", encounter.code),
        build: () => prescriptionPdf(visit),
      }}
      title="Prescription"
      reference={`${encounter.code}${appointment?.tokenNumber ? ` · token ${appointment.tokenNumber}` : ""}`}
      footer={
        <div className="pt-8">
          <p className="border-t border-neutral-400 pt-1 font-medium text-neutral-800">
            {doctor.name}
          </p>
          <p>
            {[doctor.qualification, doctor.specialisation]
              .filter(Boolean)
              .join(" · ") || doctor.designation}
          </p>
          <p>{doctor.department}</p>
        </div>
      }
    >
      <section className="grid grid-cols-2 gap-x-8 gap-y-3 sm:grid-cols-4">
        <PrintField
          label="Patient"
          value={`${patient.firstName} ${patient.lastName}`}
        />
        <PrintField label="UHID" value={patient.uhid} />
        <PrintField
          label="Age / sex"
          value={`${patient.age} y / ${formatGender(patient.gender)}`}
        />
        <PrintField label="Date" value={formatDateTime(encounter.startedAt)} />
        <PrintField
          label="Allergies"
          value={patient.allergies.join(", ") || "None known"}
        />
        <PrintField
          label="Vitals"
          value={
            vitals
              ? [
                  vitals.temperatureC !== undefined &&
                    `T ${vitals.temperatureC} °C`,
                  vitals.pulse !== undefined && `P ${vitals.pulse}/min`,
                  vitals.systolic !== undefined &&
                    `BP ${vitals.systolic}/${vitals.diastolic ?? "—"}`,
                  vitals.spo2 !== undefined && `SpO₂ ${vitals.spo2}%`,
                  vitals.weightKg !== undefined && `Wt ${vitals.weightKg} kg`,
                ]
                  .filter(Boolean)
                  .join(" · ")
              : "Not recorded"
          }
        />
      </section>

      <PrintField label="Chief complaint" value={encounter.chiefComplaint} />
      {encounter.diagnoses.length ? (
        <PrintField
          label="Diagnosis"
          value={encounter.diagnoses
            .map(
              d =>
                `${d.description}${d.code ? ` (${d.code})` : ""}${d.type === "PROVISIONAL" ? " — provisional" : ""}`
            )
            .join("\n")}
        />
      ) : null}

      <div>
        <p className="font-display text-2xl font-bold italic text-neutral-800">
          ℞
        </p>
        {items.length ? (
          <table className="mt-1 w-full border-collapse text-left text-[12.5px]">
            <thead>
              <tr className="border-b border-neutral-400 text-[11px] uppercase tracking-wide text-neutral-500">
                <th className="py-1.5 pr-2 font-semibold">#</th>
                <th className="py-1.5 pr-2 font-semibold">Medicine</th>
                <th className="py-1.5 pr-2 font-semibold">Dose</th>
                <th className="py-1.5 pr-2 font-semibold">When</th>
                <th className="py-1.5 pr-2 font-semibold">Duration</th>
                <th className="py-1.5 text-right font-semibold">Qty</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, index) => (
                <tr
                  key={item.id}
                  className="border-b border-neutral-200 align-top"
                >
                  <td className="py-1.5 pr-2 tabular-nums">{index + 1}</td>
                  <td className="py-1.5 pr-2">
                    <span className="font-semibold">
                      {item.medicine} {item.strength}
                    </span>
                    <span className="block text-[11px] text-neutral-600">
                      {humanize(item.form)} · {humanize(item.route)}
                      {item.instructions ? ` · ${item.instructions}` : ""}
                    </span>
                  </td>
                  <td className="py-1.5 pr-2">{item.dose}</td>
                  <td className="py-1.5 pr-2">
                    {FREQUENCY_TEXT[item.frequency] ?? item.frequency}
                  </td>
                  <td className="py-1.5 pr-2 tabular-nums">
                    {item.durationDays} day{item.durationDays === 1 ? "" : "s"}
                  </td>
                  <td className="py-1.5 text-right tabular-nums">
                    {item.quantityPrescribed} {item.unit}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-neutral-600">No medicines prescribed.</p>
        )}
      </div>

      {tests.length ? (
        <PrintField label="Investigations advised" value={tests.join(", ")} />
      ) : null}
      <PrintField label="Advice" value={encounter.advice || "—"} />
      {encounter.followUpDate ? (
        <PrintField
          label="Review"
          value={`On ${formatDate(encounter.followUpDate)} — a review with the same doctor within ${CONSULTATION_VALIDITY_DAYS} days of this visit is free.`}
        />
      ) : null}
      {encounter.referral ? (
        <PrintField label="Referral" value={encounter.referral.note} />
      ) : null}
    </PrintDocument>
  );
}
