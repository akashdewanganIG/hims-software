/**
 * Where the screens' data comes from. The server says which mode it runs in:
 *
 *   server  — PostgreSQL is the system of record. Views and operations are
 *             HTTP calls; the session is an httpOnly cookie.
 *   browser — no database configured. The hospital lives in this browser
 *             (IndexedDB) and views/operations run locally.
 *
 * Both modes execute the same view and operation registries, so validation,
 * permissions and business rules are identical. The browser sandbox (seed,
 * store, registries) is loaded on demand, so server-mode pages never
 * download it.
 */
import { OperationError, type OperationErrorCode } from "../ops/errors";
import type { SessionData } from "../views/system";

export type DataMode = "browser" | "server";

/** Root of every React Query key the app uses. */
export const ROOT_KEY = "hims";

export interface AppConfig {
  mode: DataMode;
  resetAllowed: boolean;
  problems: string[];
}

const BROWSER_ONLY: AppConfig = {
  mode: "browser",
  resetAllowed: true,
  problems: [],
};

let configPromise: Promise<AppConfig> | null = null;
let resolvedMode: DataMode | null = null;

/** Asks the server once; a static host without the API means browser mode. */
export function loadConfig(): Promise<AppConfig> {
  configPromise ??= fetch("/api/config", { cache: "no-store" })
    .then(async response =>
      response.ok ? ((await response.json()) as AppConfig) : BROWSER_ONLY
    )
    .catch(() => BROWSER_ONLY)
    .then(config => {
      resolvedMode = config.mode;
      return config;
    });
  return configPromise;
}

export function dataMode(): DataMode | null {
  return resolvedMode;
}

/** The browser sandbox, loaded only in browser mode. */
async function sandbox() {
  const [store, views, system] = await Promise.all([
    import("../sim/store"),
    import("../views/execute"),
    import("../views/system"),
  ]);
  const db = await store.loadDatabase();
  return { store, views, system, db };
}

const STATUS_CODE: Record<number, OperationErrorCode> = {
  400: "INVALID_INPUT",
  401: "UNAUTHENTICATED",
  403: "FORBIDDEN",
  404: "UNKNOWN_OPERATION",
  409: "CONFLICT",
  422: "RULE_VIOLATION",
  503: "UNAVAILABLE",
};

async function request<T>(url: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      cache: "no-store",
      credentials: "same-origin",
      headers: init.body ? { "Content-Type": "application/json" } : undefined,
    });
  } catch {
    throw new OperationError(
      "UNAVAILABLE",
      "The hospital server could not be reached. Check your connection and try again."
    );
  }
  const body = (await response.json().catch(() => null)) as
    (T & { error?: { code?: OperationErrorCode; message?: string } }) | null;
  if (!response.ok) {
    throw new OperationError(
      body?.error?.code ?? STATUS_CODE[response.status] ?? "INTERNAL",
      body?.error?.message ?? `The server answered ${response.status}.`
    );
  }
  return body as T;
}

const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const json = <T>(value: T): T =>
  value === undefined ? value : (JSON.parse(JSON.stringify(value)) as T);

/* ------------------------------------------------------------------ */
/* Views and operations                                                */
/* ------------------------------------------------------------------ */

export async function fetchView(
  name: string,
  params: unknown,
  userId: string | null
): Promise<unknown> {
  const { mode } = await loadConfig();
  if (mode === "server") {
    const query = new URLSearchParams({ params: JSON.stringify(params ?? {}) });
    const body = await request<{ data: unknown }>(
      `/api/views/${encodeURIComponent(name)}?${query}`
    );
    return body.data;
  }
  const { views, db } = await sandbox();
  await pause(40);
  const view = views.prepareView(db, userId, name, params);
  // Plain JSON, exactly what the server would send.
  return json(view.run(db, new Date()) ?? null);
}

/** The latest data version this browser has seen (server mode). */
export const seenVersion = { epoch: "", version: -1 };

export async function performOperation(
  name: string,
  input: unknown,
  userId: string | null
): Promise<unknown> {
  const { mode } = await loadConfig();
  if (mode === "server") {
    const body = await request<{
      result: unknown;
      epoch: string;
      version: number;
    }>(`/api/ops/${encodeURIComponent(name)}`, {
      method: "POST",
      body: JSON.stringify({ input }),
    });
    seenVersion.epoch = body.epoch;
    seenVersion.version = body.version;
    return body.result;
  }
  const { store } = await sandbox();
  await pause(80);
  return store.runLocalOperation(userId, name, input);
}

/** Browser mode: re-run `listener` when the local sandbox changes. */
export function onLocalChange(listener: () => void): () => void {
  let unsubscribe: (() => void) | null = null;
  let cancelled = false;
  void loadConfig().then(async ({ mode }) => {
    if (mode !== "browser" || cancelled) return;
    const store = await import("../sim/store");
    if (!cancelled) unsubscribe = store.subscribe(listener);
  });
  return () => {
    cancelled = true;
    unsubscribe?.();
  };
}

/** Browser mode replays the hospital on first visit; server mode is instant. */
export async function prepareData(): Promise<AppConfig> {
  const config = await loadConfig();
  if (config.mode === "browser") await sandbox();
  return config;
}

/* ------------------------------------------------------------------ */
/* Session                                                             */
/* ------------------------------------------------------------------ */

const USER_KEY = "hims-sim:user";

export type { SessionData };

function readLocalUser() {
  try {
    return localStorage.getItem(USER_KEY);
  } catch {
    return null;
  }
}

export async function fetchSession(): Promise<SessionData | null> {
  const { mode } = await loadConfig();
  if (mode === "server") {
    const body = await request<{ session: SessionData | null }>("/api/session");
    return body.session;
  }
  const { system, db } = await sandbox();
  return json(system.sessionView(db, readLocalUser()));
}

export async function startSession(userId: string): Promise<SessionData> {
  const { mode } = await loadConfig();
  let session: SessionData | null;
  if (mode === "server") {
    session = (
      await request<{ session: SessionData }>("/api/session", {
        method: "POST",
        body: JSON.stringify({ userId }),
      })
    ).session;
  } else {
    const { system, db } = await sandbox();
    session = json(system.sessionView(db, userId));
    if (!session)
      throw new OperationError(
        "UNAUTHENTICATED",
        "That login is not available."
      );
  }
  try {
    localStorage.setItem(USER_KEY, userId);
  } catch {
    // Private mode: the browser-mode session won't survive a reload.
  }
  return session;
}

export async function endSession() {
  try {
    localStorage.removeItem(USER_KEY);
  } catch {
    // ignore
  }
  const { mode } = await loadConfig();
  if (mode === "server")
    await request("/api/session", { method: "DELETE" }).catch(() => null);
}

/* ------------------------------------------------------------------ */
/* Simulation status                                                   */
/* ------------------------------------------------------------------ */

export interface DataStatus {
  mode: DataMode;
  anchoredAt: string;
  userChanges: number;
  version?: number;
  epoch?: string;
}

export async function fetchStatus(): Promise<DataStatus> {
  const { mode } = await loadConfig();
  if (mode === "server") {
    const body = await request<{
      epoch: string;
      version: number;
      anchoredAt: string;
      userChanges: number;
    }>("/api/sync/version");
    return { mode, ...body };
  }
  const { store } = await sandbox();
  return { mode, ...store.simulationInfo() };
}

export async function resetData() {
  const { mode } = await loadConfig();
  if (mode === "server") {
    const body = await request<{ epoch: string; version: number }>(
      "/api/admin/reset",
      { method: "POST", body: "{}" }
    );
    seenVersion.epoch = body.epoch;
    seenVersion.version = body.version;
    return;
  }
  const { store } = await sandbox();
  await store.resetSimulation();
}
