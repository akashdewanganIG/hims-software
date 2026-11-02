"use client";

import * as React from "react";
import {
  createDefaultIntegrationsPreviewState,
  INTEGRATIONS_PREVIEW_KEY,
  INTEGRATIONS_PREVIEW_VERSION,
  type IntegrationLog,
  type IntegrationsPreviewState,
} from "@/lib/integrations-preview";

export function useIntegrationsPreview() {
  const [state, setState] = React.useState<IntegrationsPreviewState>(
    createDefaultIntegrationsPreviewState
  );
  const [ready, setReady] = React.useState(false);

  React.useEffect(() => {
    try {
      const stored = JSON.parse(
        localStorage.getItem(INTEGRATIONS_PREVIEW_KEY) ?? "null"
      ) as IntegrationsPreviewState | null;
      if (stored?.version === INTEGRATIONS_PREVIEW_VERSION) setState(stored);
    } catch {
      localStorage.removeItem(INTEGRATIONS_PREVIEW_KEY);
    }
    setReady(true);
  }, []);

  React.useEffect(() => {
    if (ready)
      localStorage.setItem(INTEGRATIONS_PREVIEW_KEY, JSON.stringify(state));
  }, [ready, state]);

  const update = React.useCallback(
    (
      producer: (current: IntegrationsPreviewState) => IntegrationsPreviewState
    ) => setState(current => producer(current)),
    []
  );
  const addLog = React.useCallback(
    (
      providerId: string,
      outcome: IntegrationLog["outcome"],
      message: string
    ) => {
      update(current => ({
        ...current,
        logs: [
          {
            id: crypto.randomUUID(),
            providerId,
            at: new Date().toISOString(),
            outcome,
            message,
          },
          ...current.logs,
        ].slice(0, 100),
      }));
    },
    [update]
  );

  return {
    state,
    ready,
    update,
    addLog,
    reset: () => setState(createDefaultIntegrationsPreviewState()),
  };
}
