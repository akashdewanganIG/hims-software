"use client";

import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";

import {
  ROOT_KEY,
  endSession,
  fetchSession,
  onLocalChange,
  startSession,
  type SessionData,
} from "./api/data-source";
import {
  accessFromList,
  can as canDo,
  canAccess as canOpen,
  type Action,
  type Module,
} from "./rbac";
import type { Staff, User } from "./sim/schema";
import { errorMessage } from "./toast";

interface SessionValue {
  user: User | null;
  staff: Staff | null;
  /** The login's access role (name for display, id for links). */
  role: SessionData["role"] | null;
  /** Where this login lands after signing in. */
  home: string;
  /** The signed-in staff member's photo, when one is on file. */
  photoFileId?: string;
  /** The session has been resolved (signed in or not). */
  ready: boolean;
  /** Why the session could not be resolved (e.g. the database is down). */
  error: string | null;
  signIn: (userId: string) => Promise<SessionData>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
  can: (action: Action) => boolean;
  canAccess: (module: Module) => boolean;
}

const SessionContext = React.createContext<SessionValue | null>(null);

interface State {
  ready: boolean;
  session: SessionData | null;
  error: string | null;
}

/**
 * Simulation sign-in: pick a staff login, no passwords. In server mode the
 * choice becomes a signed httpOnly session cookie and every request is
 * authorised on the server; in browser mode it is remembered per browser.
 * Access (role permissions or a custom set) is re-read whenever the data
 * changes, so an administrator's edits reach signed-in users at once.
 */
export function SessionProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const [state, setState] = React.useState<State>({
    ready: false,
    session: null,
    error: null,
  });

  const refresh = React.useCallback(async () => {
    try {
      const session = await fetchSession();
      setState(current =>
        current.ready &&
        !current.error &&
        JSON.stringify(current.session) === JSON.stringify(session)
          ? current
          : { ready: true, session, error: null }
      );
    } catch (error) {
      setState(current => ({
        ready: true,
        session: current.session,
        error: errorMessage(error),
      }));
    }
  }, []);

  React.useEffect(() => {
    void refresh();
    // Browser mode: pick up changes to the signed-in login or a reset.
    return onLocalChange(() => void refresh());
  }, [refresh]);

  const value = React.useMemo<SessionValue>(() => {
    const session = state.session;
    const access = session ? accessFromList(session.access) : undefined;
    return {
      user: session?.user ?? null,
      staff: session?.staff ?? null,
      role: session?.role ?? null,
      home: session?.home ?? "/",
      photoFileId: session?.photoFileId,
      ready: state.ready,
      error: state.error,
      signIn: async userId => {
        const next = await startSession(userId);
        queryClient.removeQueries({ queryKey: [ROOT_KEY] });
        setState({ ready: true, session: next, error: null });
        return next;
      },
      signOut: async () => {
        await endSession();
        queryClient.removeQueries({ queryKey: [ROOT_KEY] });
        setState({ ready: true, session: null, error: null });
      },
      refresh,
      can: action => canDo(access, action),
      canAccess: module => canOpen(access, module),
    };
  }, [state, refresh, queryClient]);

  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  );
}

export function useSession() {
  const value = React.useContext(SessionContext);
  if (!value)
    throw new Error("useSession must be used inside <SessionProvider>");
  return value;
}
