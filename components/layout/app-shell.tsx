"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";

import { Loader2Icon } from "@/components/icons";
import { NoAccess } from "@/components/shared/page";
import { Button } from "@/components/ui/button";
import { SidebarProvider } from "@/components/ui/sidebar";
import { prepareData, type DataMode } from "@/lib/api/data-source";
import { moduleForPath } from "@/lib/navigation";
import { MODULE_LABEL } from "@/lib/rbac";
import { useSession } from "@/lib/session";

import { AppHeader } from "./app-header";
import { AppSidebar } from "./app-sidebar";
import { CommandPaletteProvider } from "./command-palette";

function BootScreen({
  message,
  detail,
  failed = false,
}: {
  message: string;
  detail: string;
  failed?: boolean;
}) {
  return (
    <div className="flex h-svh w-full items-center justify-center bg-background px-6 text-center">
      <div role={failed ? "alert" : "status"} aria-live="polite">
        {failed ? null : (
          <Loader2Icon className="mx-auto size-5 animate-spin text-muted-foreground" />
        )}
        <p className="mt-3 text-sm font-medium text-foreground">{message}</p>
        <p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">
          {detail}
        </p>
        {failed ? (
          <Button
            className="mt-4"
            variant="outline"
            onClick={() => window.location.reload()}
          >
            Try again
          </Button>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Browser mode replays the hospital on first visit; server mode only needs
 * to learn where the data lives.
 */
function useDataReady() {
  const [state, setState] = React.useState<{
    mode: DataMode | null;
    failed: string | null;
  }>({ mode: null, failed: null });
  React.useEffect(() => {
    let cancelled = false;
    // Give the boot screen a frame to paint before a first-run seed.
    const timer = setTimeout(() => {
      prepareData()
        .then(
          config => !cancelled && setState({ mode: config.mode, failed: null })
        )
        .catch(
          error =>
            !cancelled &&
            setState({
              mode: null,
              failed: error instanceof Error ? error.message : String(error),
            })
        );
    }, 30);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);
  return state;
}

/**
 * Loads the simulation, sends signed-out visitors to the role picker, gates
 * every module by role, and frames the page in the Ralli Wolf layout.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { mode, failed } = useDataReady();
  const dbReady = mode !== null;
  const {
    staff,
    ready: sessionReady,
    error: sessionError,
    canAccess,
  } = useSession();
  const [mobileSidebarOpen, setMobileSidebarOpen] = React.useState(false);
  const isLogin = pathname === "/login";

  React.useEffect(() => setMobileSidebarOpen(false), [pathname]);

  React.useEffect(() => {
    if (!dbReady || !sessionReady || sessionError || isLogin) return;
    if (!staff) router.replace("/login");
  }, [dbReady, sessionReady, sessionError, staff, isLogin, router]);

  if (failed)
    return (
      <BootScreen
        failed
        message="The simulation could not start"
        detail={failed}
      />
    );
  if (sessionError)
    return (
      <BootScreen
        failed
        message="The hospital database is not available"
        detail={sessionError}
      />
    );
  if (!dbReady || !sessionReady) {
    return (
      <BootScreen
        message={
          mode === "server"
            ? "Connecting to the hospital database…"
            : "Preparing the hospital simulation…"
        }
        detail={
          mode === "server"
            ? "Signing you in to the shared hospital record."
            : "On first visit, 30 days of hospital activity are replayed in your browser. This takes a few seconds."
        }
      />
    );
  }
  if (isLogin)
    return <div className="h-svh w-full overflow-y-auto">{children}</div>;
  if (!staff)
    return (
      <BootScreen
        message="Returning to sign in…"
        detail="Choose a role to continue."
      />
    );

  const pageModule = moduleForPath(pathname);
  const allowed = !pageModule || canAccess(pageModule);

  return (
    <SidebarProvider>
      <CommandPaletteProvider onNavigate={() => setMobileSidebarOpen(false)}>
        <div className="relative mx-auto flex h-full max-w-screen-3xl overflow-hidden bg-background">
          {mobileSidebarOpen && (
            <button
              type="button"
              aria-label="Close navigation"
              className="fixed inset-0 z-[60] bg-overlay backdrop-blur-[1px] lg:hidden"
              onClick={() => setMobileSidebarOpen(false)}
            />
          )}
          <div
            className={`no-print fixed inset-y-0 z-[70] h-full shrink-0 transition-[left] duration-200 lg:static lg:left-auto lg:z-auto ${
              mobileSidebarOpen ? "left-0" : "-left-[16rem]"
            }`}
          >
            <AppSidebar onRequestClose={() => setMobileSidebarOpen(false)} />
          </div>
          <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
            <AppHeader onMenuClick={() => setMobileSidebarOpen(true)} />
            <main className="app-content flex-1 overflow-y-auto bg-background">
              {allowed ? (
                children
              ) : (
                <NoAccess
                  module={pageModule ? MODULE_LABEL[pageModule] : "this page"}
                />
              )}
            </main>
          </div>
        </div>
      </CommandPaletteProvider>
    </SidebarProvider>
  );
}
