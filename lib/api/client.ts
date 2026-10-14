"use client";

import * as React from "react";
import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryOptions,
} from "@tanstack/react-query";

import type {
  OperationInput,
  OperationName,
  OperationResult,
} from "../ops/registry";
import { markFresh } from "../fresh";
import { useSession } from "../session";
import { toast } from "../toast";
import type { ViewName, ViewParams, ViewResult } from "../views/registry";
import {
  ROOT_KEY,
  dataMode,
  fetchStatus,
  fetchView,
  performOperation,
  seenVersion,
} from "./data-source";

export { ROOT_KEY };

/**
 * The data-access layer, as in Ralli Wolf: screens read through `useView` (a
 * React Query query over a named, role-checked view) and write through
 * `useAction` (a named, validated domain operation). Whether the data lives
 * in PostgreSQL or in this browser is decided by the server; screens do not
 * know or care.
 */
export function useView<N extends ViewName>(
  name: N,
  params: ViewParams<N>,
  options: Pick<
    UseQueryOptions<ViewResult<N>>,
    "enabled" | "refetchInterval" | "placeholderData"
  > = {}
) {
  const { user, ready } = useSession();
  const userId = user?.id ?? null;
  const open = name === "session.directory";
  return useQuery<ViewResult<N>>({
    queryKey: [ROOT_KEY, "view", name, userId, params],
    queryFn: () => fetchView(name, params, userId) as Promise<ViewResult<N>>,
    staleTime: 15_000,
    ...options,
    enabled: (options.enabled ?? true) && ready && (open || Boolean(userId)),
  });
}

/**
 * An uploaded file's content (a photo, a scanned document). A file never
 * changes once stored — a replacement is a new file — so its content is
 * cached apart from the views that writes and server sync refresh.
 */
function storedFileQuery(userId: string | null, fileId: string) {
  return {
    queryKey: ["hims-file", userId, fileId],
    queryFn: () =>
      fetchView("files.get", { id: fileId }, userId) as Promise<
        ViewResult<"files.get">
      >,
    staleTime: Infinity,
    gcTime: 10 * 60_000,
  };
}

export function useStoredFile(fileId: string | undefined) {
  const { user, ready } = useSession();
  const userId = user?.id ?? null;
  return useQuery({
    ...storedFileQuery(userId, fileId ?? ""),
    enabled: Boolean(fileId) && ready && Boolean(userId),
  });
}

/** Loads files on demand (e.g. photos to embed in a PDF), through the same cache. */
export function useFileLoader() {
  const queryClient = useQueryClient();
  const { user } = useSession();
  const userId = user?.id ?? null;
  return React.useCallback(
    (fileId: string) => queryClient.fetchQuery(storedFileQuery(userId, fileId)),
    [queryClient, userId]
  );
}

/**
 * Writes that add a record, and the ids it shows under on screen: each is
 * highlighted (scrolled to and flashed green) as it appears. See lib/fresh.
 */
const ADDS: {
  [N in OperationName]?: (
    result: OperationResult<N>
  ) => Array<string | undefined> | string | undefined;
} = {
  "alerts.send": r => r.id,
  "patient.register": r => r.id,
  "enquiry.create": r => r.id,
  "enquiry.followUp": r => r.followUpId,
  "enquiry.convert": r => r.id,
  "appointment.book": r => r.id,
  "appointment.walkIn": r => [r.appointment.id, r.encounter.id],
  "rx.create": r => r.id,
  "lab.order": r => r.id,
  // The new batch, and its medicine's row in the inventory list.
  "pharmacy.receiveStock": r => [r.id, r.medicineId],
  "pharmacy.counterSale": r => [r.invoiceId, ...r.transactions.map(t => t.id)],
  "pharmacy.createMedicine": r => r.id,
  "ipd.admit": r => r.id,
  "ipd.addNote": r => r.id,
  "ipd.addCareOrder": r => r.id,
  "beds.createWard": r => r.id,
  "beds.createRoom": r => r.id,
  "billing.collect": r => r.id,
  "billing.refund": r => r.id,
  "billing.addCharge": r => r.id,
  "document.add": r => r.id,
  "complaint.log": r => r.id,
  "complaint.addNote": r => r.noteId,
  "complaint.attachPhoto": r => r.fileId,
  "feedback.submit": r => r.id,
  "wfm.createStaff": r => r.id,
  "admin.createUser": r => r.id,
  "admin.createRole": r => r.id,
};

export function useAction<N extends OperationName, V = void>(
  name: N,
  build: (vars: V) => OperationInput<N>,
  options: {
    success?: string | ((result: OperationResult<N>, vars: V) => string);
    errorTitle?: string;
    onSuccess?: (result: OperationResult<N>, vars: V) => void;
    /** Audit-only writes: no refresh, no toasts. */
    silent?: boolean;
  } = {}
) {
  const queryClient = useQueryClient();
  const { user, refresh } = useSession();
  return useMutation<OperationResult<N>, Error, V>({
    mutationFn: async vars => {
      if (!user) throw new Error("Sign in to make changes.");
      return (await performOperation(
        name,
        build(vars),
        user.id
      )) as OperationResult<N>;
    },
    onSuccess: (result, vars) => {
      if (!options.silent)
        void queryClient.invalidateQueries({ queryKey: [ROOT_KEY] });
      // Users, roles, permissions and staff records (name, designation,
      // photo) may include the signed-in login's own.
      if (name.startsWith("admin.") || name.startsWith("wfm.")) void refresh();
      const message =
        typeof options.success === "function"
          ? options.success(result, vars)
          : options.success;
      if (message) toast.success(message);
      if (!options.silent) markFresh(ADDS[name]?.(result));
      options.onSuccess?.(result, vars);
    },
    onError: error => {
      if (!options.silent) toast.error(error, options.errorTitle);
    },
  });
}

/**
 * Server mode: notices when anyone else changes the hospital (the data
 * version moves) and refetches what is on screen. Polls while the tab is
 * visible and whenever it regains focus.
 */
export function useServerSync(intervalMs = 5_000) {
  const queryClient = useQueryClient();
  const { user, refresh } = useSession();
  const signedIn = Boolean(user);
  React.useEffect(() => {
    if (!signedIn) return;
    let stopped = false;
    const tick = async () => {
      if (stopped || dataMode() !== "server") return;
      if (document.visibilityState === "hidden") return;
      try {
        const status = await fetchStatus();
        const first = seenVersion.version === -1;
        const moved =
          status.epoch !== seenVersion.epoch ||
          status.version !== seenVersion.version;
        seenVersion.epoch = status.epoch ?? "";
        seenVersion.version = status.version ?? 0;
        if (moved && !first) {
          void queryClient.invalidateQueries({ queryKey: [ROOT_KEY, "view"] });
          // Someone may have changed this login's role or permissions.
          void refresh();
        }
      } catch {
        // Offline or restarting: try again on the next tick.
      }
    };
    const timer = setInterval(() => void tick(), intervalMs);
    const onFocus = () => void tick();
    window.addEventListener("focus", onFocus);
    void tick();
    return () => {
      stopped = true;
      clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [signedIn, queryClient, intervalMs, refresh]);
}
