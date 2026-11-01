"use client";

import * as React from "react";

import { CheckCircle2, Loader2Icon, Star } from "@/components/icons";
import { LogoPlaceholder } from "@/components/layout/logo-placeholder";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { formatDate } from "@/lib/format";
import { HOSPITAL } from "@/lib/sim/reference";
import { FEEDBACK_CATEGORIES, type FeedbackCategory } from "@/lib/sim/schema";
import { cn } from "@/lib/utils";

interface RequestContext {
  status: "READY" | "WHATSAPP_OPENED" | "SUBMITTED";
  process: "OPD_VISIT" | "IPD_DISCHARGE";
  processLabel: string;
  patientFirstName: string;
  department: string;
  doctor?: string;
  completedAt: string;
}

const LABELS: Record<FeedbackCategory, string> = {
  DOCTOR_CONSULTATION: "Doctor consultation",
  NURSING_CARE: "Nursing care",
  WAITING_TIME: "Waiting time",
  CLEANLINESS: "Cleanliness",
  BILLING: "Billing",
  FOOD: "Food",
  FRONT_DESK: "Front desk",
  PHARMACY: "Pharmacy",
  LAB: "Laboratory",
};

export function PublicFeedbackForm({ token }: { token: string }) {
  const [context, setContext] = React.useState<RequestContext>();
  const [loading, setLoading] = React.useState(true);
  const [submitting, setSubmitting] = React.useState(false);
  const [submitted, setSubmitted] = React.useState(false);
  const [error, setError] = React.useState<string>();
  const [rating, setRating] = React.useState(0);
  const [categories, setCategories] = React.useState<FeedbackCategory[]>([]);
  const [comments, setComments] = React.useState("");
  const [anonymous, setAnonymous] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    void fetch(`/api/public/feedback/${encodeURIComponent(token)}`, {
      cache: "no-store",
    })
      .then(async response => {
        const body = (await response.json()) as RequestContext & {
          error?: string;
        };
        if (!response.ok)
          throw new Error(body.error ?? "This link is not available.");
        if (!cancelled) {
          setContext(body);
          setSubmitted(body.status === "SUBMITTED");
        }
      })
      .catch(cause => {
        if (!cancelled)
          setError(
            cause instanceof Error
              ? cause.message
              : "This link is not available."
          );
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [token]);

  const options =
    context?.process === "IPD_DISCHARGE"
      ? FEEDBACK_CATEGORIES.filter(category =>
          [
            "DOCTOR_CONSULTATION",
            "NURSING_CARE",
            "CLEANLINESS",
            "BILLING",
            "FOOD",
          ].includes(category)
        )
      : FEEDBACK_CATEGORIES.filter(category => category !== "FOOD");

  const submit = async () => {
    if (!rating) return;
    setSubmitting(true);
    setError(undefined);
    try {
      const response = await fetch(
        `/api/public/feedback/${encodeURIComponent(token)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rating, categories, comments, anonymous }),
        }
      );
      const body = (await response.json()) as { error?: string };
      if (!response.ok)
        throw new Error(body.error ?? "Feedback could not be saved.");
      setSubmitted(true);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Feedback could not be saved."
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="min-h-svh bg-background px-4 py-8 sm:py-12">
      <div className="mx-auto max-w-2xl">
        <header className="mb-6 flex items-center gap-3">
          <LogoPlaceholder />
          <div>
            <p className="font-display text-lg font-bold">{HOSPITAL.name}</p>
            <p className="text-xs text-muted-foreground">Patient feedback</p>
          </div>
        </header>
        <section className="rounded-2xl border border-border bg-surface p-5 shadow-sm sm:p-8">
          {loading ? (
            <div className="py-20 text-center" role="status">
              <Loader2Icon className="mx-auto size-6 animate-spin text-primary" />
              <p className="mt-3 text-sm text-muted-foreground">
                Opening your feedback form…
              </p>
            </div>
          ) : error && !context ? (
            <div className="py-16 text-center">
              <h1 className="font-display text-xl font-semibold">
                Link unavailable
              </h1>
              <p className="mt-2 text-sm text-muted-foreground">{error}</p>
            </div>
          ) : submitted ? (
            <div className="py-16 text-center">
              <CheckCircle2 className="mx-auto size-10 text-success" />
              <h1 className="mt-4 font-display text-2xl font-semibold">
                Thank you
              </h1>
              <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">
                Your feedback has been recorded. If you asked us to follow up—or
                gave a low rating—our team will review it.
              </p>
            </div>
          ) : context ? (
            <div>
              <h1 className="font-display text-2xl font-semibold">
                How was your {context.processLabel}?
              </h1>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Hi {context.patientFirstName}, tell us about your experience
                with {context.department}
                {context.doctor ? ` and ${context.doctor}` : ""} on{" "}
                {formatDate(context.completedAt)}.
              </p>

              <div className="mt-8">
                <p className="text-sm font-medium">Overall rating</p>
                <div
                  className="mt-2 flex gap-1"
                  role="radiogroup"
                  aria-label="Overall rating"
                >
                  {[1, 2, 3, 4, 5].map(value => (
                    <button
                      key={value}
                      type="button"
                      role="radio"
                      aria-checked={rating === value}
                      aria-label={`${value} star${value === 1 ? "" : "s"}`}
                      onClick={() => setRating(value)}
                      className="rounded-lg p-1.5 outline-none hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring/40"
                    >
                      <Star
                        weight={value <= rating ? "fill" : "regular"}
                        className={cn(
                          "size-8",
                          value <= rating
                            ? "text-warning"
                            : "text-border-strong"
                        )}
                      />
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-7">
                <p className="text-sm font-medium">
                  What would you like to comment on?
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {options.map(category => {
                    const selected = categories.includes(category);
                    return (
                      <button
                        key={category}
                        type="button"
                        role="checkbox"
                        aria-checked={selected}
                        onClick={() =>
                          setCategories(current =>
                            selected
                              ? current.filter(item => item !== category)
                              : [...current, category]
                          )
                        }
                        className={cn(
                          "rounded-full border px-3 py-1.5 text-xs font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
                          selected
                            ? "border-primary bg-primary-surface text-primary-surface-foreground"
                            : "border-border bg-surface hover:border-border-strong"
                        )}
                      >
                        {LABELS[category]}
                      </button>
                    );
                  })}
                </div>
              </div>

              <label className="mt-7 block text-sm font-medium">
                Comments
                <Textarea
                  className="mt-2 min-h-28"
                  maxLength={4000}
                  value={comments}
                  onChange={event => setComments(event.target.value)}
                  placeholder="Tell us what went well or what we could improve."
                />
              </label>

              <label className="mt-5 flex items-start gap-2 text-sm text-muted-foreground">
                <input
                  type="checkbox"
                  className="mt-0.5 size-4 accent-primary"
                  checked={anonymous}
                  onChange={event => setAnonymous(event.target.checked)}
                />
                Submit anonymously. Your response will not be linked to your
                patient profile.
              </label>

              {error ? (
                <p className="mt-4 text-sm text-error-foreground" role="alert">
                  {error}
                </p>
              ) : null}
              <Button
                className="mt-7 w-full sm:w-auto"
                size="lg"
                disabled={!rating || submitting}
                onClick={() => void submit()}
              >
                {submitting ? "Submitting…" : "Submit feedback"}
              </Button>
              <p className="mt-4 text-xs leading-5 text-muted-foreground">
                This one-time link closes after your response is submitted.
              </p>
            </div>
          ) : null}
        </section>
      </div>
    </main>
  );
}
