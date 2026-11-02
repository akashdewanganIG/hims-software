"use client";

import * as React from "react";
import {
  Activity,
  CheckCircle2,
  RefreshCw,
  RotateCcw,
  Search,
} from "@/components/icons";
import {
  Field,
  PageHeader,
  PageShell,
  Panel,
  StatCard,
  StatusBadge,
} from "@/components/shared/page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tag } from "@/components/ui/tag";
import { useIntegrationsPreview } from "@/features/integrations/use-integrations-preview";
import { formatDateTime, humanize } from "@/lib/format";
import {
  INTEGRATION_CATEGORIES,
  INTEGRATION_PROVIDERS,
  type IntegrationCategory,
  type IntegrationProvider,
} from "@/lib/integrations-preview";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";

function ProviderCard({
  provider,
  selected,
  status,
  enabled,
  onSelect,
}: {
  provider: IntegrationProvider;
  selected: boolean;
  status: string;
  enabled: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        "w-full overflow-hidden rounded-xl border bg-card p-4 text-left shadow-sm transition hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        selected && "border-primary ring-2 ring-primary/10"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold truncate">{provider.name}</h3>
          <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
            {provider.description}
          </p>
        </div>
        <div className="shrink-0">
          <StatusBadge status={status} />
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-1">
        {provider.capabilities.map(capability => (
          <Tag key={capability} tone="neutral" className="max-w-full truncate">
            {capability}
          </Tag>
        ))}
      </div>
      <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
        <span className="truncate">{provider.environment}</span>
        <span className="shrink-0">{enabled ? "Enabled" : "Disabled"}</span>
      </div>
    </button>
  );
}

export default function IntegrationsPage() {
  const { state, ready, update, addLog, reset } = useIntegrationsPreview();
  const [category, setCategory] = React.useState<IntegrationCategory | "ALL">(
    "ALL"
  );
  const [query, setQuery] = React.useState("");
  const [selectedId, setSelectedId] = React.useState("ocr-tesseract");
  const [credentialDraft, setCredentialDraft] = React.useState<
    Record<string, string>
  >({});
  const selected =
    INTEGRATION_PROVIDERS.find(provider => provider.id === selectedId) ??
    INTEGRATION_PROVIDERS[0]!;
  const selectedState = state.providers[selected.id];
  const visible = INTEGRATION_PROVIDERS.filter(
    provider =>
      (category === "ALL" || provider.category === category) &&
      `${provider.name} ${provider.description} ${provider.capabilities.join(" ")}`
        .toLowerCase()
        .includes(query.toLowerCase())
  );
  const connected = Object.values(state.providers).filter(
    provider => provider.status === "CONNECTED"
  ).length;
  const patchProvider = (
    providerId: string,
    patch: Partial<(typeof state.providers)[string]>
  ) =>
    update(current => ({
      ...current,
      providers: {
        ...current.providers,
        [providerId]: {
          ...(current.providers[providerId] ?? {
            status: "DISCONNECTED",
            enabled: false,
            configured: false,
          }),
          ...patch,
        },
      },
    }));

  const connect = () => {
    patchProvider(selected.id, {
      configured: true,
      status: "CONNECTED",
      enabled: true,
      lastCheckedAt: new Date().toISOString(),
    });
    setCredentialDraft({});
    addLog(
      selected.id,
      "SUCCESS",
      "Preview configuration saved with masked placeholder flags; credential values were discarded."
    );
    toast.success(`${selected.name} connected in preview mode`);
  };
  const test = () => {
    patchProvider(selected.id, { status: "TESTING" });
    addLog(selected.id, "INFO", "Simulated connection test queued.");
    window.setTimeout(() => {
      const success = selected.id === "ocr-tesseract" || Math.random() > 0.2;
      patchProvider(selected.id, {
        status: success ? "CONNECTED" : "DEGRADED",
        lastCheckedAt: new Date().toISOString(),
      });
      addLog(
        selected.id,
        success ? "SUCCESS" : "ERROR",
        success
          ? "Simulated health check completed successfully."
          : "Simulated provider timeout. Retry is available."
      );
      if (success) {
        toast.success("Simulated connection test passed");
      } else {
        toast.error("Simulated test failed — no provider call was made");
      }
    }, 850);
  };

  return (
    <PageShell>
      <PageHeader
        title="API integrations"
        subtitle="Configure and exercise realistic provider workflows without sending credentials or making external calls."
        actions={
          <Button
            variant="outline"
            onClick={() => {
              reset();
              setCredentialDraft({});
              toast.success("Preview state reset");
            }}
          >
            <RotateCcw />
            Reset preview
          </Button>
        }
      />
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard
          label="Providers"
          value={INTEGRATION_PROVIDERS.length}
          hint="Across seven integration groups"
        />
        <StatCard
          label="Connected previews"
          value={ready ? connected : "—"}
          hint="Tesseract is always connected"
        />
        <StatCard
          label="Recent activity"
          value={state.logs.length}
          hint="Versioned local demo events"
        />
      </div>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.7fr)_minmax(340px,1fr)]">
        <div className="space-y-3">
          <Panel>
            <div className="flex flex-col gap-3">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="pl-9"
                  value={query}
                  onChange={event => setQuery(event.target.value)}
                  placeholder="Search providers or capabilities"
                  aria-label="Search integration providers"
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant={category === "ALL" ? "default" : "outline"}
                  onClick={() => setCategory("ALL")}
                >
                  All
                </Button>
                {INTEGRATION_CATEGORIES.map(item => (
                  <Button
                    key={item.id}
                    size="sm"
                    variant={category === item.id ? "default" : "outline"}
                    onClick={() => setCategory(item.id)}
                  >
                    {item.label}
                  </Button>
                ))}
              </div>
            </div>
          </Panel>
          {visible.length ? (
            <div className="grid gap-3 md:grid-cols-2">
              {visible.map(provider => (
                <ProviderCard
                  key={provider.id}
                  provider={provider}
                  selected={selected.id === provider.id}
                  status={
                    state.providers[provider.id]?.status ?? "DISCONNECTED"
                  }
                  enabled={state.providers[provider.id]?.enabled ?? false}
                  onSelect={() => {
                    setSelectedId(provider.id);
                    setCredentialDraft({});
                  }}
                />
              ))}
            </div>
          ) : (
            <Panel>
              <div className="py-12 text-center">
                <p className="font-medium">No integrations match this search</p>
                <Button
                  className="mt-3"
                  variant="outline"
                  onClick={() => {
                    setQuery("");
                    setCategory("ALL");
                  }}
                >
                  Clear filters
                </Button>
              </div>
            </Panel>
          )}
        </div>
        <div className="space-y-3">
          <Panel
            title={selected.name}
            description="Configuration values exist only until this page is refreshed."
          >
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-muted-foreground">Environment</p>
                  <p className="font-medium truncate">{selected.environment}</p>
                </div>
                <div className="shrink-0">
                  <StatusBadge
                    status={selectedState?.status ?? "DISCONNECTED"}
                  />
                </div>
              </div>
              {selected.configurationFields.length ? (
                <div className="space-y-3">
                  {selected.configurationFields.map(field => (
                    <Field
                      key={field}
                      label={field}
                      hint="Never stored or transmitted"
                    >
                      <Input
                        type={
                          /(secret|token|key|password)/i.test(field)
                            ? "password"
                            : "text"
                        }
                        autoComplete="off"
                        value={credentialDraft[field] ?? ""}
                        onChange={event =>
                          setCredentialDraft(current => ({
                            ...current,
                            [field]: event.target.value,
                          }))
                        }
                        placeholder={
                          selectedState?.configured
                            ? "•••••••• (configured placeholder)"
                            : "Enter for this preview only"
                        }
                      />
                    </Field>
                  ))}
                </div>
              ) : (
                <p className="rounded-lg bg-success/10 p-3 text-sm text-success-foreground">
                  Local service is available and requires no credentials.
                </p>
              )}
              <label className="flex items-center justify-between rounded-lg border p-3">
                <span>
                  <span className="block text-sm font-medium">Enabled</span>
                  <span className="block text-xs text-muted-foreground">
                    Controls preview routing only
                  </span>
                </span>
                <input
                  type="checkbox"
                  className="size-4"
                  checked={selectedState?.enabled ?? false}
                  disabled={selected.lockedConnected}
                  onChange={event => {
                    patchProvider(selected.id, {
                      enabled: event.target.checked,
                    });
                    addLog(
                      selected.id,
                      "INFO",
                      event.target.checked
                        ? "Provider enabled for preview routing."
                        : "Provider disabled for preview routing."
                    );
                  }}
                />
              </label>
              <div className="flex flex-wrap gap-2">
                <Button
                  onClick={connect}
                  disabled={
                    selected.lockedConnected ||
                    (!selectedState?.configured &&
                      selected.configurationFields.length > 0 &&
                      Object.values(credentialDraft).every(
                        value => !value.trim()
                      ))
                  }
                >
                  <CheckCircle2 />
                  {selectedState?.configured
                    ? "Update preview"
                    : "Connect preview"}
                </Button>
                <Button
                  variant="outline"
                  onClick={test}
                  disabled={selectedState?.status === "TESTING"}
                >
                  <RefreshCw
                    className={cn(
                      selectedState?.status === "TESTING" && "animate-spin"
                    )}
                  />
                  Test connection
                </Button>
                {!selected.lockedConnected && selectedState?.configured ? (
                  <Button
                    variant="outline"
                    onClick={() => {
                      patchProvider(selected.id, {
                        configured: false,
                        enabled: false,
                        status: "DISCONNECTED",
                      });
                      addLog(
                        selected.id,
                        "INFO",
                        "Preview provider disconnected."
                      );
                    }}
                  >
                    Disconnect
                  </Button>
                ) : null}
              </div>
              {selectedState?.lastCheckedAt ? (
                <p className="text-xs text-muted-foreground">
                  Last simulated check:{" "}
                  {formatDateTime(selectedState.lastCheckedAt)}
                </p>
              ) : null}
            </div>
          </Panel>
          <Panel
            title="Primary and fallback routing"
            description="These selections persist as demo state only."
          >
            <div className="space-y-3">
              {Object.entries(state.routes).map(([route, value]) => {
                const candidates = INTEGRATION_PROVIDERS.filter(provider =>
                  route === "whatsapp"
                    ? provider.id.startsWith("whatsapp")
                    : route === "sms"
                      ? provider.id.startsWith("sms")
                      : route === "ocr"
                        ? provider.category === "OCR"
                        : provider.id === "pacs-dicomweb" ||
                          provider.id === "fhir-r4"
                );
                return (
                  <div key={route} className="rounded-lg border p-3">
                    <p className="mb-2 text-sm font-medium">
                      {humanize(route)}
                    </p>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <Field label="Primary">
                        <select
                          className="h-9 w-full rounded-lg border bg-surface px-2 text-sm"
                          value={value.primary}
                          onChange={event =>
                            update(current => ({
                              ...current,
                              routes: {
                                ...current.routes,
                                [route]: {
                                  ...(current.routes[route] ?? {
                                    primary: event.target.value,
                                  }),
                                  primary: event.target.value,
                                },
                              },
                            }))
                          }
                        >
                          {candidates.map(provider => (
                            <option key={provider.id} value={provider.id}>
                              {provider.name}
                            </option>
                          ))}
                        </select>
                      </Field>
                      <Field label="Fallback">
                        <select
                          className="h-9 w-full rounded-lg border bg-surface px-2 text-sm"
                          value={value.fallback ?? ""}
                          onChange={event =>
                            update(current => ({
                              ...current,
                              routes: {
                                ...current.routes,
                                [route]: {
                                  ...(current.routes[route] ?? {
                                    primary: value.primary,
                                  }),
                                  fallback: event.target.value || undefined,
                                },
                              },
                            }))
                          }
                        >
                          <option value="">None</option>
                          {candidates
                            .filter(provider => provider.id !== value.primary)
                            .map(provider => (
                              <option key={provider.id} value={provider.id}>
                                {provider.name}
                              </option>
                            ))}
                        </select>
                      </Field>
                    </div>
                  </div>
                );
              })}
            </div>
          </Panel>
          <Panel
            title="Simulated activity"
            actions={<Activity className="size-4 text-muted-foreground" />}
          >
            <div
              className="max-h-80 space-y-2 overflow-auto"
              aria-live="polite"
            >
              {state.logs.length ? (
                state.logs.map(log => (
                  <div key={log.id} className="rounded-lg border p-2">
                    <div className="flex justify-between gap-2">
                      <span
                        className={cn(
                          "text-xs font-semibold",
                          log.outcome === "ERROR"
                            ? "text-error-foreground"
                            : log.outcome === "SUCCESS"
                              ? "text-success-foreground"
                              : "text-muted-foreground"
                        )}
                      >
                        {log.outcome}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {formatDateTime(log.at)}
                      </span>
                    </div>
                    <p className="mt-1 text-sm">{log.message}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {INTEGRATION_PROVIDERS.find(
                        provider => provider.id === log.providerId
                      )?.name ?? log.providerId}
                    </p>
                  </div>
                ))
              ) : (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  No preview activity yet.
                </p>
              )}
            </div>
          </Panel>
        </div>
      </div>
    </PageShell>
  );
}
